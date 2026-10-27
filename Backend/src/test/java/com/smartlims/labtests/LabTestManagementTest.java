package com.smartlims.labtests;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.JwtKeyConfiguration;
import com.smartlims.labtests.dto.LabTestRequest;
import com.smartlims.labtests.exception.LabTestException;
import com.smartlims.labtests.service.LabTestService;
import java.math.BigDecimal;
import java.time.Instant;
import jakarta.servlet.http.Cookie;
import org.springframework.dao.DataIntegrityViolationException;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class LabTestManagementTest extends IsolatedPostgresTest {
    private static final String BODY = """
            {"code":" cbc ","name":" Complete Blood Count ","price":25.50,
             "sampleType":" Blood ","description":" ","preparationInstructions":" None "}
            """;
    @Autowired MockMvc mvc;
    @Autowired UserAccountRepository users;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtEncoder encoder;
    @Autowired JsonMapper json;
    @Autowired LabTestService service;
    @MockitoBean VerificationEmailSender email;
    private final Map<Role, String> tokens = new EnumMap<>(Role.class);
    private UUID adminId;

    @BeforeEach
    void fixtures() {
        jdbc.execute("TRUNCATE TABLE lab_test_categories, lab_tests, patient_link_tokens, patients, email_action_tokens, users");
        for (Role role : Role.values()) {
            UserAccount user = UserAccount.invite("Catalog Test Account", role.name().toLowerCase(Locale.ROOT)
                    + "@example.invalid", null, "000001", role);
            user.acceptInvitation("test-only-unused-hash", Instant.now());
            user = users.saveAndFlush(user);
            if (role == Role.ADMIN) adminId = user.getId();
            Instant now = Instant.now();
            var claims = JwtClaimsSet.builder().subject(user.getId().toString()).issuer(JwtKeyConfiguration.ISSUER)
                    .audience(List.of(JwtKeyConfiguration.AUDIENCE)).issuedAt(now).expiresAt(now.plusSeconds(600)).build();
            tokens.put(role, encoder.encode(JwtEncoderParameters.from(
                    JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue());
        }
    }

    private MockHttpServletRequestBuilder bearer(MockHttpServletRequestBuilder request, Role role) {
        return request.header("Authorization", "Bearer " + tokens.get(role));
    }

    private String create(String body) throws Exception {
        var result = mvc.perform(bearer(post("/api/lab-tests"), Role.ADMIN)
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.categories").doesNotExist()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asString();
    }

    @Test
    void createsReplacesAndChangesAvailabilityWithoutDeleting() throws Exception {
        String id = create(BODY);
        mvc.perform(bearer(get("/api/lab-tests/" + id), Role.PATIENT)).andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("CBC")).andExpect(jsonPath("$.currency").value("ILS"))
                .andExpect(jsonPath("$.price").value(25.5)).andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.description").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.categories").doesNotExist());
        mvc.perform(bearer(post("/api/lab-tests"), Role.ADMIN).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LAB_TEST_CODE_IN_USE"))
                .andExpect(jsonPath("$.fieldErrors.code").exists())
                .andExpect(jsonPath("$.fields").doesNotExist());
        mvc.perform(bearer(patch("/api/lab-tests/" + id + "/status"), Role.ADMIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));
        mvc.perform(bearer(put("/api/lab-tests/" + id), Role.ADMIN).contentType(MediaType.APPLICATION_JSON)
                .content(BODY.replace("25.50", "30.00"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false)).andExpect(jsonPath("$.price").value(30));
        mvc.perform(bearer(get("/api/lab-tests").param("active", "true"), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(bearer(get("/api/lab-tests").param("active", "false").param("search", "CbC"), Role.PATIENT))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(bearer(get("/api/lab-tests").param("search", "%"), Role.ADMIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(bearer(get("/api/lab-tests").param("page", "2147483647"), Role.ADMIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM lab_tests", Integer.class));
    }

    @Test
    void enforcesAuthenticationRolesAndSanitizedErrors() throws Exception {
        mvc.perform(get("/api/lab-tests")).andExpect(status().isUnauthorized());
        String id = create(BODY);
        for (Role role : Role.values()) {
            mvc.perform(bearer(get("/api/lab-tests"), role)).andExpect(status().isOk());
            mvc.perform(bearer(get("/api/lab-tests/" + id), role)).andExpect(status().isOk());
            if (role == Role.ADMIN) continue;
            mvc.perform(bearer(post("/api/lab-tests"), role).contentType(MediaType.APPLICATION_JSON).content(BODY))
                    .andExpect(status().isForbidden());
            mvc.perform(bearer(put("/api/lab-tests/" + id), role).contentType(MediaType.APPLICATION_JSON).content(BODY))
                    .andExpect(status().isForbidden());
            mvc.perform(bearer(patch("/api/lab-tests/" + id + "/status"), role)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(bearer(get("/api/lab-tests/invalid"), Role.ADMIN)).andExpect(status().isBadRequest());
        mvc.perform(bearer(get("/api/lab-tests/" + UUID.randomUUID()), Role.ADMIN)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("LAB_TEST_NOT_FOUND")).andExpect(header().exists("X-Request-Id"));
        mvc.perform(bearer(post("/api/lab-tests"), Role.ADMIN).contentType(MediaType.APPLICATION_JSON)
                .content(BODY.replace("25.50", "1.001"))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.price").value("Invalid value."))
                .andExpect(jsonPath("$.fields").doesNotExist());
        mvc.perform(bearer(patch("/api/lab-tests/" + id + "/status"), Role.ADMIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"active\":\"false\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_JSON"));
    }

    @Test
    void databaseDefaultsAndConstraintsAreEnforced() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO lab_tests (id, code, name, price, sample_type) VALUES (?, 'DIRECT', 'Direct', 0, 'Blood')", id);
        var row = jdbc.queryForMap("SELECT * FROM lab_tests WHERE id = ?", id);
        assertEquals("ILS", row.get("currency").toString().strip());
        assertEquals(true, row.get("active"));
        assertNotNull(row.get("created_at"));
        assertEquals(row.get("created_at"), row.get("updated_at"));
        assertNull(row.get("description"));
        assertNull(row.get("preparation_instructions"));
        for (String assignment : List.of("code = NULL", "name = NULL", "price = NULL", "currency = NULL",
                "sample_type = NULL", "active = NULL", "created_at = NULL", "updated_at = NULL",
                "code = 'lowercase'", "code = 'BAD CODE'", "code = ''", "code = repeat('X', 31)",
                "name = ' '", "name = repeat('X', 151)", "sample_type = ' '",
                "sample_type = repeat('X', 41)", "price = -0.01", "price = 'NaN'::numeric",
                "price = 10000000000", "currency = 'USD'")) {
            assertThrows(DataIntegrityViolationException.class,
                    () -> jdbc.update("UPDATE lab_tests SET " + assignment + " WHERE id = ?", id), assignment);
        }
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
                "INSERT INTO lab_tests (id, code, name, price, sample_type) VALUES (?, 'DIRECT', 'Duplicate', 1, 'Blood')",
                UUID.randomUUID()));
    }

    @Test
    void duplicateUpdateIsAtomicAndOwnCodeRemainsUsable() throws Exception {
        String first = create(BODY);
        String second = create(BODY.replace(" cbc ", "OTHER"));
        mvc.perform(bearer(put("/api/lab-tests/" + second), Role.ADMIN)
                .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LAB_TEST_CODE_IN_USE"))
                .andExpect(jsonPath("$.fieldErrors.code").exists());
        assertEquals("OTHER", jdbc.queryForObject("SELECT code FROM lab_tests WHERE id = ?", String.class, UUID.fromString(second)));
        mvc.perform(bearer(put("/api/lab-tests/" + first), Role.ADMIN)
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isOk());
    }

    @Test
    void identicalWritesPersistTimestampsAndPreserveCreationTime() throws Exception {
        UUID id = UUID.fromString(create(BODY));
        Instant created = jdbc.queryForObject("SELECT created_at FROM lab_tests WHERE id = ?",
                (rs, n) -> rs.getTimestamp(1).toInstant(), id);
        Instant old = Instant.parse("2020-01-01T00:00:00Z");
        for (var request : List.of(put("/api/lab-tests/" + id).content(BODY),
                patch("/api/lab-tests/" + id + "/status").content("{\"active\":true}"))) {
            jdbc.update("UPDATE lab_tests SET updated_at = ? WHERE id = ?", java.sql.Timestamp.from(old), id);
            var response = mvc.perform(bearer(request, Role.ADMIN).contentType(MediaType.APPLICATION_JSON))
                    .andExpect(status().isOk()).andReturn().getResponse();
            var body = json.readTree(response.getContentAsString());
            Instant persisted = jdbc.queryForObject("SELECT updated_at FROM lab_tests WHERE id = ?",
                    (rs, n) -> rs.getTimestamp(1).toInstant(), id);
            assertTrue(persisted.isAfter(old));
            assertEquals(persisted, Instant.parse(body.get("updatedAt").asString()));
            assertEquals(created, Instant.parse(body.get("createdAt").asString()));
        }
    }

    @Test
    void cookieAuthenticationAndCsrfApplyToEveryWrite() throws Exception {
        String id = create(BODY);
        Cookie csrf = mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertNotNull(csrf);
        for (Role role : Role.values()) {
            Cookie access = new Cookie("access_token", tokens.get(role));
            mvc.perform(get("/api/lab-tests").cookie(access)).andExpect(status().isOk());
            mvc.perform(get("/api/lab-tests/" + id).cookie(access)).andExpect(status().isOk());
            for (int operation = 0; operation < 3; operation++) {
                for (String protection : List.of("missing", "mismatched", "valid")) {
                    var request = switch (operation) {
                        case 0 -> post("/api/lab-tests").content(BODY.replace(" cbc ", "COOKIE"));
                        case 1 -> put("/api/lab-tests/" + id).content(BODY);
                        default -> patch("/api/lab-tests/" + id + "/status").content("{\"active\":false}");
                    };
                    request.cookie(access).contentType(MediaType.APPLICATION_JSON);
                    if (!protection.equals("missing")) request.cookie(csrf).header("X-XSRF-TOKEN",
                            protection.equals("valid") ? csrf.getValue() : "wrong-token");
                    int expected = role == Role.ADMIN && protection.equals("valid")
                            ? (operation == 0 ? 201 : 200) : 403;
                    mvc.perform(request).andExpect(status().is(expected));
                }
            }
        }
        mvc.perform(get("/api/lab-tests").cookie(new Cookie("access_token", "invalid")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void concurrentCreatesProduceOneTestAndOneConflict() throws Exception {
        var claims = JwtClaimsSet.builder().subject(adminId.toString()).build();
        var actor = new JwtAuthenticationToken(Jwt.withTokenValue("test").header("alg", "HS256")
                .claims(c -> c.putAll(claims.getClaims())).build(), List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        var request = new LabTestRequest("CBC", "CBC", null, BigDecimal.TEN, null, "Blood", null);
        var gate = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<String> create = () -> {
                gate.await();
                try { service.create(actor, request); return "CREATED"; }
                catch (LabTestException error) { return error.getCode(); }
            };
            var first = pool.submit(create);
            var second = pool.submit(create);
            gate.countDown();
            assertEquals(Set.of("CREATED", "LAB_TEST_CODE_IN_USE"),
                    new HashSet<>(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS))));
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM lab_tests WHERE code = 'CBC'", Integer.class));
    }
}
