package com.smartlims.auth;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.labtests.dto.*;
import com.smartlims.labtests.exception.LabTestException;
import com.smartlims.labtests.service.LabTestService;
import com.smartlims.patients.dto.*;
import com.smartlims.patients.entity.PatientGender;
import com.smartlims.patients.exception.*;
import com.smartlims.patients.service.PatientService;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PersistedServiceAuthorizationTest extends IsolatedPostgresTest {
    @Autowired
    UserAccountRepository users;
    @Autowired
    LabTestService catalog;
    @Autowired
    PatientService patients;
    @Autowired
    JdbcTemplate jdbc;
    @MockitoBean
    VerificationEmailSender email;

    private UserAccount caller;
    private UUID activeTest;
    private UUID inactiveTest;
    private UUID profile;
    private final LabTestRequest testRequest = new LabTestRequest("SYNTHETIC", "Synthetic Test", null,
            BigDecimal.ONE, "ILS", "SYNTHETIC", null, List.of());
    private final CreatePatientRequest patientRequest = new CreatePatientRequest("Synthetic Patient",
            LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000001", null);
    private final UpdatePatientRequest updateRequest = new UpdatePatientRequest("Changed Patient",
            LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000002", null);

    @BeforeEach
    void fixtures() {
        jdbc.execute("TRUNCATE TABLE audit_logs,reference_ranges,patient_notifications,laboratory_events,result_specimens,result_values,test_results,specimen_attestations,samples,visit_items,visits,test_parameters,appointment_reschedules,appointments,appointment_slots,appointment_types,order_items,test_orders,lab_test_categories,lab_tests,patient_link_tokens,patients,email_action_tokens,users");
        var administrator = account("administrator", Role.ADMIN);
        var admin = actor(administrator.getId().toString(), "ADMIN");
        caller = account("caller", Role.ADMIN);
        profile = patients.create(admin, patientRequest).id();
        activeTest = catalog.create(admin, testRequest).id();
        inactiveTest = catalog.create(admin, new LabTestRequest("INACTIVE", "Inactive Test", null,
                BigDecimal.ONE, "ILS", "SYNTHETIC", null, List.of())).id();
        catalog.changeStatus(admin, inactiveTest.toString(), new LabTestStatusRequest(false));
        clearInvocations(email);
    }

    private UserAccount account(String name, Role role) {
        var user = UserAccount.invite("Synthetic Account", name + "@example.invalid", name, "000001", role);
        user.acceptInvitation("unused-test-hash", Instant.now());
        return users.saveAndFlush(user);
    }

    private Authentication actor(String id, String role) {
        return new UsernamePasswordAuthenticationToken(id, null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }

    private LabTestQueryRequest catalogQuery() {
        return LabTestQueryRequest.fromQueryParameters(Map.of());
    }

    private PatientQueryRequest patientQuery() {
        return PatientQueryRequest.fromQueryParameters(Map.of());
    }

    private Map<String, List<Map<String, Object>>> snapshot() {
        var rows = new LinkedHashMap<String, List<Map<String, Object>>>();
        for (String table : List.of("users", "patients", "lab_tests", "patient_link_tokens", "email_action_tokens"))
            rows.put(table, jdbc.queryForList("SELECT * FROM " + table + " ORDER BY id"));
        return rows;
    }

    @ParameterizedTest
    @ValueSource(strings = {"null", "unauthenticated", "anonymous", "malformed", "missing", "blocked",
            "unverified", "passwordless", "unaccepted"})
    void everyCatalogAndBasicPatientOperationRejectsInvalidAccountsBeforeSideEffects(String state) {
        Authentication authentication = actor(caller.getId().toString(), "ADMIN");
        switch (state) {
            case "null" -> authentication = null;
            case "unauthenticated" -> authentication = new UsernamePasswordAuthenticationToken(caller.getId().toString(), null);
            case "anonymous" -> authentication = new AnonymousAuthenticationToken("test", caller.getId().toString(),
                    List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
            case "malformed" -> authentication = actor("invalid-id", "ADMIN");
            case "missing" -> users.deleteById(caller.getId());
            case "blocked" -> jdbc.update("UPDATE users SET enabled=false WHERE id=?", caller.getId());
            case "unverified" -> jdbc.update("UPDATE users SET email_verified_at=NULL WHERE id=?", caller.getId());
            case "passwordless" -> jdbc.update("UPDATE users SET password_hash=NULL WHERE id=?", caller.getId());
            case "unaccepted" -> jdbc.update("UPDATE users SET invitation_accepted_at=NULL WHERE id=?", caller.getId());
            default -> throw new IllegalArgumentException(state);
        }
        var actor = authentication;
        var before = snapshot();
        List<Runnable> catalogOperations = List.of(
                () -> catalog.list(actor, catalogQuery()),
                () -> catalog.get(actor, activeTest.toString()),
                () -> catalog.sampleTypes(actor),
                () -> catalog.create(actor, testRequest),
                () -> catalog.update(actor, activeTest.toString(), testRequest),
                () -> catalog.updateDetails(actor, activeTest.toString(), new LabTestDetailsRequest(testRequest.code(), testRequest.name(), testRequest.description(), testRequest.price(), testRequest.currency(), testRequest.sampleType(), testRequest.preparationInstructions())),
                () -> catalog.changeStatus(actor, activeTest.toString(), new LabTestStatusRequest(false)));
        for (Runnable operation : catalogOperations) {
            var denied = assertThrows(LabTestException.class, operation::run);
            assertEquals(401, denied.getStatus().value());
            assertEquals("UNAUTHORIZED", denied.getCode());
            assertEquals(before, snapshot());
        }
        List<Runnable> patientOperations = List.of(
                () -> patients.list(actor, patientQuery()),
                () -> patients.get(actor, profile.toString()),
                () -> patients.create(actor, patientRequest),
                () -> patients.update(actor, profile.toString(), updateRequest));
        for (Runnable operation : patientOperations) {
            assertThrows(PatientAuthenticationException.class, operation::run);
            assertEquals(before, snapshot());
        }
        verifyNoInteractions(email);
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"PATIENT", "RECEPTIONIST", "LAB_TECHNICIAN"})
    void forgedAdminAuthoritiesCannotGrantCatalogWrites(Role storedRole) {
        var forged = actor(caller.getId().toString(), "ADMIN");
        jdbc.update("UPDATE users SET role=? WHERE id=?", storedRole.name(), caller.getId());
        var before = snapshot();
        for (Runnable operation : List.<Runnable>of(
                () -> catalog.create(forged, testRequest),
                () -> catalog.update(forged, activeTest.toString(), testRequest),
                () -> catalog.updateDetails(forged, activeTest.toString(), new LabTestDetailsRequest(testRequest.code(), testRequest.name(), testRequest.description(), testRequest.price(), testRequest.currency(), testRequest.sampleType(), testRequest.preparationInstructions())),
                () -> catalog.changeStatus(forged, activeTest.toString(), new LabTestStatusRequest(false)))) {
            assertEquals("FORBIDDEN", assertThrows(LabTestException.class, operation::run).getCode());
            assertEquals(before, snapshot());
        }
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"PATIENT", "LAB_TECHNICIAN"})
    void forgedAdminAuthoritiesCannotGrantPatientWrites(Role storedRole) {
        var forged = actor(caller.getId().toString(), "ADMIN");
        jdbc.update("UPDATE users SET role=? WHERE id=?", storedRole.name(), caller.getId());
        var before = snapshot();
        assertThrows(PatientForbiddenException.class, () -> patients.create(forged, patientRequest));
        assertThrows(PatientForbiddenException.class, () -> patients.update(forged, profile.toString(), updateRequest));
        if (storedRole == Role.PATIENT)
            assertThrows(PatientForbiddenException.class, () -> patients.list(forged, patientQuery()));
        assertEquals(before, snapshot());
    }

    @Test
    void storedPatientRoleControlsCatalogVisibilityAndProfileOwnershipDespiteStaleAdminAuthorities() {
        var stale = actor(caller.getId().toString(), "ADMIN");
        jdbc.update("UPDATE users SET role='PATIENT' WHERE id=?", caller.getId());
        assertEquals(List.of(activeTest), catalog.list(stale, catalogQuery()).content().stream().map(LabTestResponse::id).toList());
        var inactive = LabTestQueryRequest.fromQueryParameters(Map.of("active", List.of("false")));
        assertEquals("FORBIDDEN", assertThrows(LabTestException.class, () -> catalog.list(stale, inactive)).getCode());
        var hidden = assertThrows(LabTestException.class, () -> catalog.get(stale, inactiveTest.toString()));
        var missing = assertThrows(LabTestException.class, () -> catalog.get(stale, UUID.randomUUID().toString()));
        assertEquals(missing.getCode(), hidden.getCode());
        assertEquals(missing.getStatus(), hidden.getStatus());
        assertThrows(PatientNotFoundException.class, () -> patients.get(stale, profile.toString()));
        jdbc.update("UPDATE patients SET user_id=? WHERE id=?", caller.getId(), profile);
        assertEquals(profile, patients.get(stale, profile.toString()).id());
    }

    @Test
    void storedStaffRoleControlsReadsAndLegitimatePatientWritesWithStalePatientAuthorities() {
        var stale = actor(caller.getId().toString(), "PATIENT");
        assertEquals(inactiveTest, catalog.get(stale, inactiveTest.toString()).id());
        assertEquals(2, catalog.list(stale, catalogQuery()).totalElements());
        assertEquals(profile, patients.get(stale, profile.toString()).id());
        // Refresh authorities for write routes: stale patient authorities cannot grant staff writes.
        assertThrows(PatientForbiddenException.class, () -> patients.create(stale, patientRequest));
        jdbc.update("UPDATE users SET role='RECEPTIONIST' WHERE id=?", caller.getId());
        var receptionist = actor(caller.getId().toString(), "RECEPTIONIST");
        assertNotNull(patients.create(receptionist, patientRequest).id());
        assertEquals("Changed Patient", patients.update(receptionist, profile.toString(), updateRequest).fullName());
        assertEquals(2, patients.list(receptionist, patientQuery()).totalElements());
    }
}
