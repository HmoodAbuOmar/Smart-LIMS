package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.labtests.entity.LabTest;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.orders.dto.OrderDetailResponse;
import com.smartlims.patients.entity.Patient;
import com.smartlims.results.dto.*;
import com.smartlims.samples.dto.*;
import com.smartlims.visits.dto.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

abstract class MedicalHistoryTestSupport extends LaboratoryTestSupport {
    record Fixture(OrderDetailResponse order, VisitResponse visit, SampleResponse sample, ResultResponse result) {
    }

    Fixture measurement(Patient patient, LabTest test, String at, String number, String flag, boolean complete) {
        return measurement(patient, test, at, number, flag, complete, "SYNTHETIC", null, null);
    }

    Fixture measurement(Patient patient, LabTest test, String at, String number, String flag, boolean complete,
                        String sampleType, String container, String comparator) {
        if (jdbc.queryForObject("SELECT count(*) FROM test_parameters WHERE lab_test_id=?", Integer.class, test.getId()) == 0)
            define(test.getId());
        var order = create(patient, test);
        var visit = visitService.arrive(actor(Role.RECEPTIONIST), new VisitRequests.Arrival(order.id().toString(), null,
                order.items().stream().map(i -> i.id().toString()).toList(), Instant.parse(at).minusSeconds(3600).toString()), keys()).visit();
        var sample = specimen(visit, order.items().getFirst().id(), at, sampleType, container);
        var result = draftService.create(actor(Role.LAB_TECHNICIAN), new ResultRequests.Create(order.items().getFirst().id().toString()), keys()).result();
        result = fill(result, List.of(sample.id()), at, number, flag, comparator);
        if (complete)
            close(visit);
        return new Fixture(order, visit, sample, result);
    }

    SampleResponse specimen(VisitResponse visit, UUID item, String at, String type, String container) {
        var sample = sampleService.create(actor(Role.LAB_TECHNICIAN), new SampleRequests.Create(visit.id().toString(), type,
                container, Instant.parse(at).minusSeconds(600).toString(), null), keys()).sample();
        sampleService.receive(actor(Role.LAB_TECHNICIAN), sample.id().toString(), new SampleRequests.Revision(sample.version()));
        return sampleService.attest(actor(Role.LAB_TECHNICIAN), sample.id().toString(), new SampleRequests.Attest(item.toString()));
    }

    ResultResponse fill(ResultResponse result, List<UUID> specimens, String at, String number, String flag, String comparator) {
        var values = result.values().stream().map(v -> new ResultRequests.Value(v.parameterId().toString(),
                v.resultType().name().equals("NUMERIC") && number != null ? new BigDecimal(number) : null,
                v.resultType().name().equals("NUMERIC") ? comparator : null,
                v.resultType().name().equals("TEXT") ? "Synthetic retained text" : null,
                "Supplied synthetic reference", null, null,
                v.resultType().name().equals("NUMERIC") && number == null ? "NOT_EVALUATED" : flag, "Retained note")).toList();
        return draftService.edit(actor(Role.LAB_TECHNICIAN), result.id().toString(), new ResultRequests.Edit(result.version(), at,
                specimens.stream().map(UUID::toString).toList(), "Retained explanation", values));
    }

    void close(VisitResponse visit) {
        visitService.complete(actor(Role.RECEPTIONIST), visit.id().toString(), new VisitRequests.Completion(visit.version(), LaboratoryInput.now().toString()));
    }

    List<String> keys() {
        return List.of(UUID.randomUUID().toString());
    }

    String seriesId() throws Exception {
        var response = mvc.perform(bearer(get("/api/results/me/trends/biomarkers"), Role.PATIENT))
                .andExpect(status().isOk()).andReturn().getResponse();
        return json.readTree(response.getContentAsByteArray()).get("content").get(0).get("seriesId").asString();
    }

    HealthTrendResponse trend(String id, String... query) throws Exception {
        var request = get("/api/results/me/trends").param("seriesId", id);
        for (int i = 0; i < query.length; i += 2)
            request.param(query[i], query[i + 1]);
        var response = mvc.perform(bearer(request, Role.PATIENT)).andExpect(status().isOk()).andReturn().getResponse();
        return json.readValue(response.getContentAsByteArray(), HealthTrendResponse.class);
    }
}
