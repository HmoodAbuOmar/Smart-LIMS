package com.smartlims.auth;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.dto.LoginRequest;
import com.smartlims.auth.dto.RegistrationRequest;
import com.smartlims.auth.dto.UpdateAccountRequest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.AccountOrigin;
import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.EmailActionTokenRepository;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.service.AccountManagementService;
import com.smartlims.auth.service.AuthRequestException;
import com.smartlims.auth.service.LoginService;
import com.smartlims.auth.service.RegistrationService;
import com.smartlims.auth.service.VerificationTokens;
import jakarta.servlet.http.Cookie;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class RegistrationTest extends IsolatedPostgresTest {
    @Autowired
    MockMvc mvc;
    @Autowired
    JsonMapper json;
    @Autowired
    UserAccountRepository users;
    @Autowired
    EmailActionTokenRepository tokens;
    @Autowired
    PasswordEncoder passwords;
    @Autowired
    RegistrationService registration;
    @Autowired
    LoginService login;
    @Autowired
    AccountManagementService accounts;
    @Autowired
    VerificationTokens hashes;
    @Autowired
    JdbcTemplate jdbc;
    @MockitoBean
    VerificationEmailSender email;
    private final AtomicReference<String> verification = new AtomicReference<>();

    @BeforeEach
    void fixtures() {
        jdbc.execute("TRUNCATE TABLE patient_notifications,laboratory_events,result_specimens,result_values,test_results,specimen_attestations,samples,visit_items,visits,test_parameters,appointment_reschedules,appointments,appointment_slots,appointment_types,order_items, test_orders, patient_link_tokens, patients, email_action_tokens, users");
        reset(email);
        verification.set(null);
        doAnswer(call -> {
            verification.set(call.getArgument(2));
            return null;
        })
                .when(email).sendVerification(anyString(), any(), anyString());
    }

    private Map<String, Object> body() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("fullName", " Synthetic Account ");
        body.put("email", " REGISTERED@EXAMPLE.INVALID ");
        body.put("password", "abcdefgh");
        body.put("confirmPassword", "abcdefgh");
        return body;
    }

    private MvcResult register(Map<String, Object> body, int expectedStatus) throws Exception {
        return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(body)))
                .andExpect(status().is(expectedStatus)).andExpect(header().string("Cache-Control", "no-store"))
                .andReturn();
    }

    private void validationError(Map<String, Object> body, String field) throws Exception {
        MvcResult result = register(body, 400);
        var error = json.readTree(result.getResponse().getContentAsString());
        assertEquals("VALIDATION_ERROR", error.get("code").asString());
        assertTrue(error.get("fieldErrors").has(field));
        assertEquals(result.getResponse().getHeader("X-Request-Id"), error.get("requestId").asString());
        assertFalse(result.getResponse().getContentAsString().contains("abcdefgh"));
        assertEquals(0, users.count());
        assertEquals(0, tokens.count());
        verifyNoInteractions(email);
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing", "null", "empty", "mismatch", "whitespace", "case"})
    void confirmationErrorsUseExistingEnvelopeAndHaveNoSideEffects(String variant) throws Exception {
        Map<String, Object> body = body();
        switch (variant) {
            case "missing" -> body.remove("confirmPassword");
            case "null" -> body.put("confirmPassword", null);
            case "empty" -> body.put("confirmPassword", "");
            case "mismatch" -> body.put("confirmPassword", "different");
            case "whitespace" -> body.put("confirmPassword", "abcdefgh ");
            case "case" -> body.put("confirmPassword", "Abcdefgh");
            default -> throw new IllegalArgumentException();
        }
        validationError(body, "confirmPassword");
    }

    @ParameterizedTest
    @ValueSource(strings = {"fullName", "email", "password"})
    void otherRegistrationFieldsRemainRequired(String field) throws Exception {
        Map<String, Object> body = body();
        body.remove(field);
        validationError(body, field);
    }

    @ParameterizedTest
    @ValueSource(strings = {"userName", "phoneNumber", "role"})
    void publicRegistrationRejectsRemovedAndAdministrativeFields(String field) throws Exception {
        Map<String, Object> body = body();
        body.put(field, "unexpected");
        MvcResult result = register(body, 400);
        assertEquals("INVALID_JSON", json.readTree(result.getResponse().getContentAsString()).get("code").asString());
        assertEquals(0, users.count());
        assertEquals(0, tokens.count());
        verifyNoInteractions(email);
    }

    @ParameterizedTest(name = "{displayName} [{index}]")
    @NullAndEmptySource
    @ValueSource(strings = {"different", "abcdefgh "})
    void directRegistrationAlsoRejectsInvalidConfirmation(String confirmation) {
        AuthRequestException error = assertThrows(AuthRequestException.class, () -> registration.register(
                new RegistrationRequest("Synthetic Account", "registered@example.invalid", "abcdefgh", confirmation), null));
        assertEquals("VALIDATION_ERROR", error.getCode());
        assertEquals("confirmPassword", error.getField());
        assertEquals(0, users.count());
        assertEquals(0, tokens.count());
        verifyNoInteractions(email);
    }

    @Test
    void registrationVerificationAndBothLoginModesSupportAbsentAccountDetails() throws Exception {
        MvcResult created = register(body(), 200);
        assertFalse(created.getResponse().getContentAsString().contains("confirmPassword"));
        assertFalse(created.getResponse().getContentAsString().contains("abcdefgh"));
        UserAccount user = users.findByEmail("registered@example.invalid").orElseThrow();
        assertEquals("Synthetic Account", user.getFullName());
        assertNull(user.getUserName());
        assertNull(user.getPhoneNumber());
        assertEquals(Role.PATIENT, user.getRole());
        assertEquals(AccountOrigin.PUBLIC_REGISTRATION, user.getOrigin());
        assertNull(user.getEmailVerifiedAt());
        assertTrue(passwords.matches("abcdefgh", user.getPasswordHash()));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM patients", Integer.class));
        assertEquals(hashes.hash(verification.get()), tokens.findAll().getFirst().getTokenHash());
        assertEquals("EMAIL_NOT_CONFIRMED", assertThrows(AuthRequestException.class,
                () -> login.login(new LoginRequest(user.getEmail(), "abcdefgh"))).getCode());

        mvc.perform(get("/api/auth/confirm-email").param("userId", user.getId().toString())
                .param("token", verification.get())).andExpect(status().isOk());
        mvc.perform(get("/api/auth/confirm-email").param("userId", user.getId().toString())
                        .param("token", verification.get())).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_VERIFICATION_TOKEN"));
        MvcResult loggedIn = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emailOrUserName\":\"registered@example.invalid\",\"password\":\"abcdefgh\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.token").isString()).andReturn();
        String jwt = json.readTree(loggedIn.getResponse().getContentAsString()).get("token").asString();
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + jwt)).andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Synthetic Account"))
                .andExpect(jsonPath("$.userName").isEmpty()).andExpect(jsonPath("$.phoneNumber").isEmpty());

        Cookie csrf = mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertNotNull(csrf);
        MvcResult cookieLogin = mvc.perform(post("/api/auth/cookie-login").cookie(csrf)
                        .header("X-XSRF-TOKEN", csrf.getValue()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emailOrUserName\":\"registered@example.invalid\",\"password\":\"abcdefgh\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.user.userName").isEmpty())
                .andExpect(jsonPath("$.user.phoneNumber").isEmpty()).andReturn();
        Cookie access = cookieLogin.getResponse().getCookie("access_token");
        assertNotNull(access);
        assertTrue(access.isHttpOnly());
        mvc.perform(get("/api/auth/me").cookie(access)).andExpect(status().isOk());
    }

    static Stream<String> validPasswords() {
        String supplementary = new String(Character.toChars(0x1F600));
        return Stream.of("abcdefgh", "a".repeat(100), supplementary.repeat(100), " ".repeat(8));
    }

    @ParameterizedTest(name = "{displayName} [{index}]")
    @MethodSource("validPasswords")
    void registrationRetainsPasswordPolicy(String password) throws Exception {
        Map<String, Object> body = body();
        body.put("password", password);
        body.put("confirmPassword", password);
        register(body, 200);
        assertTrue(passwords.matches(password, users.findAll().getFirst().getPasswordHash()));
    }

    @ParameterizedTest
    @ValueSource(ints = {7, 101})
    void registrationRejectsPasswordsOutsideExistingBounds(int length) throws Exception {
        Map<String, Object> body = body();
        body.put("password", "a".repeat(length));
        body.put("confirmPassword", "a".repeat(length));
        validationError(body, "password");
    }

    @Test
    void multipleAccountsCanOmitUsernameAndPhoneWhileDuplicateEmailStillConflicts() {
        registration.register(new RegistrationRequest("First Synthetic Account", "first@example.invalid", "abcdefgh", "abcdefgh"), null);
        registration.register(new RegistrationRequest("Second Synthetic Account", "second@example.invalid", "abcdefgh", "abcdefgh"), null);
        assertEquals(2, users.count());
        users.findAll().forEach(user -> {
            assertNull(user.getUserName());
            assertNull(user.getPhoneNumber());
        });
        AuthRequestException duplicate = assertThrows(AuthRequestException.class, () -> registration.register(
                new RegistrationRequest("Duplicate Account", " FIRST@EXAMPLE.INVALID ", "abcdefgh", "abcdefgh"), null));
        assertEquals("EMAIL_IN_USE", duplicate.getCode());
        assertEquals("email", duplicate.getField());
        assertEquals(2, users.count());
        assertEquals(2, tokens.count());
    }

    @Test
    void profileCreationRequiresItsOwnPhoneAndNamesNeverSynchronize() throws Exception {
        var registered = registration.register(new RegistrationRequest("Account Name", "registered@example.invalid",
                "abcdefgh", "abcdefgh"), null);
        registration.verify(verification.get(), registered.id());
        String jwt = login.login(new LoginRequest("registered@example.invalid", "abcdefgh")).accessToken();
        String demographics = """
                {"fullName":"Profile Name","dateOfBirth":"2000-01-01","gender":"UNKNOWN"}
                """;
        mvc.perform(post("/api/patients/me").header("Authorization", "Bearer " + jwt)
                        .contentType(MediaType.APPLICATION_JSON).content(demographics)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.phoneNumber").exists());
        String complete = demographics.strip().replace("}", ",\"phoneNumber\":\"000001\"}");
        mvc.perform(post("/api/patients/me").header("Authorization", "Bearer " + jwt)
                        .contentType(MediaType.APPLICATION_JSON).content(complete)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.fullName").value("Profile Name"));
        UserAccount afterProfile = users.findById(registered.id()).orElseThrow();
        assertEquals("Account Name", afterProfile.getFullName());
        assertNull(afterProfile.getPhoneNumber());
        accounts.update(registered.id(), new UpdateAccountRequest("Updated Account Name", "registered@example.invalid",
                "registered", "000002"));
        mvc.perform(get("/api/patients/me").header("Authorization", "Bearer " + jwt)).andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Profile Name"))
                .andExpect(jsonPath("$.phoneNumber").value("000001"));
        assertEquals("registered", login.login(new LoginRequest("registered", "abcdefgh")).account().userName());
    }

    @Test
    void requestStringRepresentationRedactsBothPasswords() {
        String printable = new RegistrationRequest("Synthetic Account", "registered@example.invalid",
                "password-value", "confirmation-value").toString();
        assertFalse(printable.contains("password-value"));
        assertFalse(printable.contains("confirmation-value"));
    }
}
