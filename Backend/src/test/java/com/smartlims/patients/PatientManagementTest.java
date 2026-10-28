package com.smartlims.patients;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.JwtKeyConfiguration;
import com.smartlims.patients.dto.CreatePatientRequest;
import com.smartlims.patients.entity.PatientGender;
import com.smartlims.patients.exception.PatientForbiddenException;
import com.smartlims.patients.repository.PatientRepository;
import com.smartlims.patients.service.PatientService;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
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
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class PatientManagementTest extends IsolatedPostgresTest {
    private static final String BODY = """
            {"fullName":" Example Patient ","dateOfBirth":"2000-01-01","gender":"UNKNOWN",
             "phoneNumber":" 000001 ","address":" Example Address "}
            """;
    @Autowired MockMvc mvc;
    @Autowired UserAccountRepository users;
    @MockitoSpyBean PatientRepository patients;
    @Autowired PatientService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtEncoder encoder;
    @Autowired JsonMapper json;
    @MockitoBean VerificationEmailSender email;
    private final Map<Role, UserAccount> actors = new EnumMap<>(Role.class);
    private final Map<Role, String> tokens = new EnumMap<>(Role.class);

    @BeforeEach
    void fixtures() {
        // IsolatedPostgresTest refuses any URL outside the dedicated regression database.
        jdbc.execute("TRUNCATE TABLE patient_link_tokens, patients, email_action_tokens, users");
        reset(patients);
        for (Role role : Role.values()) {
            UserAccount user = UserAccount.invite("Synthetic Test Account", role.name().toLowerCase(Locale.ROOT)
                    + "@example.invalid", null, "000001", role);
            user.acceptInvitation("test-only-unused-hash", Instant.now());
            user = users.saveAndFlush(user);
            actors.put(role, user);
            Instant now = Instant.now();
            JwtClaimsSet claims = JwtClaimsSet.builder().subject(user.getId().toString())
                    .issuer(JwtKeyConfiguration.ISSUER).audience(List.of(JwtKeyConfiguration.AUDIENCE))
                    .issuedAt(now).expiresAt(now.plusSeconds(600)).build();
            tokens.put(role, encoder.encode(JwtEncoderParameters.from(
                    JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue());
        }
    }

    private MockHttpServletRequestBuilder bearer(MockHttpServletRequestBuilder request, Role role) {
        return request.header("Authorization", "Bearer " + tokens.get(role));
    }

    private JsonNode create(Role role, String body) throws Exception {
        MvcResult result = mvc.perform(bearer(post("/api/patients"), role)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated())
                .andExpect(header().exists("Location")).andReturn();
        JsonNode patient = json.readTree(result.getResponse().getContentAsString());
        assertEquals("/api/patients/" + patient.get("id").asString(), result.getResponse().getHeader("Location"));
        return patient;
    }

    @Test
    void createAndReplacePersistOnlyPermittedFieldsWithoutAccountSynchronization() throws Exception {
        JsonNode first = create(Role.ADMIN, BODY);
        JsonNode duplicate = create(Role.RECEPTIONIST, BODY);
        String id = first.get("id").asString();
        assertNotEquals(first.get("patientNumber"), duplicate.get("patientNumber"));
        assertTrue(first.get("patientNumber").asString().matches("PAT-[0-9]{6,}"));
        assertEquals("Example Patient", first.get("fullName").asString());
        assertEquals("000001", first.get("phoneNumber").asString());
        assertEquals("Example Address", first.get("address").asString());
        assertTrue(first.get("createdAt").asString().endsWith("Z"));
        assertEquals(9, first.size());
        assertNull(first.get("userId"));
        assertNull(first.get("createdBy"));
        assertNull(patients.findById(UUID.fromString(id)).orElseThrow().getUser());
        assertEquals(actors.get(Role.ADMIN).getId(), jdbc.queryForObject(
                "SELECT created_by FROM patients WHERE id = ?", UUID.class, UUID.fromString(id)));
        // A controlled fixture represents an existing legitimate link for phase-1 regression coverage.
        jdbc.update("UPDATE patients SET user_id = ? WHERE id = ?", actors.get(Role.PATIENT).getId(), UUID.fromString(id));
        String replacement = BODY.replace("Example Patient", "Updated Patient").replace("000001", "000002")
                .replace("\"address\":\" Example Address \"", "\"address\":\" \"");
        var updated = mvc.perform(bearer(put("/api/patients/" + id), Role.RECEPTIONIST)
                .contentType(MediaType.APPLICATION_JSON).content(replacement)).andExpect(status().isOk())
                .andExpect(jsonPath("$.address").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.patientNumber").value(first.get("patientNumber").asString()))
                .andExpect(jsonPath("$.createdAt").value(first.get("createdAt").asString())).andReturn();
        JsonNode response = json.readTree(updated.getResponse().getContentAsString());
        assertTrue(Instant.parse(response.get("updatedAt").asString()).isAfter(Instant.parse(first.get("updatedAt").asString())));
        assertEquals("Synthetic Test Account", users.findById(actors.get(Role.PATIENT).getId()).orElseThrow().getFullName());
        assertEquals(actors.get(Role.PATIENT).getId(), jdbc.queryForObject(
                "SELECT user_id FROM patients WHERE id = ?", UUID.class, UUID.fromString(id)));
        mvc.perform(bearer(get("/api/patients/" + id), Role.LAB_TECHNICIAN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Updated Patient"));
        String omittedAddress = replacement.replace(",\"address\":\" \"", "");
        mvc.perform(bearer(put("/api/patients/" + id), Role.ADMIN).contentType(MediaType.APPLICATION_JSON)
                .content(omittedAddress)).andExpect(status().isOk()).andExpect(jsonPath("$.address").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void identicalPutStillPersistsUpdatedTimestampAndPreservesOtherFields() throws Exception {
        JsonNode original = create(Role.ADMIN, BODY);
        UUID id = UUID.fromString(original.get("id").asString());
        Instant previous = Instant.parse("2020-01-01T00:00:00Z");
        jdbc.update("UPDATE patients SET updated_at = ? WHERE id = ?", java.sql.Timestamp.from(previous), id);
        MvcResult result = mvc.perform(bearer(put("/api/patients/" + id), Role.RECEPTIONIST)
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isOk()).andReturn();
        JsonNode updated = json.readTree(result.getResponse().getContentAsString());
        for (String field : List.of("id", "patientNumber", "fullName", "dateOfBirth", "gender", "phoneNumber", "address", "createdAt")) {
            assertEquals(original.get(field), updated.get(field), field);
        }
        Instant persisted = patients.findById(id).orElseThrow().getUpdatedAt();
        assertTrue(persisted.isAfter(previous));
        assertEquals(persisted, Instant.parse(updated.get("updatedAt").asString()));
        assertNull(patients.findById(id).orElseThrow().getUser());
        assertEquals(actors.get(Role.ADMIN).getId(), jdbc.queryForObject(
                "SELECT created_by FROM patients WHERE id = ?", UUID.class, id));
    }

    @Test
    void roleMatrixOwnershipAndMissingProfilesAreEnforced() throws Exception {
        String own = create(Role.ADMIN, BODY).get("id").asString();
        String other = create(Role.RECEPTIONIST, BODY).get("id").asString();
        jdbc.update("UPDATE patients SET user_id = ? WHERE id = ?", actors.get(Role.PATIENT).getId(), UUID.fromString(own));
        for (Role role : List.of(Role.ADMIN, Role.RECEPTIONIST, Role.LAB_TECHNICIAN)) {
            mvc.perform(bearer(get("/api/patients"), role)).andExpect(status().isOk());
            mvc.perform(bearer(get("/api/patients/" + own), role)).andExpect(status().isOk());
            mvc.perform(bearer(get("/api/patients/" + UUID.randomUUID()), role)).andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("PATIENT_NOT_FOUND"));
        }
        for (Role role : List.of(Role.PATIENT, Role.LAB_TECHNICIAN)) {
            mvc.perform(bearer(post("/api/patients"), role).contentType(MediaType.APPLICATION_JSON).content(BODY))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN"));
            mvc.perform(bearer(put("/api/patients/" + own), role).contentType(MediaType.APPLICATION_JSON).content(BODY))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(bearer(get("/api/patients"), Role.PATIENT)).andExpect(status().isForbidden());
        mvc.perform(bearer(get("/api/patients/" + own), Role.PATIENT)).andExpect(status().isOk());
        for (String id : List.of(other, UUID.randomUUID().toString())) {
            mvc.perform(bearer(get("/api/patients/" + id), Role.PATIENT)).andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.message").value("Patient not found."));
        }
        mvc.perform(bearer(put("/api/patients/" + UUID.randomUUID()), Role.ADMIN)
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isNotFound());
        for (var request : List.of(get("/api/patients"), get("/api/patients/" + own))) {
            mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isUnauthorized());
        }
        Cookie csrf = mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertNotNull(csrf);
        for (var request : List.of(post("/api/patients"), put("/api/patients/" + own))) {
            mvc.perform(request.cookie(csrf).header("X-XSRF-TOKEN", csrf.getValue())
                    .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isUnauthorized());
        }
        mvc.perform(bearer(delete("/api/patients/" + own), Role.ADMIN)).andExpect(status().isForbidden());
        // Current database role and eligibility, rather than stale token claims, govern access.
        jdbc.update("UPDATE users SET role = 'PATIENT' WHERE id = ?", actors.get(Role.LAB_TECHNICIAN).getId());
        mvc.perform(bearer(get("/api/patients"), Role.LAB_TECHNICIAN)).andExpect(status().isForbidden());
        jdbc.update("UPDATE users SET enabled = false WHERE id = ?", actors.get(Role.ADMIN).getId());
        mvc.perform(bearer(get("/api/patients"), Role.ADMIN)).andExpect(status().isUnauthorized());
    }

    @Test
    void literalSearchPagingAndDeterministicSorting() throws Exception {
        JsonNode ordinary = create(Role.ADMIN, BODY);
        JsonNode special = create(Role.ADMIN, BODY.replace("Example Patient", "Percent% Under_score\\\\Slash"));
        create(Role.RECEPTIONIST, BODY.replace("Example Patient", "Other Patient"));
        for (String search : List.of("eXaMpLe", ordinary.get("patientNumber").asString().toLowerCase(Locale.ROOT))) {
            mvc.perform(bearer(get("/api/patients").param("search", search), Role.LAB_TECHNICIAN))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        }
        mvc.perform(bearer(get("/api/patients").param("search", "000001"), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(3));
        for (String search : List.of("%", "_", "\\")) {
            mvc.perform(bearer(get("/api/patients").param("search", search), Role.ADMIN)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.content[0].id").value(special.get("id").asString()));
        }
        mvc.perform(bearer(get("/api/patients").param("search", "not found"), Role.ADMIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty())
                .andExpect(jsonPath("$.totalPages").value(0)).andExpect(jsonPath("$.first").value(true))
                .andExpect(jsonPath("$.last").value(true));
        mvc.perform(bearer(get("/api/patients").param("page", "8").param("size", "2"), Role.ADMIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page").value(8))
                .andExpect(jsonPath("$.content").isEmpty()).andExpect(jsonPath("$.totalElements").value(3));
        mvc.perform(bearer(get("/api/patients").param("page", "2147483647"), Role.ADMIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty())
                .andExpect(jsonPath("$.totalElements").value(3));
        jdbc.update("UPDATE patients SET created_at = TIMESTAMPTZ '2020-01-01 00:00:00Z'");
        List<UUID> expected = jdbc.query("SELECT id FROM patients ORDER BY id ASC", (rs, row) -> rs.getObject(1, UUID.class));
        for (int page = 0; page < 3; page++) {
            mvc.perform(bearer(get("/api/patients").param("search", " ").param("page", String.valueOf(page))
                    .param("size", "1"), Role.ADMIN)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.content[0].id").value(expected.get(page).toString()))
                    .andExpect(jsonPath("$.totalPages").value(3));
        }
        for (String field : List.of("patientNumber", "fullName", "dateOfBirth", "createdAt", "updatedAt")) {
            for (String direction : List.of("asc", "desc")) {
                mvc.perform(bearer(get("/api/patients").param("sort", field + "," + direction), Role.ADMIN))
                        .andExpect(status().isOk());
            }
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"page=-1", "page=abc", "page=2147483648", "size=0", "size=101", "size=",
            "sort=id,asc", "sort=fullName", "sort=fullName,ASC", "sort=fullName,asc,desc", "sort=",
            "sort=createdAt,desc&sort=fullName,asc", "page=", "page=1.5", "size=1.5", "size=2147483648",
            "page=0&page=0", "size=20&size=20", "search=Example&search=Example"})
    void invalidQueriesReturnExistingErrorEnvelope(String query) throws Exception {
        MvcResult result = mvc.perform(bearer(get("/api/patients?" + query), Role.ADMIN))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").value("Please correct the request fields."))
                .andExpect(jsonPath("$.fieldErrors." + query.substring(0, query.indexOf('=')))
                        .value("Please correct the request fields."))
                .andExpect(header().string("Cache-Control", "no-store")).andReturn();
        assertEquals(json.readTree(result.getResponse().getContentAsString()).get("requestId").asString(),
                result.getResponse().getHeader("X-Request-Id"));
    }

    @Test
    void invalidBodiesIdsAndJerusalemBirthDatesAreRejected() throws Exception {
        for (String body : List.of("{}", BODY.replace(" Example Patient ", " "),
                BODY.replace(" Example Patient ", "x".repeat(121)), BODY.replace(" 000001 ", "x".repeat(21)),
                BODY.replace(" Example Address ", "x".repeat(501)), BODY.replace("2000-01-01", "2100-01-01"))) {
            for (var request : List.of(post("/api/patients"), put("/api/patients/" + UUID.randomUUID()))) {
                mvc.perform(bearer(request, Role.ADMIN).contentType(MediaType.APPLICATION_JSON).content(body))
                        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
            }
        }
        for (String field : List.of("id", "patientNumber", "userId", "createdBy", "createdAt", "updatedAt", "unexpected")) {
            mvc.perform(bearer(post("/api/patients"), Role.ADMIN).contentType(MediaType.APPLICATION_JSON)
                    .content(BODY.replace("}", ",\"" + field + "\":\"forbidden\"}")))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_JSON"));
        }
        for (String body : List.of("{", BODY.replace("UNKNOWN", "unknown"), BODY.replace("UNKNOWN", "OTHER"),
                BODY.replace("\"UNKNOWN\"", "0"), BODY.replace("\"UNKNOWN\"", "false"),
                BODY.replace("2000-01-01", "2000-02-30"),
                BODY.replace("\" Example Patient \"", "123"), BODY.replace("\" 000001 \"", "123"),
                BODY.replace("\" Example Address \"", "true"), BODY.replace("\"2000-01-01\"", "[2000,1,1]"))) {
            mvc.perform(bearer(post("/api/patients"), Role.ADMIN).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_JSON"));
        }
        for (String id : List.of("not-a-uuid", "1-1-1-1-1")) {
            mvc.perform(bearer(get("/api/patients/" + id), Role.ADMIN)).andExpect(status().isBadRequest());
        }
        mvc.perform(bearer(get("/api/patients").param("search", "x".repeat(121)), Role.ADMIN)).andExpect(status().isBadRequest());
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Jerusalem"));
        create(Role.ADMIN, BODY.replace("2000-01-01", today.toString()));
        mvc.perform(bearer(post("/api/patients"), Role.ADMIN).contentType(MediaType.APPLICATION_JSON)
                .content(BODY.replace("2000-01-01", today.plusDays(1).toString()))).andExpect(status().isBadRequest());
    }

    @Test
    void cookiesStillRequireCsrfAndPersistenceFailuresAreSanitized() throws Exception {
        mvc.perform(post("/api/patients").cookie(new Cookie("access_token", tokens.get(Role.ADMIN)))
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andExpect(status().isForbidden());
        Cookie csrf = mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertNotNull(csrf);
        mvc.perform(post("/api/patients").cookie(new Cookie("access_token", tokens.get(Role.ADMIN)), csrf)
                .header("X-XSRF-TOKEN", csrf.getValue()).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isCreated());
        doThrow(new org.springframework.dao.DataIntegrityViolationException("sensitive SQL constraint"))
                .when(patients).saveAndFlush(any());
        mvc.perform(bearer(post("/api/patients"), Role.ADMIN).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.code").value("INTERNAL_SERVER_ERROR"))
                .andExpect(jsonPath("$.message").value("An unexpected error occurred."));
    }

    @Test
    void databaseEnforcesUniqueNumbersLinksGenderAndRetainedUserReferences() throws Exception {
        UUID first = UUID.fromString(create(Role.ADMIN, BODY).get("id").asString());
        UUID second = UUID.fromString(create(Role.ADMIN, BODY).get("id").asString());
        UUID patientUser = actors.get(Role.PATIENT).getId();
        jdbc.update("UPDATE patients SET user_id = ? WHERE id = ?", patientUser, first);
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("UPDATE patients SET user_id = ? WHERE id = ?", patientUser, second));
        String number = jdbc.queryForObject("SELECT patient_number FROM patients WHERE id = ?", String.class, first);
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("UPDATE patients SET patient_number = ? WHERE id = ?", number, second));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("UPDATE patients SET gender = 'OTHER' WHERE id = ?", second));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("DELETE FROM users WHERE id = ?", patientUser));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("DELETE FROM users WHERE id = ?", actors.get(Role.ADMIN).getId()));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("UPDATE patients SET created_by = ? WHERE id = ?", UUID.randomUUID(), second));
        assertEquals(List.of("1", "2", "3", "4", "5", "6"), jdbc.queryForList(
                "SELECT version FROM flyway_schema_history WHERE success = true ORDER BY installed_rank", String.class));
        assertEquals("V4__lab_tests.sql", jdbc.queryForObject(
                "SELECT script FROM flyway_schema_history WHERE version = '4'", String.class));
        assertEquals("V5__patient_link_tokens.sql", jdbc.queryForObject(
                "SELECT script FROM flyway_schema_history WHERE version = '5'", String.class));
        assertEquals("V6__lab_test_categories.sql", jdbc.queryForObject(
                "SELECT script FROM flyway_schema_history WHERE version = '6'", String.class));
    }

    @Test
    void concurrentCreatesUseUniqueSequenceNumbersAndServiceEnforcesRoles() throws Exception {
        var admin = authentication(Role.ADMIN);
        var request = new CreatePatientRequest("Concurrent Example", LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000001", null);
        PatientForbiddenException denied = assertThrows(PatientForbiddenException.class,
                () -> service.create(authentication(Role.PATIENT), request));
        assertEquals("Access is denied.", denied.getMessage());
        mvc.perform(bearer(post("/api/patients"), Role.PATIENT).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN"));
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(4)) {
            List<Future<String>> results = new ArrayList<>();
            for (int i = 0; i < 12; i++) results.add(executor.submit(() -> {
                assertTrue(start.await(10, TimeUnit.SECONDS));
                return service.create(admin, request).patientNumber();
            }));
            start.countDown();
            Set<String> numbers = new HashSet<>();
            for (var result : results) assertTrue(numbers.add(result.get(30, TimeUnit.SECONDS)));
            assertEquals(12, patients.count());
        }
        // Verify minimum-width padding also works after six digits, without resetting the sequence.
        jdbc.queryForObject("SELECT setval('patient_number_seq', 1000000)", Long.class);
        assertEquals("PAT-1000001", service.create(admin, request).patientNumber());
    }

    private JwtAuthenticationToken authentication(Role role) {
        Jwt jwt = Jwt.withTokenValue("test-only").header("alg", "HS256")
                .subject(actors.get(role).getId().toString()).build();
        return new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_" + role.name())), jwt.getSubject());
    }
}
