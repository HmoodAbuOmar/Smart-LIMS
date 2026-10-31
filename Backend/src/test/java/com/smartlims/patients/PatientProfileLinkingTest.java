package com.smartlims.patients;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.JwtKeyConfiguration;
import com.smartlims.auth.service.VerificationTokens;
import com.smartlims.patients.dto.CreatePatientRequest;
import com.smartlims.patients.dto.LinkPatientRequest;
import com.smartlims.patients.dto.PatientResponse;
import com.smartlims.patients.entity.PatientGender;
import com.smartlims.patients.exception.PatientAuthenticationException;
import com.smartlims.patients.exception.PatientForbiddenException;
import com.smartlims.patients.exception.PatientProfileException;
import com.smartlims.patients.service.PatientService;
import jakarta.servlet.http.Cookie;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class PatientProfileLinkingTest extends IsolatedPostgresTest {
    private static final String BODY = """
            {"fullName":" Synthetic Profile ","dateOfBirth":"2000-01-01","gender":"UNKNOWN",
             "phoneNumber":" 000001 ","address":" Example Address "}
            """;
    private static final CreatePatientRequest REQUEST = new CreatePatientRequest("Synthetic Profile",
            LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000001", "Example Address");
    @Autowired MockMvc mvc;
    @Autowired UserAccountRepository users;
    @Autowired PatientService service;
    @Autowired VerificationTokens hashes;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtEncoder encoder;
    @Autowired JsonMapper json;
    @Autowired TransactionTemplate transactions;
    @MockitoBean VerificationEmailSender email;
    private final Map<Role, UserAccount> actors = new EnumMap<>(Role.class);
    private final Map<Role, String> credentials = new EnumMap<>(Role.class);

    @BeforeEach
    void fixtures() {
        jdbc.execute("TRUNCATE TABLE patient_notifications,laboratory_events,result_specimens,result_values,test_results,specimen_attestations,samples,visit_items,visits,test_parameters,appointment_reschedules,appointments,appointment_slots,appointment_types,order_items, test_orders, patient_link_tokens, patients, email_action_tokens, users");
        for (Role role : Role.values()) {
            UserAccount account = active(role.name().toLowerCase(Locale.ROOT), role);
            actors.put(role, account);
            credentials.put(role, jwt(account));
        }
    }

    private UserAccount active(String name, Role role) {
        UserAccount account = UserAccount.invite("Synthetic Account", name + "@example.invalid", null, "000099", role);
        account.acceptInvitation("test-only-unused-hash", Instant.now());
        return users.saveAndFlush(account);
    }

    private String jwt(UserAccount account) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().subject(account.getId().toString())
                .issuer(JwtKeyConfiguration.ISSUER).audience(List.of(JwtKeyConfiguration.AUDIENCE))
                .issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    private JwtAuthenticationToken actor(UserAccount account) {
        Jwt jwt = Jwt.withTokenValue("test-only").header("alg", "HS256").subject(account.getId().toString()).build();
        return new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_" + account.getRole())), jwt.getSubject());
    }

    private JwtAuthenticationToken actor(Role role) { return actor(actors.get(role)); }

    private MockHttpServletRequestBuilder bearer(MockHttpServletRequestBuilder request, Role role) {
        return request.header("Authorization", "Bearer " + credentials.get(role));
    }

    private MockHttpServletRequestBuilder link(String token) {
        return bearer(post("/api/patients/me/link"), Role.PATIENT)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(new LinkPatientRequest(token)));
    }

    private PatientResponse walkIn() { return service.create(actor(Role.ADMIN), REQUEST); }

    private JsonNode response(MvcResult result) {
        return json.readTree(new String(result.getResponse().getContentAsByteArray(), java.nio.charset.StandardCharsets.UTF_8));
    }

    private void error(MockHttpServletRequestBuilder request, int statusCode, String code) throws Exception {
        MvcResult result = mvc.perform(request).andExpect(status().is(statusCode)).andExpect(jsonPath("$.code").value(code))
                .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.fieldErrors").isMap()).andReturn();
        assertEquals(response(result).get("requestId").asString(), result.getResponse().getHeader("X-Request-Id"));
    }

    @Test
    void missingMeAndSelfCreationUseAccountIdentityAndKeepDemographicsSeparate() throws Exception {
        error(bearer(get("/api/patients/me"), Role.PATIENT), 404, "PATIENT_PROFILE_NOT_LINKED");
        UserAccount before = users.findById(actors.get(Role.PATIENT).getId()).orElseThrow();
        MvcResult created = mvc.perform(bearer(post("/api/patients/me"), Role.PATIENT)
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.fullName").value("Synthetic Profile"))
                .andExpect(jsonPath("$.phoneNumber").value("000001")).andReturn();
        JsonNode profile = response(created);
        UUID id = UUID.fromString(profile.get("id").asString());
        assertEquals("/api/patients/" + id, created.getResponse().getHeader("Location"));
        assertEquals(9, profile.size());
        assertTrue(profile.get("patientNumber").asString().matches("PAT-[0-9]{6,}"));
        assertEquals(before.getId(), jdbc.queryForObject("SELECT user_id FROM patients WHERE id = ?", UUID.class, id));
        assertEquals(before.getId(), jdbc.queryForObject("SELECT created_by FROM patients WHERE id = ?", UUID.class, id));
        UserAccount after = users.findById(before.getId()).orElseThrow();
        assertEquals(before.getFullName(), after.getFullName());
        assertEquals(before.getPhoneNumber(), after.getPhoneNumber());
        assertEquals(before.getUpdatedAt(), after.getUpdatedAt());
        mvc.perform(bearer(get("/api/patients/me"), Role.PATIENT)).andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()));
        error(bearer(post("/api/patients/me"), Role.PATIENT).contentType(MediaType.APPLICATION_JSON).content(BODY),
                409, "PATIENT_LINK_CONFLICT");
        error(bearer(put("/api/patients/" + id), Role.PATIENT).contentType(MediaType.APPLICATION_JSON).content(BODY),
                403, "FORBIDDEN");
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM patients", Integer.class));
    }

    @Test
    void duplicateDemographicsNeverMatchMergeOrLinkAWalkIn() {
        PatientResponse unlinked = walkIn();
        PatientResponse own = service.createMe(actor(Role.PATIENT), REQUEST);
        assertNotEquals(unlinked.id(), own.id());
        assertNull(jdbc.queryForObject("SELECT user_id FROM patients WHERE id = ?", UUID.class, unlinked.id()));
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM patients", Integer.class));
    }

    @Test
    void staffIssuesHashOnlyAndPatientConsumesTokenWithoutChangingProfileOrAccountDetails() throws Exception {
        PatientResponse profile = walkIn();
        MvcResult issued = mvc.perform(bearer(post("/api/patients/" + profile.id() + "/link-tokens"), Role.RECEPTIONIST))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store")).andReturn();
        JsonNode issuedBody = response(issued);
        assertEquals(2, issuedBody.size());
        String raw = issuedBody.get("token").asString();
        assertTrue(raw.matches("[A-Za-z0-9_-]{43}"));
        Instant expiry = Instant.parse(issuedBody.get("expiresAt").asString());
        assertTrue(expiry.isAfter(Instant.now().plusSeconds(590)));
        assertTrue(expiry.isBefore(Instant.now().plusSeconds(601)));
        String persistedHash = jdbc.queryForObject("SELECT token_hash FROM patient_link_tokens", String.class);
        assertTrue(hashes.hash(raw).equals(persistedHash));
        assertFalse(raw.equals(persistedHash));
        assertEquals(actors.get(Role.RECEPTIONIST).getId(), jdbc.queryForObject("SELECT issued_by FROM patient_link_tokens", UUID.class));
        assertEquals(profile.id(), jdbc.queryForObject("SELECT patient_id FROM patient_link_tokens", UUID.class));
        assertEquals(Set.of("id", "token_hash", "patient_id", "issued_by", "expires_at", "consumed_at", "revoked_at"),
                new HashSet<>(jdbc.queryForList("SELECT column_name FROM information_schema.columns "
                        + "WHERE table_name = 'patient_link_tokens'", String.class)));
        UserAccount before = users.findById(actors.get(Role.PATIENT).getId()).orElseThrow();
        JsonNode linked = response(mvc.perform(link(raw)).andExpect(status().isOk()).andReturn());
        assertEquals(profile.id().toString(), linked.get("id").asString());
        assertEquals(profile.patientNumber(), linked.get("patientNumber").asString());
        assertEquals(profile.createdAt(), Instant.parse(linked.get("createdAt").asString()));
        assertEquals(profile.fullName(), linked.get("fullName").asString());
        assertEquals(profile.phoneNumber(), linked.get("phoneNumber").asString());
        assertEquals(actors.get(Role.ADMIN).getId(), jdbc.queryForObject("SELECT created_by FROM patients", UUID.class));
        assertNotNull(jdbc.queryForObject("SELECT consumed_at FROM patient_link_tokens", Timestamp.class));
        assertNull(jdbc.queryForObject("SELECT revoked_at FROM patient_link_tokens", Timestamp.class));
        assertEquals(before.getUpdatedAt(), users.findById(before.getId()).orElseThrow().getUpdatedAt());
        mvc.perform(bearer(get("/api/patients/me"), Role.PATIENT)).andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(profile.id().toString()));
        mvc.perform(bearer(get("/api/patients/" + profile.id()), Role.PATIENT)).andExpect(status().isOk());
        error(link(raw), 400, "INVALID_PATIENT_LINK_TOKEN");
        error(bearer(post("/api/patients/" + profile.id() + "/link-tokens"), Role.ADMIN), 409, "PATIENT_LINK_CONFLICT");
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM patients", Integer.class));
    }

    @Test
    void reissueRevokesOutstandingTokenAndExpiryAndRevocationAreRejected() throws Exception {
        PatientResponse profile = walkIn();
        String previous = service.issueLinkToken(actor(Role.ADMIN), profile.id().toString()).token();
        String next = service.issueLinkToken(actor(Role.RECEPTIONIST), profile.id().toString()).token();
        assertFalse(previous.equals(next));
        assertNotNull(jdbc.queryForObject("SELECT revoked_at FROM patient_link_tokens WHERE token_hash = ?", Timestamp.class, hashes.hash(previous)));
        error(link(previous), 400, "INVALID_PATIENT_LINK_TOKEN");
        jdbc.update("UPDATE patient_link_tokens SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE token_hash = ?", hashes.hash(next));
        error(link(next), 400, "INVALID_PATIENT_LINK_TOKEN");
        String current = service.issueLinkToken(actor(Role.ADMIN), profile.id().toString()).token();
        jdbc.update("UPDATE patient_link_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?", hashes.hash(current));
        error(link(current), 400, "INVALID_PATIENT_LINK_TOKEN");
        assertNull(jdbc.queryForObject("SELECT user_id FROM patients", UUID.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM patient_link_tokens WHERE consumed_at IS NOT NULL", Integer.class));
    }

    @Test
    void conflictsLeaveTokenUnconsumedAndNeverReassignOrCreateProfiles() throws Exception {
        PatientResponse own = service.createMe(actor(Role.PATIENT), REQUEST);
        PatientResponse target = walkIn();
        String raw = service.issueLinkToken(actor(Role.ADMIN), target.id().toString()).token();
        error(link(raw), 409, "PATIENT_LINK_CONFLICT");
        assertNull(jdbc.queryForObject("SELECT consumed_at FROM patient_link_tokens", Timestamp.class));
        UserAccount other = active("other", Role.PATIENT);
        service.linkMe(actor(other), new LinkPatientRequest(raw));
        assertEquals(own.id(), service.getMe(actor(Role.PATIENT)).id());
        error(bearer(get("/api/patients/" + target.id()), Role.PATIENT), 404, "PATIENT_NOT_FOUND");
        assertEquals(other.getId(), jdbc.queryForObject("SELECT user_id FROM patients WHERE id = ?", UUID.class, target.id()));
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM patients", Integer.class));
        // A pre-existing conflicting link must also be rejected even if a token is still outstanding.
        PatientResponse existing = walkIn();
        String outstanding = service.issueLinkToken(actor(Role.ADMIN), existing.id().toString()).token();
        UserAccount owner = active("existingowner", Role.PATIENT);
        jdbc.update("UPDATE patients SET user_id = ? WHERE id = ?", owner.getId(), existing.id());
        UserAccount claimant = active("claimant", Role.PATIENT);
        assertEquals("PATIENT_LINK_CONFLICT", assertThrows(PatientProfileException.class,
                () -> service.linkMe(actor(claimant), new LinkPatientRequest(outstanding))).getCode());
        assertEquals(owner.getId(), jdbc.queryForObject("SELECT user_id FROM patients WHERE id = ?", UUID.class, existing.id()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"PAT-000001", "unknown", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", " token "})
    void unknownMalformedTokensAndPatientNumbersDoNotAuthorizeLinking(String raw) throws Exception {
        error(link(raw), 400, "INVALID_PATIENT_LINK_TOKEN");
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM patients", Integer.class));
    }

    @Test
    void newRoutesEnforceEveryRoleAndServicesAlsoRejectUnauthorizedCallers() throws Exception {
        PatientResponse profile = walkIn();
        for (Role role : List.of(Role.ADMIN, Role.RECEPTIONIST, Role.LAB_TECHNICIAN)) {
            error(bearer(get("/api/patients/me"), role), 403, "FORBIDDEN");
            error(bearer(post("/api/patients/me"), role).contentType(MediaType.APPLICATION_JSON).content(BODY), 403, "FORBIDDEN");
            error(bearer(post("/api/patients/me/link"), role).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"token\":\"unknown\"}"), 403, "FORBIDDEN");
            assertThrows(PatientForbiddenException.class, () -> service.getMe(actor(role)));
            assertThrows(PatientForbiddenException.class, () -> service.createMe(actor(role), REQUEST));
            assertThrows(PatientForbiddenException.class, () -> service.linkMe(actor(role), new LinkPatientRequest("unknown")));
        }
        for (Role role : List.of(Role.PATIENT, Role.LAB_TECHNICIAN)) {
            error(bearer(post("/api/patients/" + profile.id() + "/link-tokens"), role), 403, "FORBIDDEN");
            assertThrows(PatientForbiddenException.class, () -> service.issueLinkToken(actor(role), profile.id().toString()));
        }
        error(bearer(post("/api/patients/not-a-uuid/link-tokens"), Role.ADMIN), 400, "VALIDATION_ERROR");
        error(bearer(post("/api/patients/" + UUID.randomUUID() + "/link-tokens"), Role.ADMIN), 404, "PATIENT_NOT_FOUND");
    }

    @ParameterizedTest
    @ValueSource(strings = {"enabled = false", "email_verified_at = NULL", "password_hash = NULL", "invitation_accepted_at = NULL"})
    void accountEligibilityIsCheckedFromPersistenceForEveryPatientRoute(String change) throws Exception {
        jdbc.update("UPDATE users SET " + change + " WHERE id = ?", actors.get(Role.PATIENT).getId());
        error(bearer(get("/api/patients/me"), Role.PATIENT), 401, "UNAUTHORIZED");
        error(bearer(post("/api/patients/me"), Role.PATIENT).contentType(MediaType.APPLICATION_JSON).content(BODY), 401, "UNAUTHORIZED");
        error(link("unknown"), 401, "UNAUTHORIZED");
        assertThrows(PatientAuthenticationException.class, () -> service.createMe(actor(Role.PATIENT), REQUEST));
        assertThrows(PatientAuthenticationException.class, () -> service.linkMe(actor(Role.PATIENT), new LinkPatientRequest("unknown")));
    }

    @Test
    void serviceRejectsStaleRoleAndMissingAccounts() {
        var stale = actor(Role.PATIENT);
        jdbc.update("UPDATE users SET role = 'LAB_TECHNICIAN' WHERE id = ?", actors.get(Role.PATIENT).getId());
        assertThrows(PatientForbiddenException.class, () -> service.createMe(stale, REQUEST));
        jdbc.update("DELETE FROM users WHERE id = ?", actors.get(Role.PATIENT).getId());
        assertThrows(PatientAuthenticationException.class, () -> service.createMe(stale, REQUEST));
    }

    @Test
    void selfCreationReusesStrictValidationAndRejectsClientIdentityFields() throws Exception {
        for (String body : List.of("{}", BODY.replace(" Synthetic Profile ", " "), BODY.replace("2000-01-01", "2100-01-01"),
                BODY.replace(" 000001 ", "x".repeat(21)), BODY.replace(" Example Address ", "x".repeat(501)))) {
            error(bearer(post("/api/patients/me"), Role.PATIENT).contentType(MediaType.APPLICATION_JSON).content(body), 400, "VALIDATION_ERROR");
        }
        for (String field : List.of("id", "patientNumber", "userId", "createdBy", "createdAt", "updatedAt")) {
            error(bearer(post("/api/patients/me"), Role.PATIENT).contentType(MediaType.APPLICATION_JSON)
                    .content(BODY.replace("}", ",\"" + field + "\":\"forbidden\"}")), 400, "INVALID_JSON");
        }
        for (String body : List.of("{", BODY.replace("UNKNOWN", "unknown"), BODY.replace("2000-01-01", "2000-02-30"),
                BODY.replace("\" 000001 \"", "123"))) {
            error(bearer(post("/api/patients/me"), Role.PATIENT).contentType(MediaType.APPLICATION_JSON).content(body), 400, "INVALID_JSON");
        }
        for (String body : List.of("{}", "{\"token\":null}", "{\"token\":\" \"}", "{\"token\":\"" + "x".repeat(129) + "\"}")) {
            error(bearer(post("/api/patients/me/link"), Role.PATIENT).contentType(MediaType.APPLICATION_JSON).content(body), 400, "VALIDATION_ERROR");
        }
        for (String body : List.of("{\"token\":123}", "{\"patientNumber\":\"PAT-000001\"}", "{\"token\":\"unknown\",\"userId\":\"forbidden\"}")) {
            error(bearer(post("/api/patients/me/link"), Role.PATIENT).contentType(MediaType.APPLICATION_JSON).content(body), 400, "INVALID_JSON");
        }
    }

    @Test
    void anonymousAccessCookieCsrfAndBearerPrecedenceRemainProtected() throws Exception {
        PatientResponse profile = walkIn();
        String raw = service.issueLinkToken(actor(Role.ADMIN), profile.id().toString()).token();
        error(get("/api/patients/me"), 401, "UNAUTHORIZED");
        Cookie csrf = mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertNotNull(csrf);
        for (String path : List.of("/api/patients/me", "/api/patients/me/link", "/api/patients/" + profile.id() + "/link-tokens")) {
            error(post(path).contentType(MediaType.APPLICATION_JSON).content(BODY), 403, "FORBIDDEN");
            error(post(path).cookie(csrf).header("X-XSRF-TOKEN", csrf.getValue()).contentType(MediaType.APPLICATION_JSON).content(BODY),
                    401, "UNAUTHORIZED");
            Role role = path.endsWith("link-tokens") ? Role.ADMIN : Role.PATIENT;
            error(post(path).cookie(new Cookie("access_token", credentials.get(role))).contentType(MediaType.APPLICATION_JSON).content(BODY),
                    403, "FORBIDDEN");
        }
        mvc.perform(post("/api/patients/me/link").cookie(new Cookie("access_token", credentials.get(Role.PATIENT)), csrf)
                .header("X-XSRF-TOKEN", csrf.getValue()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(new LinkPatientRequest(raw)))).andExpect(status().isOk());
        error(bearer(get("/api/patients/me"), Role.ADMIN).cookie(new Cookie("access_token", credentials.get(Role.PATIENT))), 403, "FORBIDDEN");
        error(get("/api/patients/me").header("Authorization", "Bearer invalid")
                .cookie(new Cookie("access_token", credentials.get(Role.PATIENT))), 401, "UNAUTHORIZED");
    }

    @Test
    void rollbackRestoresBothLinkAndTokenConsumption() {
        PatientResponse profile = walkIn();
        String raw = service.issueLinkToken(actor(Role.ADMIN), profile.id().toString()).token();
        transactions.executeWithoutResult(tx -> {
            service.linkMe(actor(Role.PATIENT), new LinkPatientRequest(raw));
            tx.setRollbackOnly();
        });
        assertNull(jdbc.queryForObject("SELECT user_id FROM patients", UUID.class));
        assertNull(jdbc.queryForObject("SELECT consumed_at FROM patient_link_tokens", Timestamp.class));
        assertEquals(profile.id(), service.linkMe(actor(Role.PATIENT), new LinkPatientRequest(raw)).id());
    }

    @Test
    void migrationEnforcesTokenUniquenessOutstandingStateAndRetainedReferences() {
        PatientResponse profile = walkIn();
        service.issueLinkToken(actor(Role.ADMIN), profile.id().toString());
        String insert = "INSERT INTO patient_link_tokens(id, token_hash, patient_id, issued_by, expires_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '10 minutes')";
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(insert, UUID.randomUUID(), "a".repeat(64), profile.id(), actors.get(Role.ADMIN).getId()));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("DELETE FROM patients WHERE id = ?", profile.id()));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("DELETE FROM users WHERE id = ?", actors.get(Role.ADMIN).getId()));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("UPDATE patient_link_tokens SET consumed_at = CURRENT_TIMESTAMP, revoked_at = CURRENT_TIMESTAMP"));
        jdbc.update("UPDATE patient_link_tokens SET revoked_at = CURRENT_TIMESTAMP");
        String existingHash = jdbc.queryForObject("SELECT token_hash FROM patient_link_tokens", String.class);
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(insert, UUID.randomUUID(), existingHash, profile.id(), actors.get(Role.ADMIN).getId()));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(insert, UUID.randomUUID(), "b".repeat(64), UUID.randomUUID(), actors.get(Role.ADMIN).getId()));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(insert, UUID.randomUUID(), "b".repeat(64), profile.id(), UUID.randomUUID()));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(insert, UUID.randomUUID(), "not-a-hash", profile.id(), actors.get(Role.ADMIN).getId()));
    }

    @Test
    void concurrentSelfCreatesProduceOneProfileAndOneConflict() throws Exception {
        List<String> outcomes = together(() -> outcome(() -> service.createMe(actor(Role.PATIENT), REQUEST)),
                () -> outcome(() -> service.createMe(actor(Role.PATIENT), REQUEST)));
        assertEquals(1, Collections.frequency(outcomes, "ok"));
        assertEquals(1, Collections.frequency(outcomes, "PATIENT_LINK_CONFLICT"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM patients", Integer.class));
    }

    @Test
    void concurrentClaimsOfOneTokenLinkExactlyOneAccount() throws Exception {
        PatientResponse profile = walkIn();
        String raw = service.issueLinkToken(actor(Role.ADMIN), profile.id().toString()).token();
        UserAccount other = active("other", Role.PATIENT);
        List<String> outcomes = together(() -> outcome(() -> service.linkMe(actor(Role.PATIENT), new LinkPatientRequest(raw))),
                () -> outcome(() -> service.linkMe(actor(other), new LinkPatientRequest(raw))));
        assertEquals(1, Collections.frequency(outcomes, "ok"));
        assertEquals(1, Collections.frequency(outcomes, "INVALID_PATIENT_LINK_TOKEN"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM patients WHERE user_id IS NOT NULL", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM patient_link_tokens WHERE consumed_at IS NOT NULL", Integer.class));
    }

    @Test
    void concurrentClaimsOfDifferentProfilesForOneAccountLeaveLosingTokenUsable() throws Exception {
        String first = service.issueLinkToken(actor(Role.ADMIN), walkIn().id().toString()).token();
        String second = service.issueLinkToken(actor(Role.ADMIN), walkIn().id().toString()).token();
        List<String> outcomes = together(() -> outcome(() -> service.linkMe(actor(Role.PATIENT), new LinkPatientRequest(first))),
                () -> outcome(() -> service.linkMe(actor(Role.PATIENT), new LinkPatientRequest(second))));
        assertEquals(1, Collections.frequency(outcomes, "ok"));
        assertEquals(1, Collections.frequency(outcomes, "PATIENT_LINK_CONFLICT"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM patients WHERE user_id IS NOT NULL", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM patient_link_tokens WHERE consumed_at IS NULL AND revoked_at IS NULL", Integer.class));
    }

    @Test
    void concurrentSelfCreateAndClaimShareOneAccountSlot() throws Exception {
        String raw = service.issueLinkToken(actor(Role.ADMIN), walkIn().id().toString()).token();
        List<String> outcomes = together(() -> outcome(() -> service.createMe(actor(Role.PATIENT), REQUEST)),
                () -> outcome(() -> service.linkMe(actor(Role.PATIENT), new LinkPatientRequest(raw))));
        assertEquals(1, Collections.frequency(outcomes, "ok"));
        assertEquals(1, Collections.frequency(outcomes, "PATIENT_LINK_CONFLICT"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM patients WHERE user_id IS NOT NULL", Integer.class));
    }

    @Test
    void concurrentReissuesLeaveOnlyOneUsableToken() throws Exception {
        PatientResponse profile = walkIn();
        List<String> raw = together(() -> service.issueLinkToken(actor(Role.ADMIN), profile.id().toString()).token(),
                () -> service.issueLinkToken(actor(Role.RECEPTIONIST), profile.id().toString()).token());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM patient_link_tokens WHERE revoked_at IS NULL AND consumed_at IS NULL", Integer.class));
        List<String> outcomes = raw.stream().map(t -> outcome(() -> service.linkMe(actor(Role.PATIENT), new LinkPatientRequest(t)))).toList();
        assertEquals(1, Collections.frequency(outcomes, "ok"));
        assertEquals(1, Collections.frequency(outcomes, "INVALID_PATIENT_LINK_TOKEN"));
    }

    @Test
    void concurrentReissueAndClaimCannotUseRevokedTokenOrIssueForLinkedProfile() throws Exception {
        PatientResponse profile = walkIn();
        String raw = service.issueLinkToken(actor(Role.ADMIN), profile.id().toString()).token();
        List<String> outcomes = together(() -> outcome(() -> service.issueLinkToken(actor(Role.RECEPTIONIST), profile.id().toString())),
                () -> outcome(() -> service.linkMe(actor(Role.PATIENT), new LinkPatientRequest(raw))));
        assertEquals(1, Collections.frequency(outcomes, "ok"));
        assertTrue(outcomes.contains("PATIENT_LINK_CONFLICT") || outcomes.contains("INVALID_PATIENT_LINK_TOKEN"));
        int consumed = jdbc.queryForObject("SELECT count(*) FROM patient_link_tokens WHERE consumed_at IS NOT NULL", Integer.class);
        int linked = jdbc.queryForObject("SELECT count(*) FROM patients WHERE user_id IS NOT NULL", Integer.class);
        assertEquals(consumed, linked);
    }

    @Test
    void concurrentStaffUpdateAndLinkPreserveBothDemographicsAndOwnership() throws Exception {
        PatientResponse profile = walkIn();
        String raw = service.issueLinkToken(actor(Role.ADMIN), profile.id().toString()).token();
        var replacement = new com.smartlims.patients.dto.UpdatePatientRequest("Updated Synthetic Profile",
                REQUEST.dateOfBirth(), REQUEST.gender(), "000002", null);
        List<String> outcomes = together(() -> outcome(() -> service.update(actor(Role.RECEPTIONIST), profile.id().toString(), replacement)),
                () -> outcome(() -> service.linkMe(actor(Role.PATIENT), new LinkPatientRequest(raw))));
        assertEquals(List.of("ok", "ok"), outcomes);
        PatientResponse result = service.getMe(actor(Role.PATIENT));
        assertEquals(profile.id(), result.id());
        assertEquals("Updated Synthetic Profile", result.fullName());
        assertEquals("000002", result.phoneNumber());
        assertNull(result.address());
        assertEquals(profile.createdAt(), result.createdAt());
        assertEquals("Synthetic Account", users.findById(actors.get(Role.PATIENT).getId()).orElseThrow().getFullName());
    }

    private String outcome(Supplier<?> operation) {
        try { operation.get(); return "ok"; }
        catch (PatientProfileException error) { return error.getCode(); }
    }

    private <T> List<T> together(Callable<T> first, Callable<T> second) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<T> a = executor.submit(() -> { ready.countDown(); assertTrue(start.await(10, TimeUnit.SECONDS)); return first.call(); });
            Future<T> b = executor.submit(() -> { ready.countDown(); assertTrue(start.await(10, TimeUnit.SECONDS)); return second.call(); });
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            return List.of(a.get(30, TimeUnit.SECONDS), b.get(30, TimeUnit.SECONDS));
        }
    }
}
