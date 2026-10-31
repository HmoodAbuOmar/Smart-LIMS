package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.labtests.dto.*;
import com.smartlims.labtests.service.TestParameterService;
import com.smartlims.laboratory.service.LaboratoryAccess;
import com.smartlims.laboratory.exception.LaboratoryException;

import java.util.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class LaboratoryFoundationTest extends LaboratoryTestSupport {
    @Autowired
    TestParameterService parameters;
    @Autowired
    LaboratoryAccess access;

    @Test
    void definitionsReuseExistingCatalogIdentityWithStableCodesAndStrictRoles() throws Exception {
        String path = "/api/lab-tests/" + first.getId() + "/parameters";
        var response = mvc.perform(bearer(post(path), Role.ADMIN).contentType("application/json").content("{\"code\":\" synth \",\"name\":\"Synthetic parameter\",\"resultType\":\"NUMERIC\",\"unit\":\"synthetic-unit\",\"displayOrder\":0,\"required\":true,\"active\":true}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.labTestId").value(first.getId().toString())).andExpect(jsonPath("$.code").value("SYNTH")).andReturn().getResponse();
        var id = json.readTree(response.getContentAsString()).get("id").asString();
        mvc.perform(bearer(get(path), Role.LAB_TECHNICIAN)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        error(mvc.perform(bearer(get(path), Role.PATIENT)), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(post(path), Role.LAB_TECHNICIAN).contentType("application/json").content("{}")), 403, "FORBIDDEN", null);
        var body = new TestParameterRequest("SYNTH", "Synthetic text", "TEXT", null, null, 1, false, false, 0L);
        var updated = parameters.save(actor(Role.ADMIN), first.getId().toString(), id, body);
        assertEquals(1, updated.version());
        assertFalse(updated.active());
        assertEquals("PARAMETER_CHANGED", assertThrows(LaboratoryException.class, () -> parameters.save(actor(Role.ADMIN), first.getId().toString(), id, body)).getCode());
    }

    @Test
    void clinicalReviewerAuthorityIsExplicitAndRequiresCurrentEligibleAdmin() {
        assertThrows(LaboratoryException.class, () -> access.reviewer(actor(Role.ADMIN)));
        assertThrows(LaboratoryException.class, () -> access.clinical(actor(Role.ADMIN)));
        assertEquals(reviewerId, access.reviewer(actor(reviewerId, Role.ADMIN)).getId());
        assertEquals(actors.get(Role.LAB_TECHNICIAN).getId(), access.clinical(actor(Role.LAB_TECHNICIAN)).getId());
        jdbc.update("UPDATE users SET role='RECEPTIONIST' WHERE id=?", reviewerId);
        assertThrows(LaboratoryException.class, () -> access.reviewer(actor(reviewerId, Role.ADMIN)));
        jdbc.update("UPDATE users SET role='ADMIN',enabled=false WHERE id=?", reviewerId);
        assertEquals("UNAUTHORIZED", assertThrows(LaboratoryException.class, () -> access.reviewer(actor(reviewerId, Role.ADMIN))).getCode());
    }

    @Test
    void duplicateUnknownWrongTypeAndCrossTestParameterInputsFail() throws Exception {
        var request = new TestParameterRequest("SYN", "Synthetic parameter", "TEXT", null, null, 0, true, true, null);
        var p = parameters.save(actor(Role.ADMIN), first.getId().toString(), null, request);
        assertEquals("PARAMETER_CODE_CONFLICT", assertThrows(LaboratoryException.class, () -> parameters.save(actor(Role.ADMIN), first.getId().toString(), null, request)).getCode());
        assertEquals("PARAMETER_NOT_FOUND", assertThrows(LaboratoryException.class, () -> parameters.save(actor(Role.ADMIN), free.getId().toString(), p.id().toString(), new TestParameterRequest("SYN", "Synthetic parameter", "TEXT", null, null, 0, true, true, 0L))).getCode());
        String path = "/api/lab-tests/" + first.getId() + "/parameters";
        error(mvc.perform(bearer(post(path), Role.ADMIN).contentType("application/json").content("{\"code\":\"S\",\"name\":\"Synthetic\",\"resultType\":\"TEXT\",\"displayOrder\":\"0\",\"required\":true,\"active\":true}")), 400, "INVALID_JSON", null);
        error(mvc.perform(bearer(get(path).param("includeInactive", "true", "false"), Role.ADMIN)), 400, "VALIDATION_ERROR", "includeInactive");
    }

    @Test
    void freshClinicalTablesHaveNoSeedDefinitionsAndRetainedForeignKeys() {
        for (String table : List.of("test_parameters", "visits", "samples", "test_results", "result_values", "laboratory_events"))
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class));
        var p = parameters.save(actor(Role.ADMIN), first.getId().toString(), null, new TestParameterRequest("SYN", "Synthetic", "NUMERIC", null, null, 0, true, true, null));
        assertEquals(first.getId(), jdbc.queryForObject("SELECT lab_test_id FROM test_parameters WHERE id=?", UUID.class, p.id()));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class, () -> jdbc.update("DELETE FROM lab_tests WHERE id=?", first.getId()));
    }

    @Test
    void usedParametersRetainTheirClinicalDefinitionButCanBeDeactivated() {
        var p = parameters.save(actor(Role.ADMIN), first.getId().toString(), null, new TestParameterRequest("SYN", "Synthetic", "NUMERIC", "u", null, 0, true, true, null));
        var order = create(own, first);
        UUID result = UUID.randomUUID();
        jdbc.update("INSERT INTO test_results(id,order_item_id,status,version_number,entered_by,idempotency_key,request_hash) VALUES (?,?,'DRAFT',1,?,?,repeat('a',64))", result, order.items().getFirst().id(), actors.get(Role.LAB_TECHNICIAN).getId(), UUID.randomUUID());
        jdbc.update("INSERT INTO result_values(id,result_id,parameter_id,parameter_code_snapshot,parameter_name_snapshot,result_type_snapshot,display_order_snapshot,is_required_snapshot) VALUES (?,?,?,'SYN','Synthetic','NUMERIC',0,true)", UUID.randomUUID(), result, p.id());
        assertEquals("PARAMETER_IN_USE", assertThrows(LaboratoryException.class, () -> parameters.save(actor(Role.ADMIN), first.getId().toString(), p.id().toString(), new TestParameterRequest("SYN", "Changed", "NUMERIC", "u", null, 0, true, true, 0L))).getCode());
        assertFalse(parameters.save(actor(Role.ADMIN), first.getId().toString(), p.id().toString(), new TestParameterRequest("SYN", "Synthetic", "NUMERIC", "u", null, 0, true, false, 0L)).active());
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class, () -> jdbc.update("UPDATE result_values SET text_value='Wrong type' WHERE result_id=?", result));
    }
}
