package com.smartlims.patients;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.*;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.JwtKeyConfiguration;
import com.smartlims.patients.dto.*;
import com.smartlims.patients.entity.PatientGender;
import com.smartlims.patients.service.PatientService;
import jakarta.servlet.http.Cookie;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class PatientSelfProfileTest extends IsolatedPostgresTest {
    private static final String PATH = "/api/patients/me/profile";
    private static final CreatePatientRequest INITIAL = new CreatePatientRequest("Synthetic Patient",
            LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000001", "Original address");
    private static final UpdatePatientRequest EDIT = new UpdatePatientRequest("Updated Patient",
            LocalDate.of(2001, 2, 3), PatientGender.FEMALE, "000002", null);
    @Autowired MockMvc mvc;
    @Autowired UserAccountRepository users;
    @Autowired PatientService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtEncoder encoder;
    @Autowired JsonMapper json;
    @Autowired TransactionTemplate transactions;
    @MockitoBean VerificationEmailSender email;
    private final Map<Role, UserAccount> accounts = new EnumMap<>(Role.class);
    private final Map<Role, String> tokens = new EnumMap<>(Role.class);

    @BeforeEach void fixtures() {
        jdbc.execute("TRUNCATE TABLE laboratory_events,result_specimens,result_values,test_results,specimen_attestations,samples,visit_items,visits,test_parameters,appointment_reschedules,appointments,appointment_slots,appointment_types,order_items,test_orders,patient_link_tokens,patients,email_action_tokens,users");
        for (Role role : Role.values()) {
            var account = UserAccount.invite("Independent Account Name", role.name().toLowerCase(Locale.ROOT) + "@example.invalid", null, "000099", role);
            account.acceptInvitation("test-only-unused-hash", Instant.now());
            account = users.saveAndFlush(account);
            accounts.put(role, account); tokens.put(role, token(account));
        }
    }

    private String token(UserAccount account) {
        var now = Instant.now();
        var claims = JwtClaimsSet.builder().subject(account.getId().toString()).issuer(JwtKeyConfiguration.ISSUER)
                .audience(List.of(JwtKeyConfiguration.AUDIENCE)).issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    private JwtAuthenticationToken actor(Role role) { return actor(accounts.get(role), role); }
    private JwtAuthenticationToken actor(UserAccount account, Role role) {
        var jwt = Jwt.withTokenValue("test-only").header("alg", "HS256").subject(account.getId().toString()).build();
        return new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_" + role)), jwt.getSubject());
    }
    private MockHttpServletRequestBuilder bearer(MockHttpServletRequestBuilder request, Role role) {
        return request.header("Authorization", "Bearer " + tokens.get(role));
    }
    private MockHttpServletRequestBuilder save(String body) {
        return bearer(put(PATH), Role.PATIENT).contentType(MediaType.APPLICATION_JSON).content(body);
    }
    private PatientResponse own() { return service.createMe(actor(Role.PATIENT), INITIAL); }
    private JsonNode getProfile() throws Exception {
        var response = mvc.perform(bearer(get(PATH), Role.PATIENT)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse();
        return json.readTree(response.getContentAsByteArray());
    }
    private void error(MockHttpServletRequestBuilder request, int code, String name, String field) throws Exception {
        var response = mvc.perform(request).andExpect(status().is(code)).andExpect(jsonPath("$.code").value(name))
                .andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse();
        var body = json.readTree(response.getContentAsByteArray());
        assertEquals(response.getHeader("X-Request-Id"), body.get("requestId").asString());
        assertEquals(4, body.size());
        if (field != null) assertTrue(body.get("fieldErrors").has(field));
        else assertEquals(0, body.get("fieldErrors").size());
    }

    @Test void selfViewUsesPatientDemographicsAccountEmailAndExistingResponseShapesStayUnchanged() throws Exception {
        var profile = own(); var view = getProfile();
        assertEquals(profile.id().toString(), view.get("id").asString());
        assertEquals("Synthetic Patient", view.get("fullName").asString());
        assertEquals("000001", view.get("phoneNumber").asString());
        assertEquals(accounts.get(Role.PATIENT).getEmail(), view.get("email").asString());
        assertFalse(view.get("emailEditable").asBoolean()); assertEquals(100, view.get("completionPercentage").asInt());
        assertEquals(0, view.get("missingFields").size()); assertEquals(13, view.size());
        for (String field : List.of("role", "userId", "createdBy", "passwordHash", "emailVerifiedAt", "resetCodeHash")) assertFalse(view.has(field));
        var oldResponse = mvc.perform(bearer(get("/api/patients/me"), Role.PATIENT)).andExpect(status().isOk()).andReturn().getResponse();
        assertEquals(9, json.readTree(oldResponse.getContentAsByteArray()).size());
        mvc.perform(bearer(get("/api/patients/" + profile.id()), Role.PATIENT)).andExpect(status().isOk());
    }

    @Test void selfPutReplacesOnlyDemographicsPreservesIdentityAccountSecurityAndForeignRows() throws Exception {
        var own = own(); var foreign = service.create(actor(Role.ADMIN), INITIAL);
        var accountBefore = jdbc.queryForMap("SELECT * FROM users WHERE id=?", accounts.get(Role.PATIENT).getId());
        var immutableBefore = jdbc.queryForMap("SELECT id,user_id,patient_number,created_by,created_at FROM patients WHERE id=?", own.id());
        String body = json.writeValueAsString(EDIT).replace("Updated Patient", "  Updated Patient  ").replace("000002", "  000002  ");
        mvc.perform(save(body)).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.fullName").value("Updated Patient")).andExpect(jsonPath("$.phoneNumber").value("000002"))
                .andExpect(jsonPath("$.dateOfBirth").value("2001-02-03")).andExpect(jsonPath("$.gender").value("FEMALE"))
                .andExpect(jsonPath("$.address").value(org.hamcrest.Matchers.nullValue())).andExpect(jsonPath("$.completionPercentage").value(100));
        assertEquals(accountBefore, jdbc.queryForMap("SELECT * FROM users WHERE id=?", accounts.get(Role.PATIENT).getId()));
        assertEquals(immutableBefore, jdbc.queryForMap("SELECT id,user_id,patient_number,created_by,created_at FROM patients WHERE id=?", own.id()));
        assertEquals(foreign, service.get(actor(Role.ADMIN), foreign.id().toString()));
        assertEquals("Updated Patient", service.getMe(actor(Role.PATIENT)).fullName());
        verifyNoInteractions(email);
    }

    @Test void addressOmissionBlankAndNullClearWithoutReducingCompletionAndIdenticalRetryPreservesIdentity() throws Exception {
        var own = own();
        for (String address : List.of(",\"address\":\"  \"", ",\"address\":null", "")) {
            String body = "{\"fullName\":\"Updated Patient\",\"dateOfBirth\":\"2001-02-03\",\"gender\":\"UNKNOWN\",\"phoneNumber\":\"000002\"" + address + "}";
            mvc.perform(save(body)).andExpect(status().isOk()).andExpect(jsonPath("$.address").value(org.hamcrest.Matchers.nullValue()))
                    .andExpect(jsonPath("$.completionPercentage").value(100)).andExpect(jsonPath("$.missingFields").isEmpty());
        }
        var before = service.getMe(actor(Role.PATIENT));
        mvc.perform(save(json.writeValueAsString(EDIT))).andExpect(status().isOk());
        var first = service.getMe(actor(Role.PATIENT));
        mvc.perform(save(json.writeValueAsString(EDIT))).andExpect(status().isOk());
        var second = service.getMe(actor(Role.PATIENT));
        assertEquals(own.id(), second.id()); assertEquals(own.createdAt(), second.createdAt());
        assertTrue(second.updatedAt().isAfter(first.updatedAt())); assertTrue(first.updatedAt().isAfter(before.updatedAt()));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM patients", Integer.class));
    }

    @Test void absentLinkNeverMatchesWalkInAndExplicitCreateOrClaimAreReused() throws Exception {
        var walkIn = service.create(actor(Role.ADMIN), INITIAL);
        error(bearer(get(PATH), Role.PATIENT), 404, "PATIENT_PROFILE_NOT_LINKED", null);
        error(save(json.writeValueAsString(EDIT)), 404, "PATIENT_PROFILE_NOT_LINKED", null);
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM patients", Integer.class));
        assertNull(jdbc.queryForObject("SELECT user_id FROM patients WHERE id=?", UUID.class, walkIn.id()));
        String link = service.issueLinkToken(actor(Role.RECEPTIONIST), walkIn.id().toString()).token();
        service.linkMe(actor(Role.PATIENT), new LinkPatientRequest(link));
        assertEquals(walkIn.id().toString(), getProfile().get("id").asString());
        mvc.perform(save(json.writeValueAsString(EDIT))).andExpect(status().isOk());
        assertEquals(walkIn.patientNumber(), service.getMe(actor(Role.PATIENT)).patientNumber());
    }

    @Test void readonlyAndSecurityFieldsRejectEntireRequestWithoutChangingAnything() throws Exception {
        own(); var before = getProfile();
        for (String field : List.of("id", "patientId", "patientNumber", "userId", "accountId", "createdBy", "createdAt", "updatedAt",
                "email", "emailEditable", "completionPercentage", "missingFields", "role", "password", "passwordHash", "enabled",
                "emailVerifiedAt", "invitationAcceptedAt", "resetCodeHash", "token", "userName")) {
            String body = json.writeValueAsString(EDIT).replaceFirst("\\{", "{\"" + field + "\":\"forbidden\",");
            error(save(body), 400, "INVALID_JSON", null);
        }
        assertEquals(before, getProfile());
    }

    @Test void requiredFieldsRejectMissingBlankNullAndOversizedDataAtomically() throws Exception {
        own(); var before = getProfile();
        var body = new LinkedHashMap<String, Object>();
        body.put("fullName", "Updated Patient"); body.put("dateOfBirth", "2001-02-03"); body.put("gender", "FEMALE"); body.put("phoneNumber", "000002");
        for (String field : List.of("fullName", "dateOfBirth", "gender", "phoneNumber")) {
            var missing = new LinkedHashMap<>(body); missing.remove(field);
            error(save(json.writeValueAsString(missing)), 400, "VALIDATION_ERROR", field);
            missing.put(field, null); error(save(json.writeValueAsString(missing)), 400, "VALIDATION_ERROR", field);
        }
        for (String field : List.of("fullName", "phoneNumber")) {
            var blank = new LinkedHashMap<>(body); blank.put(field, " \t ");
            error(save(json.writeValueAsString(blank)), 400, "VALIDATION_ERROR", field);
            blank.put(field, "x".repeat(field.equals("fullName") ? 121 : 21));
            error(save(json.writeValueAsString(blank)), 400, "VALIDATION_ERROR", field);
        }
        var longAddress = new LinkedHashMap<>(body); longAddress.put("address", "x".repeat(501));
        error(save(json.writeValueAsString(longAddress)), 400, "VALIDATION_ERROR", "address");
        assertEquals(before, getProfile());
    }

    @Test void strictJsonDateAndGenderSyntaxAndFutureDateRespectExistingValidation() throws Exception {
        own(); var before = getProfile();
        for (String field : List.of("fullName", "phoneNumber", "address", "dateOfBirth", "gender")) {
            for (Object value : List.of(123, true, List.of("value"), Map.of("value", "x"))) {
                var body = json.readValue(json.writeValueAsString(EDIT), new TypeReference<LinkedHashMap<String, Object>>() {}); body.put(field, value);
                error(save(json.writeValueAsString(body)), 400, "INVALID_JSON", null);
            }
        }
        for (String date : List.of("2001-02-29", "2001-2-03", "2001-02-03T00:00:00Z", "")) {
            error(save(json.writeValueAsString(EDIT).replace("2001-02-03", date)), 400, "INVALID_JSON", null);
        }
        for (String gender : List.of("female", "OTHER", "")) error(save(json.writeValueAsString(EDIT).replace("FEMALE", gender)), 400, "INVALID_JSON", null);
        String future = LocalDate.now(ZoneId.of("Asia/Jerusalem")).plusDays(1).toString();
        error(save(json.writeValueAsString(EDIT).replace("2001-02-03", future)), 400, "VALIDATION_ERROR", "dateOfBirth");
        assertEquals(before, getProfile());
        mvc.perform(save(json.writeValueAsString(EDIT).replace("2001-02-03", LocalDate.now(ZoneId.of("Asia/Jerusalem")).toString()))).andExpect(status().isOk());
    }

    @Test void noQuerySelectorCanRedirectEitherOperationAndForeignStaffRouteRemainsForbidden() throws Exception {
        own(); var foreign = service.create(actor(Role.ADMIN), INITIAL);
        for (String field : List.of("id", "patientId", "userId", "page", "size")) {
            error(bearer(get(PATH).param(field, foreign.id().toString(), foreign.id().toString()), Role.PATIENT), 400, "VALIDATION_ERROR", field);
            error(save(json.writeValueAsString(EDIT)).param(field, foreign.id().toString()), 400, "VALIDATION_ERROR", field);
        }
        error(bearer(get("/api/patients/" + foreign.id()), Role.PATIENT), 404, "PATIENT_NOT_FOUND", null);
        error(bearer(put("/api/patients/" + foreign.id()), Role.PATIENT).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(EDIT)), 403, "FORBIDDEN", null);
    }

    @Test void storedRoleAndEligibilityAreRecheckedAndStaffCannotUseSelfRoute() throws Exception {
        own();
        for (Role role : List.of(Role.ADMIN, Role.RECEPTIONIST, Role.LAB_TECHNICIAN)) {
            error(bearer(get(PATH), role), 403, "FORBIDDEN", null);
            error(bearer(put(PATH), role).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(EDIT)), 403, "FORBIDDEN", null);
        }
        jdbc.update("UPDATE users SET role='RECEPTIONIST' WHERE id=?", accounts.get(Role.PATIENT).getId());
        error(bearer(get(PATH), Role.PATIENT), 403, "FORBIDDEN", null);
        error(save(json.writeValueAsString(EDIT)), 403, "FORBIDDEN", null);
        assertThrows(com.smartlims.patients.exception.PatientForbiddenException.class, () -> service.updateMyProfile(actor(Role.PATIENT), EDIT));
    }

    @ParameterizedTest
    @ValueSource(strings = {"enabled=false", "email_verified_at=null", "password_hash=null", "invitation_accepted_at=null"})
    void ineligibleStoredAccountCannotReadOrWrite(String change) throws Exception {
        own();
        jdbc.update("UPDATE users SET " + change + " WHERE id=?", accounts.get(Role.PATIENT).getId());
        error(bearer(get(PATH), Role.PATIENT), 401, "UNAUTHORIZED", null);
        error(save(json.writeValueAsString(EDIT)), 401, "UNAUTHORIZED", null);
    }

    @Test void cookieCsrfAnonymousAccessAndBearerPrecedenceArePreserved() throws Exception {
        own(); String body = json.writeValueAsString(EDIT);
        error(get(PATH), 401, "UNAUTHORIZED", null);
        error(put(PATH).contentType(MediaType.APPLICATION_JSON).content(body), 403, "FORBIDDEN", null);
        Cookie csrf = mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN"); assertNotNull(csrf);
        error(put(PATH).cookie(csrf).header("X-XSRF-TOKEN", csrf.getValue()).contentType(MediaType.APPLICATION_JSON).content(body), 401, "UNAUTHORIZED", null);
        var access = new Cookie("access_token", tokens.get(Role.PATIENT));
        mvc.perform(get(PATH).cookie(access)).andExpect(status().isOk());
        error(put(PATH).cookie(access).contentType(MediaType.APPLICATION_JSON).content(body), 403, "FORBIDDEN", null);
        mvc.perform(put(PATH).cookie(access, csrf).header("X-XSRF-TOKEN", csrf.getValue()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        error(get(PATH).cookie(access).header("Authorization", "Bearer invalid"), 401, "UNAUTHORIZED", null);
        error(bearer(get(PATH), Role.ADMIN).cookie(access), 403, "FORBIDDEN", null);
    }

    @Test void selfAndStaffFullReplacementsSerializeWithoutMixedFieldsOrLinkChanges() throws Exception {
        var own = own();
        var staff = new UpdatePatientRequest("Staff Replacement", LocalDate.of(1999, 4, 5), PatientGender.MALE, "000003", "Staff address");
        try (var pool = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            var selfWrite = pool.submit(() -> { gate.await(); return service.updateMyProfile(actor(Role.PATIENT), EDIT); });
            var staffWrite = pool.submit(() -> { gate.await(); return service.update(actor(Role.ADMIN), own.id().toString(), staff); });
            gate.countDown(); selfWrite.get(15, TimeUnit.SECONDS); staffWrite.get(15, TimeUnit.SECONDS);
        }
        var finalProfile = service.getMe(actor(Role.PATIENT));
        if (finalProfile.fullName().equals(EDIT.fullName())) {
            assertEquals(EDIT.dateOfBirth(), finalProfile.dateOfBirth()); assertEquals(EDIT.gender(), finalProfile.gender());
            assertEquals(EDIT.phoneNumber(), finalProfile.phoneNumber()); assertEquals(EDIT.address(), finalProfile.address());
        } else {
            assertEquals(staff.fullName(), finalProfile.fullName()); assertEquals(staff.dateOfBirth(), finalProfile.dateOfBirth());
            assertEquals(staff.gender(), finalProfile.gender()); assertEquals(staff.phoneNumber(), finalProfile.phoneNumber()); assertEquals(staff.address(), finalProfile.address());
        }
        assertEquals(own.id(), finalProfile.id()); assertEquals(own.patientNumber(), finalProfile.patientNumber());
        assertEquals(accounts.get(Role.PATIENT).getId(), jdbc.queryForObject("SELECT user_id FROM patients WHERE id=?", UUID.class, own.id()));
    }

    @Test void rollbackLeavesProfileAccountAndCompletionUnchanged() throws Exception {
        own(); var before = getProfile();
        var accountBefore = jdbc.queryForMap("SELECT * FROM users WHERE id=?", accounts.get(Role.PATIENT).getId());
        assertThrows(IllegalStateException.class, () -> transactions.execute(tx -> {
            service.updateMyProfile(actor(Role.PATIENT), EDIT); throw new IllegalStateException("Synthetic rollback");
        }));
        assertEquals(before, getProfile());
        assertEquals(accountBefore, jdbc.queryForMap("SELECT * FROM users WHERE id=?", accounts.get(Role.PATIENT).getId()));
    }
}
