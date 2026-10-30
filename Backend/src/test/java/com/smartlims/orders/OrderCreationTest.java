package com.smartlims.orders;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.JwtKeyConfiguration;
import com.smartlims.labtests.entity.LabTest;
import com.smartlims.labtests.repository.LabTestRepository;
import com.smartlims.orders.dto.CreateSelfOrderRequest;
import com.smartlims.orders.dto.CreateStaffOrderRequest;
import com.smartlims.orders.dto.OrderDetailResponse;
import com.smartlims.orders.exception.OrderException;
import com.smartlims.orders.repository.TestOrderRepository;
import com.smartlims.orders.service.OrderService;
import com.smartlims.patients.entity.Patient;
import com.smartlims.patients.entity.PatientGender;
import com.smartlims.patients.repository.PatientRepository;
import jakarta.servlet.http.Cookie;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class OrderCreationTest extends IsolatedPostgresTest {
    @Autowired MockMvc mvc;
    @Autowired UserAccountRepository users;
    @Autowired PatientRepository patients;
    @Autowired LabTestRepository tests;
    @MockitoSpyBean TestOrderRepository orders;
    @Autowired OrderService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    @Autowired JwtEncoder encoder;
    @Autowired PlatformTransactionManager transactionManager;
    @MockitoBean VerificationEmailSender email;
    private final Map<Role, UserAccount> actors = new EnumMap<>(Role.class);
    private final Map<Role, String> tokens = new EnumMap<>(Role.class);
    private Patient own;
    private Patient other;
    private LabTest first;
    private LabTest second;
    private LabTest inactive;

    @BeforeEach
    void fixtures() {
        jdbc.execute("TRUNCATE TABLE laboratory_events,result_specimens,result_values,test_results,specimen_attestations,samples,visit_items,visits,test_parameters,appointment_reschedules,appointments,appointment_slots,appointment_types,order_items,test_orders,lab_test_categories,lab_tests,patient_link_tokens,patients,email_action_tokens,users");
        for (Role role : Role.values()) {
            UserAccount actor = UserAccount.invite("Synthetic order actor", role.name().toLowerCase(Locale.ROOT)
                    + "@example.invalid", null, null, role);
            actor.acceptInvitation("test-only-unused-hash", Instant.now());
            actor = users.saveAndFlush(actor);
            actors.put(role, actor);
            Instant now = Instant.now();
            var claims = JwtClaimsSet.builder().subject(actor.getId().toString()).issuer(JwtKeyConfiguration.ISSUER)
                    .audience(List.of(JwtKeyConfiguration.AUDIENCE)).issuedAt(now).expiresAt(now.plusSeconds(600)).build();
            tokens.put(role, encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue());
        }
        own = new Patient("PAT-" + patients.nextPatientNumber(), actors.get(Role.ADMIN), "Synthetic linked profile",
                LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000001", null);
        own.linkAccount(actors.get(Role.PATIENT));
        own = patients.saveAndFlush(own);
        other = patients.saveAndFlush(new Patient("PAT-" + patients.nextPatientNumber(), actors.get(Role.ADMIN),
                "Synthetic unlinked profile", LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000002", null));
        first = tests.saveAndFlush(new LabTest("Z_SYN", "Synthetic first test", null, new BigDecimal("25.50"), "SYNTHETIC", null));
        second = tests.saveAndFlush(new LabTest("A_SYN", "Synthetic free test", null, new BigDecimal("0.00"), "SYNTHETIC", null));
        inactive = new LabTest("I_SYN", "Synthetic inactive test", null, new BigDecimal("1.00"), "SYNTHETIC", null);
        inactive.setActive(false);
        inactive = tests.saveAndFlush(inactive);
    }

    private Authentication actor(Role role) {
        return UsernamePasswordAuthenticationToken.authenticated(actors.get(role).getId().toString(), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }

    private String body(UUID... ids) {
        return json.writeValueAsString(Map.of("testIds", Arrays.stream(ids).map(UUID::toString).toList()));
    }

    private String staffBody(Patient patient, UUID... ids) {
        return json.writeValueAsString(Map.of("patientId", patient.getId().toString(), "testIds", Arrays.stream(ids).map(UUID::toString).toList()));
    }

    private MockHttpServletRequestBuilder request(Role role, boolean self, String key, String body) {
        var request = post(self ? "/api/orders/me" : "/api/orders").contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + tokens.get(role)).content(body);
        if (key != null) request.header("Idempotency-Key", key);
        return request;
    }

    private OrderDetailResponse detail(MvcResult result) {
        return json.readValue(result.getResponse().getContentAsByteArray(), OrderDetailResponse.class);
    }

    private void error(ResultActions result, int status, String code, String field) throws Exception {
        var response = result.andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code))
                .andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse();
        var parsed = json.readTree(response.getContentAsString());
        assertEquals(response.getHeader("X-Request-Id"), parsed.get("requestId").asString());
        assertEquals(Set.of("code", "message", "fieldErrors", "requestId"), json.readValue(response.getContentAsString(), Map.class).keySet());
        if (field != null) assertTrue(parsed.get("fieldErrors").has(field));
        else assertEquals(0, parsed.get("fieldErrors").size());
    }

    private int count(String table) { return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class); }
    private CreateSelfOrderRequest selection(UUID... ids) { return new CreateSelfOrderRequest(Arrays.stream(ids).map(UUID::toString).toList()); }
    private List<String> key() { return List.of(UUID.randomUUID().toString()); }

    @Test
    void patientCreateReturnsCompleteSnapshotDetailAndPersistsOnlyTheLinkedProfile() throws Exception {
        var result = mvc.perform(request(Role.PATIENT, true, key().getFirst(), body(first.getId(), second.getId())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.testCount").value(2)).andExpect(jsonPath("$.totalAmount").value(25.50))
                .andExpect(jsonPath("$.currency").value("ILS")).andExpect(jsonPath("$.canCancel").value(true))
                .andExpect(jsonPath("$.visitDetailsAvailable").value(false)).andReturn();
        OrderDetailResponse order = detail(result);
        assertEquals("/api/orders/me/" + order.id(), result.getResponse().getHeader("Location"));
        assertTrue(order.orderNumber().matches("ORD-[0-9]{6,19}"));
        assertEquals(own.getId(), order.patientId());
        assertEquals(new BigDecimal("25.50"), order.totalAmount());
        assertEquals(List.of("A_SYN", "Z_SYN"), order.items().stream().map(item -> item.testCode()).toList());
        assertEquals("Synthetic first test", order.items().get(1).testName());
        assertEquals(first.getId(), order.items().get(1).labTestId());
        assertNull(order.cancelledAt());
        assertNull(order.cancellationReason());
        assertEquals(actors.get(Role.PATIENT).getId(), jdbc.queryForObject("SELECT created_by FROM test_orders WHERE id=?", UUID.class, order.id()));
        assertEquals(1, count("test_orders"));
        assertEquals(2, count("order_items"));
        assertEquals(2, count("patients"));
        assertEquals(Set.of("id", "orderNumber", "createdAt", "updatedAt", "testCount", "totalAmount", "currency", "status",
                "canCancel", "visitDetailsAvailable", "patientId", "items", "cancelledAt", "cancellationReason"),
                json.readValue(result.getResponse().getContentAsString(), Map.class).keySet());
        assertEquals(Set.of("id", "labTestId", "testCode", "testName", "priceAtOrder"),
                ((Map<?, ?>) ((List<?>) json.readValue(result.getResponse().getContentAsString(), Map.class).get("items")).getFirst()).keySet());
        verifyNoInteractions(email);
    }

    @Test
    void bothStaffRolesCreateForLinkedOrUnlinkedProfilesWithoutStaffLocation() throws Exception {
        for (Role role : List.of(Role.ADMIN, Role.RECEPTIONIST)) for (Patient target : List.of(own, other)) {
            var request = request(role, false, key().getFirst(), staffBody(target, second.getId()));
            var result = mvc.perform(request).andExpect(status().isCreated()).andExpect(header().doesNotExist("Location"))
                    .andExpect(jsonPath("$.totalAmount").value(0.00)).andReturn();
            assertEquals(target.getId(), detail(result).patientId());
            assertEquals(detail(result), detail(mvc.perform(request).andExpect(status().isOk()).andExpect(header().doesNotExist("Location")).andReturn()));
        }
        assertEquals(4, count("test_orders"));
        assertEquals(2, count("patients"));
    }

    @Test
    void creationAndPatientReadsHaveExactRolesWhileOtherRoutesStayDenied() throws Exception {
        for (Role role : Role.values()) {
            if (role != Role.PATIENT) error(mvc.perform(request(role, true, key().getFirst(), body(first.getId()))), 403, "FORBIDDEN", null);
            if (role == Role.PATIENT || role == Role.LAB_TECHNICIAN)
                error(mvc.perform(request(role, false, key().getFirst(), staffBody(other, first.getId()))), 403, "FORBIDDEN", null);
            for (String path : List.of("/api/orders", "/api/orders/" + UUID.randomUUID())) {
                mvc.perform(get(path).header("Authorization", "Bearer " + tokens.get(role))).andExpect(status().isForbidden());
            }
            mvc.perform(get("/api/orders/me").header("Authorization", "Bearer " + tokens.get(role)))
                    .andExpect(status().is(role == Role.PATIENT ? 200 : 403));
            mvc.perform(get("/api/orders/me/" + UUID.randomUUID()).header("Authorization", "Bearer " + tokens.get(role)))
                    .andExpect(status().is(role == Role.PATIENT ? 404 : 403));
            mvc.perform(post("/api/orders/" + UUID.randomUUID() + "/cancel").header("Authorization", "Bearer " + tokens.get(role))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Synthetic cancellation\"}"))
                    .andExpect(status().is(role == Role.LAB_TECHNICIAN ? 403 : 404));
        }
        mvc.perform(post("/api/orders/me").contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer invalid")
                .content(body(first.getId()))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/orders/me").contentType(MediaType.APPLICATION_JSON).content(body(first.getId()))).andExpect(status().isForbidden());
        assertEquals(0, count("test_orders"));
    }

    @Test
    void missingProfilesAreTypedErrorsAndNeverAutoCreatedOrLinked() throws Exception {
        jdbc.update("UPDATE patients SET user_id=NULL WHERE id=?", own.getId());
        error(mvc.perform(request(Role.PATIENT, true, key().getFirst(), body(first.getId()))), 404, "PATIENT_PROFILE_NOT_LINKED", null);
        error(mvc.perform(request(Role.ADMIN, false, key().getFirst(), staffBody(other, first.getId())).content(
                json.writeValueAsString(Map.of("patientId", UUID.randomUUID().toString(), "testIds", List.of(first.getId().toString()))))),
                404, "PATIENT_NOT_FOUND", null);
        assertEquals(2, count("patients"));
        assertEquals(0, count("test_orders"));
    }

    @Test
    void strictJsonRejectsTrustedFieldsAndWrongTypesWithoutWrites() throws Exception {
        for (String field : List.of("patientId", "userId", "id", "orderNumber", "price", "prices", "currency", "totalAmount",
                "status", "createdBy", "role", "notes", "cancelledAt", "appointmentId", "paymentId", "visitId")) {
            error(mvc.perform(request(Role.PATIENT, true, key().getFirst(),
                    body(first.getId()).replaceFirst("}$", ",\"" + field + "\":\"untrusted\"}"))), 400, "INVALID_JSON", null);
        }
        for (String value : List.of("1", "true", "{}", "\"test\"", "[1]", "[true]", "[{}]", "[[]]")) {
            error(mvc.perform(request(Role.PATIENT, true, key().getFirst(), "{\"testIds\":" + value + "}")), 400, "INVALID_JSON", null);
        }
        for (String body : List.of("", "{", "null", "[]", "1"))
            error(mvc.perform(request(Role.PATIENT, true, key().getFirst(), body)), 400, "INVALID_JSON", null);
        for (String value : List.of("1", "true", "[]", "{}")) {
            error(mvc.perform(request(Role.ADMIN, false, key().getFirst(), "{\"patientId\":" + value + ",\"testIds\":[]}")), 400, "INVALID_JSON", null);
        }
        error(mvc.perform(request(Role.ADMIN, false, key().getFirst(), staffBody(other, first.getId())
                .replaceFirst("}$", ",\"status\":\"COMPLETED\"}"))), 400, "INVALID_JSON", null);
        assertEquals(0, count("test_orders"));
        assertEquals(0, count("order_items"));
    }

    @Test
    void typedMissingBlankDuplicateAndOversizedInputsUseFieldValidation() throws Exception {
        for (String body : List.of("{}", "{\"testIds\":null}", "{\"testIds\":[]}", "{\"testIds\":[null]}",
                "{\"testIds\":[\"\"]}", "{\"testIds\":[\"1-1-1-1-1\"]}", "{\"testIds\":[\" " + first.getId() + "\"]}",
                "{\"testIds\":[\"" + first.getId() + "\",\"" + first.getId().toString().toUpperCase() + "\"]}",
                json.writeValueAsString(Map.of("testIds", java.util.stream.IntStream.range(0, 101).mapToObj(i -> UUID.randomUUID().toString()).toList())))) {
            error(mvc.perform(request(Role.PATIENT, true, key().getFirst(), body)), 400, "VALIDATION_ERROR", "testIds");
        }
        for (String value : List.of("null", "\"\"", "\" \"", "\"1-1-1-1-1\"", "\" " + other.getId() + "\"")) {
            error(mvc.perform(request(Role.ADMIN, false, key().getFirst(), "{\"patientId\":" + value + ",\"testIds\":[\"" + first.getId() + "\"]}")),
                    400, "VALIDATION_ERROR", "patientId");
        }
        error(mvc.perform(request(Role.ADMIN, false, key().getFirst(), body(first.getId()))), 400, "VALIDATION_ERROR", "patientId");
        assertEquals(0, count("test_orders"));
    }

    @Test
    void idempotencyKeyRequiresExactlyOneCanonicalUuidHeader() throws Exception {
        for (String key : Arrays.asList(null, "", " ", "bad", "1-1-1-1-1", " " + UUID.randomUUID(), UUID.randomUUID() + " ", UUID.randomUUID() + "," + UUID.randomUUID())) {
            error(mvc.perform(request(Role.PATIENT, true, key, body(first.getId()))), 400, "VALIDATION_ERROR", "idempotencyKey");
        }
        String key = key().getFirst();
        error(mvc.perform(request(Role.PATIENT, true, key, body(first.getId())).header("Idempotency-Key", key)),
                400, "VALIDATION_ERROR", "idempotencyKey");
        var created = mvc.perform(request(Role.PATIENT, true, key.toUpperCase(), body(first.getId()).toUpperCase(Locale.ROOT)
                .replace("TESTIDS", "testIds"))).andExpect(status().isCreated()).andReturn();
        var replay = mvc.perform(request(Role.PATIENT, true, key, body(first.getId()))).andExpect(status().isOk()).andReturn();
        assertEquals(detail(created), detail(replay));
    }

    @Test
    void allRolesRejectMissingOrInactiveSelectionsAtomicallyAndCanRetryTheSameKeyAfterFailure() throws Exception {
        for (Role role : List.of(Role.PATIENT, Role.ADMIN, Role.RECEPTIONIST)) {
            String key = key().getFirst();
            for (UUID bad : List.of(inactive.getId(), UUID.randomUUID())) {
                boolean self = role == Role.PATIENT;
                error(mvc.perform(request(role, self, key, self ? body(first.getId(), bad) : staffBody(other, first.getId(), bad))),
                        409, "ORDER_TEST_UNAVAILABLE", "testIds");
            }
            assertEquals(0, count("test_orders"));
            assertEquals(0, count("order_items"));
        }
        String key = key().getFirst();
        error(mvc.perform(request(Role.PATIENT, true, key, body(inactive.getId()))), 409, "ORDER_TEST_UNAVAILABLE", "testIds");
        jdbc.update("UPDATE lab_tests SET active=true WHERE id=?", inactive.getId());
        mvc.perform(request(Role.PATIENT, true, key, body(inactive.getId()))).andExpect(status().isCreated());
    }

    @Test
    void retriesNormalizeSelectionCaseAndOrderAndPreserveSnapshotsAndAllTimestamps() throws Exception {
        String key = key().getFirst();
        var created = mvc.perform(request(Role.PATIENT, true, key, body(first.getId(), second.getId())))
                .andExpect(status().isCreated()).andReturn();
        OrderDetailResponse before = detail(created);
        jdbc.update("UPDATE lab_tests SET code='CHANGED_SYN',name='Synthetic renamed test',price=99.99,active=false WHERE id=?", first.getId());
        var replay = mvc.perform(request(Role.PATIENT, true, key.toUpperCase(), body(second.getId(), first.getId())))
                .andExpect(status().isOk()).andReturn();
        assertEquals(before, detail(replay));
        assertEquals(created.getResponse().getHeader("Location"), replay.getResponse().getHeader("Location"));
        assertEquals(1, count("test_orders"));
        assertEquals(2, count("order_items"));
        List<String> sorted = List.of(first.getId().toString(), second.getId().toString()).stream().sorted().toList();
        String canonical = "{\"operation\":\"SELF\",\"patientId\":\"" + own.getId() + "\",\"testIds\":[\"" + sorted.get(0) + "\",\"" + sorted.get(1) + "\"]}";
        assertEquals(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8))),
                jdbc.queryForObject("SELECT request_hash FROM test_orders WHERE id=?", String.class, before.id()));
    }

    @Test
    void sameKeyDifferentIntentConflictsBeforeCatalogAdmissionWhileNewKeysAllowIntentionalRepeats() throws Exception {
        String key = key().getFirst();
        mvc.perform(request(Role.PATIENT, true, key, body(first.getId()))).andExpect(status().isCreated());
        error(mvc.perform(request(Role.PATIENT, true, key, body(inactive.getId()))), 409, "IDEMPOTENCY_KEY_REUSED", "idempotencyKey");
        mvc.perform(request(Role.PATIENT, true, key().getFirst(), body(first.getId()))).andExpect(status().isCreated());
        String staffKey = key().getFirst();
        mvc.perform(request(Role.ADMIN, false, staffKey, staffBody(own, first.getId()))).andExpect(status().isCreated());
        error(mvc.perform(request(Role.ADMIN, false, staffKey, staffBody(other, first.getId()))), 409, "IDEMPOTENCY_KEY_REUSED", "idempotencyKey");
        mvc.perform(request(Role.RECEPTIONIST, false, staffKey, staffBody(own, first.getId()))).andExpect(status().isCreated());
        assertEquals(4, count("test_orders"));
    }

    @Test
    void replayReturnsCurrentStoredStateWithoutChangingCancellationHistory() throws Exception {
        String key = key().getFirst();
        UUID id = detail(mvc.perform(request(Role.PATIENT, true, key, body(first.getId()))).andExpect(status().isCreated()).andReturn()).id();
        for (String state : List.of("IN_PROGRESS", "COMPLETED", "CANCELLED")) {
            if (state.equals("CANCELLED")) jdbc.update("UPDATE test_orders SET status=?,cancelled_by=?,cancelled_at=created_at,"
                    + "cancellation_reason='Synthetic prior cancellation' WHERE id=?", state, actors.get(Role.ADMIN).getId(), id);
            else jdbc.update("UPDATE test_orders SET status=? WHERE id=?", state, id);
            var before = jdbc.queryForMap("SELECT * FROM test_orders WHERE id=?", id);
            var replay = detail(mvc.perform(request(Role.PATIENT, true, key, body(first.getId())))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value(state))
                    .andExpect(jsonPath("$.canCancel").value(false)).andReturn());
            assertEquals(id, replay.id());
            assertEquals(new BigDecimal("25.50"), replay.totalAmount());
            assertEquals(before, jdbc.queryForMap("SELECT * FROM test_orders WHERE id=?", id));
        }
    }

    @Test
    void replayRechecksStoredEligibilityRoleAndOwnershipAndScopesIntentAcrossBothRoutes() throws Exception {
        List<String> key = key();
        service.createMe(actor(Role.PATIENT), selection(first.getId()), key);
        jdbc.update("UPDATE users SET enabled=false WHERE id=?", actors.get(Role.PATIENT).getId());
        assertEquals("UNAUTHORIZED", assertThrows(OrderException.class, () -> service.createMe(actor(Role.PATIENT), selection(first.getId()), key)).getCode());
        jdbc.update("UPDATE users SET enabled=true,role='ADMIN',invitation_accepted_at=CURRENT_TIMESTAMP WHERE id=?", actors.get(Role.PATIENT).getId());
        assertEquals("FORBIDDEN", assertThrows(OrderException.class, () -> service.createMe(actor(Role.PATIENT), selection(first.getId()), key)).getCode());
        Authentication changedRole = UsernamePasswordAuthenticationToken.authenticated(actors.get(Role.PATIENT).getId().toString(), null,
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        assertEquals("IDEMPOTENCY_KEY_REUSED", assertThrows(OrderException.class, () -> service.create(changedRole,
                new CreateStaffOrderRequest(own.getId().toString(), List.of(first.getId().toString())), key)).getCode());
        jdbc.update("UPDATE users SET role='PATIENT' WHERE id=?", actors.get(Role.PATIENT).getId());
        jdbc.update("UPDATE patients SET user_id=NULL WHERE id=?", own.getId());
        assertEquals("PATIENT_PROFILE_NOT_LINKED", assertThrows(OrderException.class,
                () -> service.createMe(actor(Role.PATIENT), selection(first.getId()), key)).getCode());
        assertEquals(1, count("test_orders"));
    }

    @Test
    void directServiceCallsEnforceValidationAndDoNotTrustClaimedRoles() {
        assertThrows(jakarta.validation.ConstraintViolationException.class, () -> service.createMe(actor(Role.PATIENT), new CreateSelfOrderRequest(List.of()), key()));
        assertThrows(jakarta.validation.ConstraintViolationException.class, () -> service.createMe(actor(Role.PATIENT), null, key()));
        assertEquals("UNAUTHORIZED", assertThrows(OrderException.class, () -> service.createMe(null, selection(first.getId()), key())).getCode());
        Authentication claimedAdmin = UsernamePasswordAuthenticationToken.authenticated(actors.get(Role.PATIENT).getId().toString(), null,
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        assertEquals("FORBIDDEN", assertThrows(OrderException.class, () -> service.create(claimedAdmin,
                new CreateStaffOrderRequest(other.getId().toString(), List.of(first.getId().toString())), key())).getCode());
        assertEquals(0, count("test_orders"));
    }

    @Test
    void maximumSelectionUsesExactTotalsAndOrderNumbersExpandBeyondSixDigits() throws Exception {
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 100; i++) ids.add(tests.saveAndFlush(new LabTest("MAX_SYN_" + i, "Synthetic maximum test " + i,
                null, new BigDecimal("9999999999.99"), "SYNTHETIC", null)).getId().toString());
        // This sequence change is confined to the independently verified disposable test database.
        jdbc.queryForObject("SELECT setval('order_number_seq',1000000,false)", Long.class);
        var result = mvc.perform(request(Role.PATIENT, true, key().getFirst(), json.writeValueAsString(Map.of("testIds", ids))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.orderNumber").value("ORD-1000000")).andReturn();
        assertEquals(100, detail(result).testCount());
        assertEquals(new BigDecimal("999999999999.00"), detail(result).totalAmount());
        assertEquals(100, count("order_items"));
    }

    @Test
    void cookieWritesRequireCsrfAndBearerTakesPrecedence() throws Exception {
        var csrf = mvc.perform(get("/api/auth/csrf-token")).andExpect(status().isOk()).andReturn().getResponse();
        Cookie xsrf = csrf.getCookie("XSRF-TOKEN");
        assertNotNull(xsrf);
        String raw = xsrf.getValue();
        var base = post("/api/orders/me").contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key().getFirst()).content(body(first.getId()));
        mvc.perform(base.cookie(new Cookie("access_token", tokens.get(Role.PATIENT)))).andExpect(status().isForbidden());
        mvc.perform(base.cookie(xsrf).header("X-XSRF-TOKEN", raw)).andExpect(status().isCreated());
        mvc.perform(request(Role.PATIENT, true, key().getFirst(), body(first.getId()))
                .cookie(new Cookie("access_token", tokens.get(Role.ADMIN)))).andExpect(status().isCreated());
        mvc.perform(base.header("Authorization", "Bearer invalid")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/orders/me").contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", key().getFirst())
                .content(body(first.getId())).cookie(xsrf).header("X-XSRF-TOKEN", raw)).andExpect(status().isUnauthorized());
    }

    @Test
    void corsAllowsRetryHeaderOnlyForConfiguredOrigins() throws Exception {
        mvc.perform(options("/api/orders/me").header("Origin", "http://localhost:5173")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "content-type,authorization,idempotency-key"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"))
                .andExpect(header().string("Access-Control-Allow-Headers", org.hamcrest.Matchers.containsString("idempotency-key")))
                .andExpect(header().string("Access-Control-Expose-Headers", "Location, X-Request-Id"));
        mvc.perform(options("/api/orders/me").header("Origin", "https://untrusted.example.invalid")
                .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "Idempotency-Key"))
                .andExpect(status().isForbidden());
    }

    @Test
    void failedFinalItemWriteRollsBackEverythingAndAllowsTheOriginalKeyToBeRetried() throws Exception {
        UUID lastTest = first.getId().toString().compareTo(second.getId().toString()) > 0 ? first.getId() : second.getId();
        jdbc.execute("CREATE FUNCTION synthetic_reject_order_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
                + "IF NEW.lab_test_id='" + lastTest + "'::uuid THEN RAISE EXCEPTION 'synthetic failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$");
        jdbc.execute("CREATE TRIGGER synthetic_reject_order_item BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION synthetic_reject_order_item()");
        String key = key().getFirst();
        try {
            error(mvc.perform(request(Role.PATIENT, true, key, body(first.getId(), second.getId()))), 500, "INTERNAL_SERVER_ERROR", null);
            assertEquals(0, count("test_orders"));
            assertEquals(0, count("order_items"));
        } finally {
            jdbc.execute("DROP TRIGGER synthetic_reject_order_item ON order_items");
            jdbc.execute("DROP FUNCTION synthetic_reject_order_item()");
        }
        mvc.perform(request(Role.PATIENT, true, key, body(first.getId(), second.getId()))).andExpect(status().isCreated());
        assertEquals(1, count("test_orders"));
        assertEquals(2, count("order_items"));
    }

    @Test
    void uniqueCollisionRollsBackBeforeWinnerLookupInANewTransaction() {
        List<String> key = key();
        var winner = service.createMe(actor(Role.PATIENT), selection(first.getId()), key).order();
        UUID actorId = actors.get(Role.PATIENT).getId();
        UUID retryKey = UUID.fromString(key.getFirst());
        // Force a missed precheck so the real PostgreSQL unique constraint aborts the create.
        AtomicBoolean firstLookup = new AtomicBoolean(true);
        List<String> transactionNames = new ArrayList<>();
        doAnswer(invocation -> {
            transactionNames.add(org.springframework.transaction.support.TransactionSynchronizationManager.getCurrentTransactionName());
            return firstLookup.getAndSet(false) ? Optional.empty() : orders.findById(winner.id());
        }).when(orders).findByCreatedBy_IdAndIdempotencyKey(actorId, retryKey);
        var replay = service.createMe(actor(Role.PATIENT), selection(first.getId()), key);
        assertFalse(replay.created());
        assertEquals(winner, replay.order());
        assertEquals(1, count("test_orders"));
        assertEquals(1, count("order_items"));
        assertEquals(2, transactionNames.size());
        assertTrue(transactionNames.get(0).endsWith("OrderCreationTransactions.create"));
        assertTrue(transactionNames.get(1).endsWith("OrderCreationTransactions.replay"));
    }

    @Test
    void creationRejectsEveryIneligibleAccountStateUsingCurrentStoredData() throws Exception {
        UUID actorId = actors.get(Role.PATIENT).getId();
        for (String change : List.of("enabled=false", "email_verified_at=NULL", "password_hash=NULL", "invitation_accepted_at=NULL")) {
            var original = jdbc.queryForMap("SELECT enabled,email_verified_at,password_hash,invitation_accepted_at FROM users WHERE id=?", actorId);
            jdbc.update("UPDATE users SET " + change + " WHERE id=?", actorId);
            mvc.perform(request(Role.PATIENT, true, key().getFirst(), body(first.getId()))).andExpect(status().isUnauthorized());
            assertEquals("UNAUTHORIZED", assertThrows(OrderException.class,
                    () -> service.createMe(actor(Role.PATIENT), selection(first.getId()), key())).getCode());
            jdbc.update("UPDATE users SET enabled=?,email_verified_at=?,password_hash=?,invitation_accepted_at=? WHERE id=?",
                    original.get("enabled"), original.get("email_verified_at"), original.get("password_hash"), original.get("invitation_accepted_at"), actorId);
        }
        assertEquals(0, count("test_orders"));
    }

    @Test
    void concurrentMatchingRetriesReturnOneCreatedOrderAndOneReplay() throws Exception {
        List<String> key = key();
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var a = executor.submit(() -> { start.await(); return service.createMe(actor(Role.PATIENT), selection(first.getId(), second.getId()), key); });
            var b = executor.submit(() -> { start.await(); return service.createMe(actor(Role.PATIENT), selection(second.getId(), first.getId()), key); });
            start.countDown();
            var first = a.get(15, TimeUnit.SECONDS);
            var second = b.get(15, TimeUnit.SECONDS);
            assertNotEquals(first.created(), second.created());
            assertEquals(first.order(), second.order());
        }
        assertEquals(1, count("test_orders"));
        assertEquals(2, count("order_items"));
    }

    @Test
    void concurrentConflictingRetriesLeaveOneCompleteWinner() throws Exception {
        List<String> key = key();
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            List<Future<String>> results = new ArrayList<>();
            for (UUID id : List.of(first.getId(), second.getId())) results.add(executor.submit(() -> {
                start.await();
                try { service.createMe(actor(Role.PATIENT), selection(id), key); return "CREATED"; }
                catch (OrderException error) { return error.getCode(); }
            }));
            start.countDown();
            assertEquals(Set.of("CREATED", "IDEMPOTENCY_KEY_REUSED"), Set.of(results.get(0).get(15, TimeUnit.SECONDS), results.get(1).get(15, TimeUnit.SECONDS)));
        }
        assertEquals(1, count("test_orders"));
        assertEquals(1, count("order_items"));
    }

    @Test
    void concurrentDistinctKeysAndActorsKeepIndependentOrdersAndSequenceNumbers() throws Exception {
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(4)) {
            List<Future<UUID>> results = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                Role role = i % 2 == 0 ? Role.ADMIN : Role.RECEPTIONIST;
                List<String> key = key();
                results.add(executor.submit(() -> { start.await(); return service.create(actor(role),
                        new CreateStaffOrderRequest(other.getId().toString(), List.of(first.getId().toString())), key).order().id(); }));
            }
            start.countDown();
            Set<UUID> ids = new HashSet<>();
            for (var result : results) ids.add(result.get(15, TimeUnit.SECONDS));
            assertEquals(4, ids.size());
        }
        assertEquals(4, count("test_orders"));
        assertEquals(4, jdbc.queryForObject("SELECT count(DISTINCT order_number) FROM test_orders", Integer.class));
    }

    @Test
    void snapshotReadWaitsForCatalogWriterThenUsesTheCommittedAvailability() throws Exception {
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var started = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var writer = executor.submit(() -> new TransactionTemplate(transactionManager).execute(status -> {
                LabTest changed = tests.findForUpdate(first.getId()).orElseThrow();
                changed.setActive(false);
                tests.flush();
                locked.countDown();
                try { assertTrue(release.await(10, TimeUnit.SECONDS)); }
                catch (InterruptedException error) { throw new IllegalStateException(error); }
                return true;
            }));
            assertTrue(locked.await(5, TimeUnit.SECONDS));
            var creator = executor.submit(() -> {
                started.countDown();
                try { service.createMe(actor(Role.PATIENT), selection(first.getId()), key()); return "unexpected success"; }
                catch (OrderException error) { return error.getCode(); }
            });
            try {
                assertTrue(started.await(5, TimeUnit.SECONDS));
                assertThrows(TimeoutException.class, () -> creator.get(200, TimeUnit.MILLISECONDS));
            } finally { release.countDown(); }
            assertTrue(writer.get(10, TimeUnit.SECONDS));
            assertEquals("ORDER_TEST_UNAVAILABLE", creator.get(10, TimeUnit.SECONDS));
        }
        assertEquals(0, count("test_orders"));
    }
}
