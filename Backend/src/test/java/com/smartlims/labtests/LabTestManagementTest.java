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
                .andExpect(jsonPath("$.categories").isArray()).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asString();
    }

    private String withCategories(String body, String categories) {
        return body.stripTrailing().replaceFirst("}$", ",\"categories\":" + categories + "}");
    }

    private List<String> persistedCategories(String id) {
        return jdbc.queryForList("SELECT category FROM lab_test_categories WHERE lab_test_id = ? ORDER BY category",
                String.class, UUID.fromString(id));
    }

    @Test
    void createsOptionalSingleMultipleAndAllCategoriesAndSerializesEveryResponse() throws Exception {
        List<String> all = List.of("BLOOD_TESTS", "VITAMINS_MINERALS", "THYROID", "LIVER", "KIDNEY", "LIPIDS", "DIABETES");
        List<String> reversed = new ArrayList<>(all);
        Collections.reverse(reversed);
        var inputs = Arrays.asList(null, "null", "[]", "[\"THYROID\"]", "[\"THYROID\",\"BLOOD_TESTS\"]",
                json.writeValueAsString(reversed));
        var expected = List.of(List.<String>of(), List.<String>of(), List.<String>of(), List.of("THYROID"),
                List.of("BLOOD_TESTS", "THYROID"), all);
        for (int i = 0; i < inputs.size(); i++) {
            String body = BODY.replace(" cbc ", "CREATE_" + i);
            if (inputs.get(i) != null) body = withCategories(body, inputs.get(i));
            var response = mvc.perform(bearer(post("/api/lab-tests"), Role.ADMIN)
                    .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isCreated()).andExpect(header().exists("Location"))
                    .andExpect(jsonPath("$.categories").value(org.hamcrest.Matchers.is(expected.get(i))))
                    .andExpect(jsonPath("$.category").doesNotExist()).andReturn().getResponse();
            String id = json.readTree(response.getContentAsString()).get("id").asString();
            assertEquals(new TreeSet<>(expected.get(i)), new TreeSet<>(persistedCategories(id)));
            mvc.perform(bearer(get("/api/lab-tests/" + id), Role.PATIENT))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.categories").value(org.hamcrest.Matchers.is(expected.get(i))));
            mvc.perform(bearer(get("/api/lab-tests").param("search", "CREATE_" + i), Role.RECEPTIONIST))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.content[0].categories").value(org.hamcrest.Matchers.is(expected.get(i))));
            mvc.perform(bearer(patch("/api/lab-tests/" + id + "/status"), Role.ADMIN)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.categories").value(org.hamcrest.Matchers.is(expected.get(i))));
            assertEquals(new TreeSet<>(expected.get(i)), new TreeSet<>(persistedCategories(id)));
        }
    }

    @Test
    void replacesWholeSetRemovesMembershipsAndClearsForOmittedNullAndEmptyArrays() throws Exception {
        String id = create(withCategories(BODY, "[\"BLOOD_TESTS\",\"THYROID\"]"));
        mvc.perform(bearer(patch("/api/lab-tests/" + id + "/status"), Role.ADMIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
                .andExpect(status().isOk());
        for (String assignments : List.of("[\"KIDNEY\",\"LIVER\"]", "[\"KIDNEY\",\"LIVER\"]", "[\"KIDNEY\"]")) {
            List<String> expected = assignments.contains("LIVER") ? List.of("LIVER", "KIDNEY") : List.of("KIDNEY");
            mvc.perform(bearer(put("/api/lab-tests/" + id), Role.ADMIN).contentType(MediaType.APPLICATION_JSON)
                    .content(withCategories(BODY.replace("25.50", "30.00"), assignments)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.categories").value(org.hamcrest.Matchers.is(expected)))
                    .andExpect(jsonPath("$.active").value(false)).andExpect(jsonPath("$.price").value(30));
            assertEquals(new TreeSet<>(expected), new TreeSet<>(persistedCategories(id)));
        }
        for (String empty : Arrays.asList(null, "null", "[]")) {
            mvc.perform(bearer(put("/api/lab-tests/" + id), Role.ADMIN).contentType(MediaType.APPLICATION_JSON)
                    .content(withCategories(BODY, "[\"THYROID\"]"))).andExpect(status().isOk());
            mvc.perform(bearer(put("/api/lab-tests/" + id), Role.ADMIN).contentType(MediaType.APPLICATION_JSON)
                    .content(empty == null ? BODY : withCategories(BODY, empty)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.categories").isEmpty())
                    .andExpect(jsonPath("$.active").value(false));
            assertTrue(persistedCategories(id).isEmpty());
            mvc.perform(bearer(get("/api/lab-tests/" + id), Role.ADMIN))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.categories").isEmpty());
        }
    }

    @Test
    void rejectsInvalidCategoryValuesAndJsonTypesWithoutChangingFieldsOrAssignments() throws Exception {
        String id = create(withCategories(BODY, "[\"BLOOD_TESTS\",\"THYROID\"]"));
        var original = jdbc.queryForMap("SELECT * FROM lab_tests WHERE id = ?", UUID.fromString(id));
        Map<String, List<String>> invalid = new LinkedHashMap<>();
        invalid.put("VALIDATION_ERROR", List.of("[\"THYROID\",\"THYROID\"]", "[null]", "[\"\"]", "[\" \"]",
                "[\"UNKNOWN\"]", "[\"thyroid\"]", "[\" THYROID\"]", "[\"THYROID \"]", "[\"Blood tests\"]", "[\"All\"]",
                "[\"BLOOD_TESTS\",\"VITAMINS_MINERALS\",\"THYROID\",\"LIVER\",\"KIDNEY\",\"LIPIDS\",\"DIABETES\",\"THYROID\"]"));
        invalid.put("INVALID_JSON", List.of("\"THYROID\"", "{}", "1", "true", "[1]", "[true]", "[{}]", "[[]]"));
        for (var group : invalid.entrySet()) {
            for (String value : group.getValue()) {
                String body = withCategories(BODY.replace("25.50", "99.00"), value);
                for (var request : List.of(post("/api/lab-tests").content(body.replace(" cbc ", "INVALID")),
                        put("/api/lab-tests/" + id).content(body))) {
                    var result = mvc.perform(bearer(request, Role.ADMIN).contentType(MediaType.APPLICATION_JSON))
                            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value(group.getKey()))
                            .andExpect(header().exists("X-Request-Id")).andExpect(header().string("Cache-Control", "no-store"));
                    if (group.getKey().equals("VALIDATION_ERROR"))
                        result.andExpect(jsonPath("$.fieldErrors.categories").value("Invalid value."));
                    else result.andExpect(jsonPath("$.fieldErrors").isEmpty());
                }
                assertEquals(original, jdbc.queryForMap("SELECT * FROM lab_tests WHERE id = ?", UUID.fromString(id)));
                assertEquals(List.of("BLOOD_TESTS", "THYROID"), persistedCategories(id));
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM lab_tests", Integer.class));
            }
        }
        String other = create(withCategories(BODY.replace(" cbc ", "OTHER"), "[\"LIVER\"]"));
        mvc.perform(bearer(put("/api/lab-tests/" + id), Role.ADMIN).contentType(MediaType.APPLICATION_JSON)
                .content(withCategories(BODY.replace(" cbc ", "OTHER"), "[\"KIDNEY\"]")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LAB_TEST_CODE_IN_USE"));
        assertEquals(original, jdbc.queryForMap("SELECT * FROM lab_tests WHERE id = ?", UUID.fromString(id)));
        assertEquals(List.of("BLOOD_TESTS", "THYROID"), persistedCategories(id));
        assertEquals(List.of("LIVER"), persistedCategories(other));
    }

    @Test
    void createsReplacesAndChangesAvailabilityWithoutDeleting() throws Exception {
        String id = create(BODY);
        mvc.perform(bearer(get("/api/lab-tests/" + id), Role.PATIENT)).andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("CBC")).andExpect(jsonPath("$.currency").value("ILS"))
                .andExpect(jsonPath("$.price").value(25.5)).andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.description").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.categories").isEmpty());
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
        String categoryBody = withCategories(BODY, "[\"THYROID\",\"BLOOD_TESTS\"]");
        mvc.perform(get("/api/lab-tests")).andExpect(status().isUnauthorized());
        String id = create(categoryBody);
        Cookie csrf = mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertNotNull(csrf);
        for (var request : List.of(post("/api/lab-tests").content(categoryBody),
                put("/api/lab-tests/" + id).content(categoryBody),
                patch("/api/lab-tests/" + id + "/status").content("{\"active\":false}"))) {
            // Satisfy CSRF so the anonymous request reaches the existing authentication check.
            mvc.perform(request.cookie(csrf).header("X-XSRF-TOKEN", csrf.getValue())
                    .contentType(MediaType.APPLICATION_JSON)).andExpect(status().isUnauthorized());
        }
        for (Role role : Role.values()) {
            mvc.perform(bearer(get("/api/lab-tests"), role)).andExpect(status().isOk());
            mvc.perform(bearer(get("/api/lab-tests/" + id), role)).andExpect(status().isOk());
            if (role == Role.ADMIN) continue;
            mvc.perform(bearer(post("/api/lab-tests"), role).contentType(MediaType.APPLICATION_JSON).content(categoryBody))
                    .andExpect(status().isForbidden());
            mvc.perform(bearer(put("/api/lab-tests/" + id), role).contentType(MediaType.APPLICATION_JSON).content(categoryBody))
                    .andExpect(status().isForbidden());
            mvc.perform(bearer(patch("/api/lab-tests/" + id + "/status"), role)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(bearer(get("/api/lab-tests/invalid"), Role.ADMIN)).andExpect(status().isBadRequest());
        mvc.perform(bearer(get("/api/lab-tests/" + UUID.randomUUID()), Role.ADMIN)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("LAB_TEST_NOT_FOUND")).andExpect(header().exists("X-Request-Id"));
        mvc.perform(bearer(post("/api/lab-tests"), Role.ADMIN).contentType(MediaType.APPLICATION_JSON)
                .content(categoryBody.replace("25.50", "1.001"))).andExpect(status().isBadRequest())
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
        String categoryBody = withCategories(BODY, "[\"THYROID\",\"BLOOD_TESTS\"]");
        String id = create(categoryBody);
        Cookie csrf = mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertNotNull(csrf);
        for (Role role : Role.values()) {
            Cookie access = new Cookie("access_token", tokens.get(role));
            mvc.perform(get("/api/lab-tests").cookie(access)).andExpect(status().isOk());
            mvc.perform(get("/api/lab-tests/" + id).cookie(access)).andExpect(status().isOk());
            for (int operation = 0; operation < 3; operation++) {
                for (String protection : List.of("missing", "mismatched", "valid")) {
                    var request = switch (operation) {
                        case 0 -> post("/api/lab-tests").content(categoryBody.replace(" cbc ", "COOKIE"));
                        case 1 -> put("/api/lab-tests/" + id).content(categoryBody);
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
        var request = new LabTestRequest("CBC", "CBC", null, BigDecimal.TEN, null, "Blood", null, List.of());
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
