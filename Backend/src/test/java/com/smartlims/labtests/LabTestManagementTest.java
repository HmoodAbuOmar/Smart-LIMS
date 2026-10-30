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
        jdbc.execute("TRUNCATE TABLE laboratory_events,result_specimens,result_values,test_results,specimen_attestations,samples,visit_items,visits,test_parameters,appointment_reschedules,appointments,appointment_slots,appointment_types,order_items, test_orders, lab_test_categories, lab_tests, patient_link_tokens, patients, email_action_tokens, users");
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

    private String catalogTest(String code, String name, boolean active, String... categories) throws Exception {
        String id = create(json.writeValueAsString(Map.of("code", code, "name", name, "price", BigDecimal.TEN,
                "sampleType", "SYNTHETIC", "categories", Arrays.asList(categories))));
        if (!active) mvc.perform(bearer(patch("/api/lab-tests/" + id + "/status"), Role.ADMIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
                .andExpect(status().isOk());
        return id;
    }

    @Test
    void detailReturnsOnlyDocumentedFieldsAndCompleteOptionalCategorySetsForEveryRole() throws Exception {
        List<List<String>> categories = List.of(List.of(), List.of("BLOOD_TESTS"), List.of("THYROID", "BLOOD_TESTS"));
        for (int i = 0; i < categories.size(); i++) {
            Map<String, Object> body = new HashMap<>(Map.of("code", "DETAIL_" + i, "name", "Synthetic detail " + i,
                    "price", new BigDecimal("12.34"), "currency", "ILS", "sampleType", "SYNTHETIC",
                    "categories", categories.get(i)));
            if (i > 0) {
                body.put("description", i == 1 ? null : "Synthetic description");
                body.put("preparationInstructions", i == 1 ? null : "Synthetic preparation");
            }
            String id = create(json.writeValueAsString(body));
            var row = jdbc.queryForMap("SELECT * FROM lab_tests WHERE id = ?", UUID.fromString(id));
            List<String> expectedCategories = i == 2 ? List.of("BLOOD_TESTS", "THYROID") : categories.get(i);
            for (Role role : Role.values()) {
                for (boolean cookie : List.of(false, true)) {
                    var request = get("/api/lab-tests/" + id);
                    if (cookie) request.cookie(new Cookie("access_token", tokens.get(role)));
                    else bearer(request, role);
                    var response = mvc.perform(request).andExpect(status().isOk())
                            .andExpect(jsonPath("$.id").value(id)).andExpect(jsonPath("$.code").value("DETAIL_" + i))
                            .andExpect(jsonPath("$.name").value("Synthetic detail " + i))
                            .andExpect(jsonPath("$.price").value(12.34)).andExpect(jsonPath("$.currency").value("ILS"))
                            .andExpect(jsonPath("$.sampleType").value("SYNTHETIC")).andExpect(jsonPath("$.active").value(true))
                            .andExpect(jsonPath("$.categories").value(org.hamcrest.Matchers.is(expectedCategories)))
                            .andExpect(jsonPath("$.description").value(org.hamcrest.Matchers.is(body.get("description"))))
                            .andExpect(jsonPath("$.preparationInstructions").value(org.hamcrest.Matchers.is(body.get("preparationInstructions"))))
                            .andReturn().getResponse();
                    Map<?, ?> fields = json.readValue(response.getContentAsString(), Map.class);
                    assertEquals(Set.of("id", "code", "name", "description", "price", "currency", "sampleType",
                            "preparationInstructions", "active", "createdAt", "updatedAt", "categories"), fields.keySet());
                    assertEquals(((java.sql.Timestamp) row.get("created_at")).toInstant(), Instant.parse((String) fields.get("createdAt")));
                    assertEquals(((java.sql.Timestamp) row.get("updated_at")).toInstant(), Instant.parse((String) fields.get("updatedAt")));
                }
            }
        }
    }

    @Test
    void inactiveDetailsAreIndistinguishableFromMissingForPatientsAndVisibleToStaff() throws Exception {
        for (boolean categorized : List.of(false, true)) {
            String id = catalogTest(categorized ? "HIDDEN_CAT" : "HIDDEN_EMPTY", "Synthetic hidden details", false,
                    categorized ? new String[]{"THYROID", "BLOOD_TESTS"} : new String[]{});
            Map<?, ?> firstError = null;
            for (Role role : Role.values()) {
                for (boolean cookie : List.of(false, true)) {
                    var request = get("/api/lab-tests/" + id).param("active", "true").param("role", "ADMIN");
                    if (cookie) request.cookie(new Cookie("access_token", tokens.get(role)));
                    else bearer(request, role);
                    if (role == Role.PATIENT) {
                        for (String requestedId : List.of(id, UUID.randomUUID().toString())) {
                            var hiddenRequest = get("/api/lab-tests/" + requestedId).param("active", "true").param("role", "ADMIN");
                            if (cookie) hiddenRequest.cookie(new Cookie("access_token", tokens.get(role)));
                            else bearer(hiddenRequest, role);
                            var response = mvc.perform(hiddenRequest).andExpect(status().isNotFound())
                                    .andExpect(jsonPath("$.code").value("LAB_TEST_NOT_FOUND"))
                                    .andExpect(jsonPath("$.message").value("Laboratory test not found."))
                                    .andExpect(jsonPath("$.fieldErrors").isEmpty())
                                    .andExpect(header().string("Cache-Control", "no-store"))
                                    .andExpect(header().exists("X-Request-Id")).andReturn().getResponse();
                            Map<?, ?> error = json.readValue(response.getContentAsString(), Map.class);
                            assertEquals(Set.of("code", "message", "fieldErrors", "requestId"), error.keySet());
                            assertEquals(response.getHeader("X-Request-Id"), error.remove("requestId"));
                            if (firstError == null) firstError = error;
                            else assertEquals(firstError, error);
                        }
                    } else {
                        mvc.perform(request).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id))
                                .andExpect(jsonPath("$.active").value(false))
                                .andExpect(jsonPath("$.categories").value(org.hamcrest.Matchers.is(
                                        categorized ? List.of("BLOOD_TESTS", "THYROID") : List.of())));
                    }
                }
            }
            mvc.perform(bearer(patch("/api/lab-tests/" + id + "/status"), Role.ADMIN)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"active\":true}"))
                    .andExpect(status().isOk());
            mvc.perform(bearer(get("/api/lab-tests/" + id), Role.PATIENT))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(true));
        }
    }

    @Test
    void detailIdentifierErrorsAndAuthenticationKeepExistingEnvelopesAndStatuses() throws Exception {
        String id = catalogTest("DETAIL_AUTH", "Synthetic authentication test", true);
        String missing = UUID.randomUUID().toString();
        for (Role role : Role.values()) {
            for (String invalid : List.of("invalid", "1-1-1-1-1", "00000000-0000-0000-0000-00000000000G")) {
                mvc.perform(bearer(get("/api/lab-tests/" + invalid), role)).andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                        .andExpect(jsonPath("$.fieldErrors.id").value("Invalid value."));
            }
            mvc.perform(bearer(get("/api/lab-tests/" + missing), role)).andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("LAB_TEST_NOT_FOUND"))
                    .andExpect(jsonPath("$.fieldErrors").isEmpty());
            mvc.perform(bearer(get("/api/lab-tests/" + id.toUpperCase(Locale.ROOT)), role))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id));
        }
        for (String requestedId : List.of(id, missing, "invalid")) {
            mvc.perform(get("/api/lab-tests/" + requestedId)).andExpect(status().isUnauthorized());
            mvc.perform(get("/api/lab-tests/" + requestedId).header("Authorization", "Bearer invalid"))
                    .andExpect(status().isUnauthorized());
            mvc.perform(get("/api/lab-tests/" + requestedId).cookie(new Cookie("access_token", "invalid")))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Test
    void categoryMembershipReturnsUniqueTestsWithAllAssignmentsAndAllIncludesUncategorized() throws Exception {
        String multi = catalogTest("MULTI", "A synthetic", true, "THYROID", "BLOOD_TESTS");
        String blood = catalogTest("BLOOD", "B synthetic", true, "BLOOD_TESTS");
        String empty = catalogTest("EMPTY", "C synthetic", true);
        for (String category : List.of("BLOOD_TESTS", "THYROID")) {
            mvc.perform(bearer(get("/api/lab-tests").param("category", category), Role.PATIENT))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(category.equals("THYROID") ? 1 : 2))
                    .andExpect(jsonPath("$.content[0].id").value(multi))
                    .andExpect(jsonPath("$.content[0].categories").value(org.hamcrest.Matchers.is(List.of("BLOOD_TESTS", "THYROID"))));
        }
        mvc.perform(bearer(get("/api/lab-tests"), Role.PATIENT)).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.content[*].id").value(org.hamcrest.Matchers.is(List.of(multi, blood, empty))))
                .andExpect(jsonPath("$.content[2].categories").isArray()).andExpect(jsonPath("$.content[2].categories").isEmpty());
        for (var category : com.smartlims.labtests.entity.LabTestCategory.values()) {
            int count = switch (category) { case BLOOD_TESTS -> 2; case THYROID -> 1; default -> 0; };
            mvc.perform(bearer(get("/api/lab-tests").param("category", category.name()), Role.ADMIN))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(count));
        }
        mvc.perform(bearer(get("/api/lab-tests").param("category", "KIDNEY"), Role.PATIENT))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty())
                .andExpect(jsonPath("$.totalElements").value(0)).andExpect(jsonPath("$.totalPages").value(0))
                .andExpect(jsonPath("$.first").value(true)).andExpect(jsonPath("$.last").value(true));
    }

    @Test
    void combinesFiltersBeforePaginationCountsAndStableSortingWithoutDuplicates() throws Exception {
        List<String> expected = new ArrayList<>();
        expected.add(catalogTest("M1", "Matching synthetic", true, "BLOOD_TESTS", "THYROID"));
        expected.add(catalogTest("M2", "Matching synthetic", true, "BLOOD_TESTS"));
        catalogTest("M3", "Matching synthetic", true, "KIDNEY");
        catalogTest("M4", "Matching synthetic", false, "BLOOD_TESTS", "THYROID");
        catalogTest("M5", "Matching synthetic", true);
        expected.add(catalogTest("M6", "Matching synthetic", true, "BLOOD_TESTS", "LIPIDS"));
        catalogTest("N1", "Unrelated synthetic", true, "BLOOD_TESTS");
        // PostgreSQL UUID ordering supplies the unchanged tie-breaker for equal names/prices.
        List<String> byId = expected.stream().sorted().toList();
        for (String sort : List.of("name,asc", "name,desc", "price,asc", "price,desc")) {
            Set<String> seen = new HashSet<>();
            for (int page = 0; page < 3; page++) {
                var response = mvc.perform(bearer(get("/api/lab-tests").param("search", " mAtChInG ")
                        .param("category", "BLOOD_TESTS").param("active", "true").param("size", "1")
                        .param("page", Integer.toString(page)).param("sort", sort), Role.PATIENT))
                        .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(3))
                        .andExpect(jsonPath("$.totalPages").value(3)).andExpect(jsonPath("$.page").value(page))
                        .andExpect(jsonPath("$.content.length()").value(1))
                        .andExpect(jsonPath("$.content[0].id").value(byId.get(page))).andReturn().getResponse();
                assertTrue(seen.add(json.readTree(response.getContentAsString()).get("content").get(0).get("id").asString()));
            }
            assertEquals(new HashSet<>(expected), seen);
        }
        mvc.perform(bearer(get("/api/lab-tests").param("search", "matching").param("category", "BLOOD_TESTS")
                .param("sort", "code,desc"), Role.PATIENT)).andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].code").value(org.hamcrest.Matchers.is(List.of("M6", "M2", "M1"))));
        for (String page : List.of("3", "2147483647")) {
            mvc.perform(bearer(get("/api/lab-tests").param("search", "matching").param("category", "BLOOD_TESTS")
                    .param("page", page).param("size", "2"), Role.PATIENT))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty())
                    .andExpect(jsonPath("$.totalElements").value(3)).andExpect(jsonPath("$.totalPages").value(2));
        }
        mvc.perform(bearer(get("/api/lab-tests").param("search", "M2").param("category", "BLOOD_TESTS"), Role.PATIENT))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].code").value("M2"));
    }

    @Test
    void listAvailabilityAppliesToEveryRoleAndBothAuthenticationTransports() throws Exception {
        catalogTest("ACTIVE", "Active synthetic", true, "BLOOD_TESTS");
        catalogTest("INACTIVE", "Inactive synthetic", false, "BLOOD_TESTS");
        catalogTest("EMPTY_ACTIVE", "Unassigned active", true);
        catalogTest("EMPTY_INACTIVE", "Unassigned inactive", false);
        for (Role role : Role.values()) {
            for (boolean cookie : List.of(false, true)) {
                for (String active : List.of("omitted", "true", "false")) {
                    for (boolean category : List.of(false, true)) {
                        var request = get("/api/lab-tests");
                        if (!active.equals("omitted")) request.param("active", active);
                        if (category) request.param("category", "BLOOD_TESTS");
                        if (cookie) request.cookie(new Cookie("access_token", tokens.get(role)));
                        else bearer(request, role);
                        if (role == Role.PATIENT && active.equals("false")) {
                            mvc.perform(request).andExpect(status().isForbidden())
                                    .andExpect(jsonPath("$.code").value("FORBIDDEN"))
                                    .andExpect(jsonPath("$.fieldErrors").isEmpty());
                        } else {
                            int count = (role == Role.PATIENT || !active.equals("omitted") ? 2 : 4) / (category ? 2 : 1);
                            var result = mvc.perform(request).andExpect(status().isOk())
                                    .andExpect(jsonPath("$.totalElements").value(count));
                            if (role == Role.PATIENT || active.equals("true"))
                                result.andExpect(jsonPath("$.content[*].active").value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is(true))));
                            if (active.equals("false"))
                                result.andExpect(jsonPath("$.content[*].active").value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is(false))));
                        }
                    }
                }
            }
        }
        mvc.perform(bearer(get("/api/lab-tests").param("categories", "BLOOD_TESTS").param("isActive", "false"), Role.PATIENT))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[*].active").value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is(true))));
        mvc.perform(get("/api/lab-tests").param("category", "BLOOD_TESTS")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/lab-tests").param("category", "BLOOD_TESTS").header("Authorization", "Bearer invalid"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void invalidAndRepeatedQueriesUseExistingErrorsBeforePatientInactivePolicy() throws Exception {
        Map<String, List<String>> invalid = new LinkedHashMap<>();
        invalid.put("category", List.of("", " ", "All", "null", "UNKNOWN", "blood_tests", " BLOOD_TESTS", "BLOOD_TESTS ", "BLOOD_TESTS,THYROID"));
        invalid.put("active", List.of("", "False", "0", "null"));
        invalid.put("page", List.of("", "-1", "1.0", "2147483648"));
        invalid.put("size", List.of("0", "101", "-1", "1.0"));
        invalid.put("sort", List.of("category,asc", "name,ASC", "name", ""));
        invalid.put("search", List.of("x".repeat(151)));
        for (var field : invalid.entrySet()) {
            for (String value : field.getValue()) {
                var request = get("/api/lab-tests").param(field.getKey(), value);
                if (!field.getKey().equals("active")) request.param("active", "false");
                var response = mvc.perform(bearer(request, Role.PATIENT)).andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                        .andExpect(jsonPath("$.fieldErrors." + field.getKey()).value("Invalid value."))
                        .andExpect(header().string("Cache-Control", "no-store"))
                        .andExpect(header().exists("X-Request-Id")).andReturn().getResponse();
                assertEquals(response.getHeader("X-Request-Id"), json.readTree(response.getContentAsString()).get("requestId").asString());
            }
        }
        for (var field : Map.of("category", "THYROID", "active", "false", "search", "", "page", "0", "size", "20", "sort", "name,asc").entrySet()) {
            var request = get("/api/lab-tests").param(field.getKey(), field.getValue(), field.getValue());
            if (!field.getKey().equals("active")) request.param("active", "false");
            mvc.perform(bearer(request, Role.PATIENT)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                    .andExpect(jsonPath("$.fieldErrors." + field.getKey()).value("Invalid value."));
        }
    }

    @Test
    void categoryFilteringPreservesLiteralSearchWildcardsBackslashAndBlankSearch() throws Exception {
        catalogTest("LITERAL", "Synthetic 50%_\\ marker", true, "THYROID", "BLOOD_TESTS");
        catalogTest("PLAIN", "Synthetic 50AB marker", true, "THYROID");
        catalogTest("OTHER", "Synthetic 50%_\\ marker", true, "LIVER");
        for (String search : List.of("%", "_", "\\", "50%_\\")) {
            mvc.perform(bearer(get("/api/lab-tests").param("category", "THYROID").param("search", search), Role.PATIENT))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.content[0].code").value("LITERAL"));
        }
        mvc.perform(bearer(get("/api/lab-tests").param("category", "THYROID").param("search", "  "), Role.PATIENT))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2));
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
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN"));
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
            // The ADMIN iteration deactivates this test; later PATIENT detail reads must now be hidden.
            boolean hidden = role == Role.PATIENT && !jdbc.queryForObject(
                    "SELECT active FROM lab_tests WHERE id = ?", Boolean.class, UUID.fromString(id));
            mvc.perform(get("/api/lab-tests/" + id).cookie(access)).andExpect(status().is(hidden ? 404 : 200));
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
