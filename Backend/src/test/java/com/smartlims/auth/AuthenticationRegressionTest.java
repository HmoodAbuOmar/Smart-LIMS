package com.smartlims.auth;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.dto.*;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.*;
import com.smartlims.auth.repository.*;
import com.smartlims.auth.security.*;
import com.smartlims.auth.service.*;
import jakarta.servlet.http.Cookie;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class AuthenticationRegressionTest extends IsolatedPostgresTest {
    @Autowired
    MockMvc mvc;
    @MockitoSpyBean
    UserAccountRepository users;
    @Autowired
    EmailActionTokenRepository tokens;
    @Autowired
    PasswordEncoder passwords;
    @Autowired
    PasswordRecoveryService recovery;
    @Autowired
    AccountManagementService accounts;
    @Autowired
    LoginService login;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    TransactionTemplate transactions;
    @Autowired
    AdministratorCoordination coordination;
    @Autowired
    JwtEncoder jwtEncoder;
    @MockitoBean
    VerificationEmailSender email;

    private final AtomicReference<String> resetCode = new AtomicReference<>();
    private final AtomicReference<String> invitation = new AtomicReference<>();

    @BeforeEach
    void resetIsolatedDatabase() {
        // The superclass requires the dedicated database URL; never use application datasource defaults.
        jdbc.execute("TRUNCATE TABLE audit_logs,reference_ranges,patient_notifications,laboratory_events,result_specimens,result_values,test_results,specimen_attestations,samples,visit_items,visits,test_parameters,appointment_reschedules,appointments,appointment_slots,appointment_types,order_items, test_orders, patient_link_tokens, patients, email_action_tokens, users");
        reset(email);
        reset(users);
        doAnswer(call -> {
            resetCode.set(call.getArgument(1));
            return null;
        })
                .when(email).sendPasswordReset(anyString(), anyString());
        doAnswer(call -> {
            invitation.set(call.getArgument(2));
            return null;
        })
                .when(email).sendSetPassword(anyString(), any(UUID.class), anyString());
    }

    private UserAccount active(String name, Role role) {
        UserAccount user = UserAccount.invite("Regression Account", name + "@example.invalid", name, "0000000000", role);
        user.acceptInvitation(passwords.encode("oldpass1"), Instant.now());
        return users.saveAndFlush(user);
    }

    private Authentication actor(UUID id) {
        return new UsernamePasswordAuthenticationToken(id.toString(), null,
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
    }

    private AuthRequestException wrongReset(UserAccount user) {
        return assertThrows(AuthRequestException.class,
                () -> recovery.reset(new ResetPasswordRequest(user.getEmail(), "0000", "newpass1")));
    }

    @Test
    void resetCodeIsInvalidatedOnFifthFailureAndNewCodeResetsCounter() {
        UserAccount user = active("patient", Role.PATIENT);
        recovery.forgot(user.getEmail());
        String firstCode = resetCode.get();
        assertTrue(firstCode.matches("[1-9][0-9]{3}"));
        Instant expiry = users.findById(user.getId()).orElseThrow().getResetCodeExpiresAt();
        assertTrue(expiry.isAfter(Instant.now().plusSeconds(890)));
        for (int i = 1; i <= 4; i++) {
            assertEquals("INVALID_RESET_CODE", wrongReset(user).getCode());
            assertEquals(i, users.findById(user.getId()).orElseThrow().getResetCodeFailedAttempts());
        }
        wrongReset(user);
        UserAccount exhausted = users.findById(user.getId()).orElseThrow();
        assertNull(exhausted.getResetCodeHash());
        assertEquals(0, exhausted.getFailedLoginAttempts());
        assertThrows(AuthRequestException.class,
                () -> recovery.reset(new ResetPasswordRequest(user.getEmail(), firstCode, "newpass1")));
        recovery.forgot(user.getEmail());
        assertEquals(0, users.findById(user.getId()).orElseThrow().getResetCodeFailedAttempts());
        recovery.reset(new ResetPasswordRequest(user.getEmail(), resetCode.get(), "newpass1"));
        UserAccount recovered = users.findById(user.getId()).orElseThrow();
        assertNull(recovered.getResetCodeHash());
        assertEquals(0, recovered.getResetCodeFailedAttempts());
        assertTrue(passwords.matches("newpass1", recovered.getPasswordHash()));
        assertThrows(AuthRequestException.class,
                () -> recovery.reset(new ResetPasswordRequest(user.getEmail(), resetCode.get(), "another1")));
    }

    @Test
    void resetCanSucceedAfterFourFailuresAndRejectsExpiredCode() {
        UserAccount user = active("patient", Role.PATIENT);
        recovery.forgot(user.getEmail());
        for (int i = 0; i < 4; i++)
            wrongReset(user);
        recovery.reset(new ResetPasswordRequest(user.getEmail(), resetCode.get(), "newpass1"));
        recovery.forgot(user.getEmail());
        jdbc.update("UPDATE users SET reset_code_expires_at = ? WHERE id = ?",
                java.sql.Timestamp.from(Instant.now().minusSeconds(1)), user.getId());
        assertThrows(AuthRequestException.class,
                () -> recovery.reset(new ResetPasswordRequest(user.getEmail(), resetCode.get(), "another1")));
    }

    @Test
    void concurrentIncorrectResetAttemptsCannotBypassLimit() throws Exception {
        UserAccount user = active("patient", Role.PATIENT);
        recovery.forgot(user.getEmail());
        runTogether(() -> {
                    for (int i = 0; i < 3; i++)
                        wrongReset(user);
                    return "done";
                },
                () -> {
                    for (int i = 0; i < 3; i++)
                        wrongReset(user);
                    return "done";
                });
        assertNull(users.findById(user.getId()).orElseThrow().getResetCodeHash());
    }

    @Test
    void sameNormalizedEmailUpdatesProfileButDifferentEmailIsRejected() {
        UserAccount user = active("patient", Role.PATIENT);
        var administrator = actor(active("admin", Role.ADMIN).getId());
        recovery.forgot(user.getEmail());
        String previousHash = users.findById(user.getId()).orElseThrow().getResetCodeHash();
        accounts.update(administrator, user.getId(), new UpdateAccountRequest("Updated Profile", " PATIENT@EXAMPLE.INVALID ",
                " patient-updated ", "0000000000"));
        UserAccount updated = users.findById(user.getId()).orElseThrow();
        assertEquals("patient-updated", updated.getUserName());
        assertEquals(previousHash, updated.getResetCodeHash());
        AuthRequestException failure = assertThrows(AuthRequestException.class, () -> accounts.update(administrator, user.getId(),
                new UpdateAccountRequest("Updated Profile", "different@example.invalid", "patient", "0000000000")));
        assertEquals("EMAIL_CHANGE_NOT_ALLOWED", failure.getCode());
        assertEquals("email", failure.getField());
        assertEquals(user.getEmail(), users.findById(user.getId()).orElseThrow().getEmail());
    }

    @Test
    void usernamesAreTrimmedValidatedAndConflictsAreSpecificInAdministrativeFlows() {
        active("registered", Role.PATIENT);
        var administrator = actor(active("admin", Role.ADMIN).getId());
        AccountResponse created = accounts.create(administrator, new CreateAccountRequest("Regression Staff", "staff@example.invalid",
                " staff ", "0000000000", Role.RECEPTIONIST));
        assertEquals("staff", created.userName());
        assertEquals("USERNAME_IN_USE", assertThrows(AuthRequestException.class, () -> accounts.create(administrator,
                new CreateAccountRequest("Regression Staff", "other@example.invalid", " STAFF ",
                        "0000000000", Role.RECEPTIONIST))).getCode());
        assertEquals("USERNAME_IN_USE", assertThrows(AuthRequestException.class, () -> accounts.update(administrator, created.id(),
                new UpdateAccountRequest("Regression Staff", "staff@example.invalid", " REGISTERED ", "0000000000"))).getCode());
        assertEquals("VALIDATION_ERROR", assertThrows(AuthRequestException.class, () -> accounts.update(administrator, created.id(),
                new UpdateAccountRequest("Regression Staff", "staff@example.invalid", " a ", "0000000000"))).getCode());
        assertThrows(AuthRequestException.class, () -> accounts.create(administrator, new CreateAccountRequest("Regression Staff",
                "other@example.invalid", " a ", "0000000000", Role.RECEPTIONIST)));
    }

    private MockHttpServletRequestBuilder csrf(MockHttpServletRequestBuilder request, String access) throws Exception {
        Cookie token = mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertNotNull(token);
        request.cookie(token).header("X-XSRF-TOKEN", token.getValue());
        if (access != null)
            request.cookie(new Cookie("access_token", access));
        return request;
    }

    @Test
    void publicRoutesIgnoreStaleCredentialsButMeDoesNot() throws Exception {
        for (String stale : List.of(expiredToken(), blockedToken(), deletedToken())) {
            for (boolean header : List.of(false, true)) {
                MockHttpServletRequestBuilder loginRequest = post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emailOrUserName\":\"missing\",\"password\":\"abcdefgh\"}");
                if (header)
                    loginRequest.header("Authorization", "Bearer " + stale);
                else
                    loginRequest = csrf(loginRequest, stale);
                mvc.perform(loginRequest).andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
                MockHttpServletRequestBuilder logout = csrf(post("/api/auth/logout"), stale);
                if (header)
                    logout.header("Authorization", "Bearer " + stale);
                mvc.perform(logout).andExpect(status().isOk());
                for (String path : List.of("register", "cookie-login", "forgot-password", "reset-password", "set-password")) {
                    MockHttpServletRequestBuilder publicRequest = csrf(post("/api/auth/" + path)
                            .contentType(MediaType.APPLICATION_JSON).content("{}"), stale);
                    if (header)
                        publicRequest.header("Authorization", "Bearer " + stale);
                    mvc.perform(publicRequest).andExpect(status().isBadRequest())
                            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
                }
                MockHttpServletRequestBuilder confirmation = get("/api/auth/confirm-email").param("token", "stale")
                        .param("userId", UUID.randomUUID().toString()).cookie(new Cookie("access_token", stale));
                if (header)
                    confirmation.header("Authorization", "Bearer " + stale);
                mvc.perform(confirmation).andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.code").value("INVALID_VERIFICATION_TOKEN"));
                mvc.perform(get("/api/auth/csrf-token").header("Authorization", "Bearer " + stale)
                        .cookie(new Cookie("access_token", stale))).andExpect(status().isOk());
            }
            mvc.perform(get("/api/auth/me").cookie(new Cookie("access_token", stale))).andExpect(status().isUnauthorized());
            mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + stale)).andExpect(status().isUnauthorized());
        }
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    private String blockedToken() {
        UserAccount user = active("blocked", Role.PATIENT);
        String jwt = login.login(new LoginRequest(user.getUserName(), "oldpass1")).accessToken();
        user.setEnabled(false);
        users.saveAndFlush(user);
        return jwt;
    }

    private String expiredToken() {
        UserAccount user = active("expired", Role.PATIENT);
        return jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder().issuer(JwtKeyConfiguration.ISSUER).audience(List.of(JwtKeyConfiguration.AUDIENCE))
                        .subject(user.getId().toString()).issuedAt(Instant.now().minusSeconds(120))
                        .expiresAt(Instant.now().minusSeconds(60)).build())).getTokenValue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"creation", "update"})
    void concurrentUsernameUniquenessViolationsReturnUsernameConflict(String competingFlow) throws Exception {
        UserAccount firstAccount = active("first", Role.PATIENT);
        UserAccount existing = active("existing", Role.PATIENT);
        var administrator = actor(active("admin", Role.ADMIN).getId());
        // Administrative writes now serialize authorization and uniqueness checks together.
        Supplier<String> first = () -> updateUsernameRace(administrator, firstAccount);
        Supplier<String> second = () -> {
            try {
                switch (competingFlow) {
                    case "creation" ->
                            accounts.create(administrator, new CreateAccountRequest("Regression Staff", "two@example.invalid",
                                    " race ", "0000000000", Role.RECEPTIONIST));
                    case "update" -> accounts.update(administrator, existing.getId(), new UpdateAccountRequest("Regression Patient",
                            existing.getEmail(), " race ", "0000000000"));
                    default -> throw new IllegalArgumentException();
                }
                return "ok";
            } catch (AuthRequestException failure) {
                return failure.getCode();
            }
        };
        List<String> result = runTogether(first, second);
        assertEquals(1, result.stream().filter("ok"::equals).count());
        assertEquals(1, result.stream().filter("USERNAME_IN_USE"::equals).count());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM users WHERE lower(user_name) = 'race'", Integer.class));
    }

    private String updateUsernameRace(Authentication administrator, UserAccount account) {
        try {
            accounts.update(administrator, account.getId(), new UpdateAccountRequest("Regression Patient",
                    account.getEmail(), " race ", "0000000000"));
            return "ok";
        } catch (AuthRequestException failure) {
            return failure.getCode();
        }
    }

    private String deletedToken() {
        UserAccount user = active("deleted", Role.PATIENT);
        String jwt = login.login(new LoginRequest(user.getUserName(), "oldpass1")).accessToken();
        users.delete(user);
        return jwt;
    }

    @Test
    void cookieCsrfRequiresMatchingHeaderAndLoginRotatesToken() throws Exception {
        UserAccount admin = active("admin", Role.ADMIN);
        String jwt = login.login(new LoginRequest("admin", "oldpass1")).accessToken();
        String body = "{\"emailOrUserName\":\"admin\",\"password\":\"oldpass1\"}";
        mvc.perform(post("/api/auth/cookie-login").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());
        Cookie before = mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        mvc.perform(post("/api/auth/cookie-login").cookie(before).header("X-XSRF-TOKEN", "wrong")
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        MvcResult result = mvc.perform(post("/api/auth/cookie-login").cookie(before)
                        .header("X-XSRF-TOKEN", before.getValue()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn();
        Cookie after = result.getResponse().getCookie("XSRF-TOKEN");
        Cookie access = result.getResponse().getCookie("access_token");
        assertNotNull(after);
        assertNotEquals(before.getValue(), after.getValue());
        assertNotNull(access);
        assertTrue(access.isHttpOnly());
        assertFalse(after.isHttpOnly());
        assertFalse(access.getSecure());
        assertEquals("Lax", access.getAttribute("SameSite"));
        assertEquals("Lax", after.getAttribute("SameSite"));
        mvc.perform(post("/api/auth/logout").cookie(access)).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/logout").cookie(access, after).header("X-XSRF-TOKEN", before.getValue()))
                .andExpect(status().isForbidden());
        MvcResult logout = mvc.perform(post("/api/auth/logout").cookie(access, after)
                .header("X-XSRF-TOKEN", after.getValue())).andExpect(status().isOk()).andReturn();
        assertEquals(0, logout.getResponse().getCookie("access_token").getMaxAge());
        assertEquals(0, logout.getResponse().getCookie("XSRF-TOKEN").getMaxAge());
        mvc.perform(patch("/api/users/" + admin.getId() + "/unblock").cookie(new Cookie("access_token", jwt)))
                .andExpect(status().isForbidden());
        mvc.perform(csrf(patch("/api/users/" + admin.getId() + "/unblock"), jwt)).andExpect(status().isOk());
        // Logout intentionally does not revoke a previously issued JWT.
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + jwt)).andExpect(status().isOk());
    }

    @Test
    void bearerIsCsrfExemptAndWinsOverCookieWithoutFallback() throws Exception {
        UserAccount admin = active("admin", Role.ADMIN);
        String jwt = login.login(new LoginRequest("admin", "oldpass1")).accessToken();
        mvc.perform(patch("/api/users/" + admin.getId() + "/unblock").header("Authorization", "Bearer " + jwt)
                .cookie(new Cookie("access_token", "stale"))).andExpect(status().isOk());
        mvc.perform(patch("/api/users/" + admin.getId() + "/unblock").header("Authorization", "Bearer stale")
                .cookie(new Cookie("access_token", jwt))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").header("Authorization", "Basic ignored").cookie(new Cookie("access_token", jwt)))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/cookie-login").header("Authorization", "Bearer " + jwt)
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
    }

    @Test
    void corsOnlyAllowsConfiguredExactOrigin() throws Exception {
        mvc.perform(options("/api/users").header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "X-XSRF-TOKEN"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
        mvc.perform(options("/api/users").header("Origin", "https://untrusted.example.invalid")
                .header("Access-Control-Request-Method", "POST")).andExpect(status().isForbidden());
    }

    @ParameterizedTest
    @ValueSource(strings = {"block", "demote", "delete", "block-demote", "block-delete", "demote-delete"})
    void concurrentAdministratorRemovalsPreserveOneActiveAdministrator(String operation) throws Exception {
        UserAccount first = active("first", Role.ADMIN);
        UserAccount second = active("second", Role.ADMIN);
        String[] operations = operation.split("-");
        List<String> results = runTogether(() -> removeAdmin(operations[0], first.getId(), second.getId()),
                () -> removeAdmin(operations[operations.length - 1], second.getId(), first.getId()));
        assertEquals(1, results.stream().filter("ok"::equals).count());
        String winningOperation = results.getFirst().equals("ok") ? operations[0] : operations[operations.length - 1];
        assertEquals(1, results.stream().filter((winningOperation.equals("demote") ? "FORBIDDEN" : "UNAUTHORIZED")::equals).count());
        assertEquals(1, users.countByRoleAndEnabledTrueAndEmailVerifiedAtIsNotNull(Role.ADMIN));
        UserAccount remaining = users.findAll().stream().filter(u -> u.isEnabled() && u.getRole() == Role.ADMIN).findFirst().orElseThrow();
        assertEquals("LAST_ADMIN", assertThrows(AuthRequestException.class, () -> accounts.delete(actor(remaining.getId()), remaining.getId())).getCode());
        assertEquals("LAST_ADMIN", assertThrows(AuthRequestException.class, () -> accounts.setBlocked(actor(remaining.getId()), remaining.getId(), true)).getCode());
        assertEquals("LAST_ADMIN", assertThrows(AuthRequestException.class, () -> accounts.changeRole(actor(remaining.getId()), remaining.getId(), Role.PATIENT)).getCode());
        clearInvocations(email);
        assertEquals(Role.ADMIN, accounts.changeRole(actor(remaining.getId()), remaining.getId(), Role.ADMIN).role());
        verifyNoInteractions(email);
    }

    private String removeAdmin(String operation, UUID actor, UUID target) {
        try {
            switch (operation) {
                case "block" -> accounts.setBlocked(actor(actor), target, true);
                case "demote" -> accounts.changeRole(actor(actor), target, Role.PATIENT);
                case "delete" -> accounts.delete(actor(actor), target);
                default -> throw new IllegalArgumentException();
            }
            return "ok";
        } catch (AuthRequestException failure) {
            return failure.getCode();
        }
    }

    @Test
    void issuedJwtUsesCurrentRoleAndEligibilityAndSurvivesPasswordRecovery() throws Exception {
        UserAccount administrator = active("admin", Role.ADMIN);
        UserAccount subject = active("subject", Role.ADMIN);
        String jwt = login.login(new LoginRequest("subject", "oldpass1")).accessToken();
        mvc.perform(get("/api/users").header("Authorization", "Bearer " + jwt)).andExpect(status().isOk());
        accounts.changeRole(actor(administrator.getId()), subject.getId(), Role.PATIENT);
        mvc.perform(get("/api/users").header("Authorization", "Bearer " + jwt)).andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + jwt))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("PATIENT"));
        accounts.setBlocked(actor(administrator.getId()), subject.getId(), true);
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + jwt)).andExpect(status().isUnauthorized());
        accounts.setBlocked(actor(administrator.getId()), subject.getId(), false);
        recovery.forgot(subject.getEmail());
        recovery.reset(new ResetPasswordRequest(subject.getEmail(), resetCode.get(), "newpass1"));
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + jwt)).andExpect(status().isOk());
        accounts.delete(actor(administrator.getId()), subject.getId());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + jwt)).andExpect(status().isUnauthorized());
    }

    @Test
    void emailChangesReturnValidationResponseThroughApi() throws Exception {
        UserAccount admin = active("admin", Role.ADMIN);
        UserAccount patient = active("patient", Role.PATIENT);
        String jwt = login.login(new LoginRequest("admin", "oldpass1")).accessToken();
        String same = "{\"fullName\":\"Updated Profile\",\"email\":\" PATIENT@EXAMPLE.INVALID \","
                + "\"userName\":\" patient-updated \",\"phoneNumber\":\"0000000000\"}";
        mvc.perform(put("/api/users/" + patient.getId()).header("Authorization", "Bearer " + jwt)
                        .contentType(MediaType.APPLICATION_JSON).content(same)).andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(patient.getEmail()));
        mvc.perform(put("/api/users/" + patient.getId()).header("Authorization", "Bearer " + jwt)
                        .contentType(MediaType.APPLICATION_JSON).content(same.replace(" PATIENT@EXAMPLE.INVALID ", "different@example.invalid")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("EMAIL_CHANGE_NOT_ALLOWED"))
                .andExpect(jsonPath("$.fieldErrors.email").exists());
    }

    @Test
    void concurrentFirstAdministratorProvisioningCreatesOnlyOneInvitation() throws Exception {
        CreateAccountRequest profile = new CreateAccountRequest("Regression Administrator", "first@example.invalid",
                "first", "0000000000", Role.ADMIN);
        Supplier<String> provision = () -> {
            try {
                accounts.provisionFirstAdministrator(profile);
                return "ok";
            } catch (AuthRequestException failure) {
                return failure.getCode();
            }
        };
        List<String> results = runTogether(provision, provision);
        assertTrue(results.contains("ok"));
        assertTrue(results.contains("ADMIN_ALREADY_EXISTS"));
        assertEquals(1, users.count());
        UserAccount admin = users.findAll().getFirst();
        assertEquals(AccountOrigin.FIRST_ADMIN_INVITATION, admin.getOrigin());
        assertNull(admin.getPasswordHash());
        assertEquals(1, tokens.count());
        accounts.setPassword(admin.getId(), invitation.get(), "abcdefgh");
        assertEquals(Role.ADMIN, login.login(new LoginRequest("first", "abcdefgh")).account().role());
        assertThrows(AuthRequestException.class, () -> accounts.setPassword(admin.getId(), invitation.get(), "another1"));
    }

    private List<String> runTogether(Supplier<String> first, Supplier<String> second) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Callable<String> one = () -> {
                ready.countDown();
                start.await();
                return first.get();
            };
            Callable<String> two = () -> {
                ready.countDown();
                start.await();
                return second.get();
            };
            Future<String> a = executor.submit(one);
            Future<String> b = executor.submit(two);
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();
            return List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS));
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"null", "unauthenticated", "anonymous", "malformed", "missing",
            "PATIENT", "RECEPTIONIST", "LAB_TECHNICIAN", "missing-authority", "forged", "demoted", "blocked",
            "unverified", "passwordless", "unaccepted"})
    void everyAdministrativeServiceOperationRejectsUnauthorizedCallersWithoutSideEffects(String state) {
        var administrator = actor(active("administrator", Role.ADMIN).getId());
        var target = accounts.create(administrator, new CreateAccountRequest("Synthetic Target",
                "target@example.invalid", "target", "000001", Role.PATIENT));
        UserAccount caller = active("caller", Role.ADMIN);
        Authentication authentication = actor(caller.getId());
        String expected = "UNAUTHORIZED";
        switch (state) {
            case "null" -> authentication = null;
            case "unauthenticated" -> authentication = new UsernamePasswordAuthenticationToken(caller.getId().toString(), null);
            case "anonymous" -> authentication = new org.springframework.security.authentication.AnonymousAuthenticationToken(
                    "test", caller.getId().toString(), List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
            case "malformed" -> authentication = new UsernamePasswordAuthenticationToken("invalid-id", null,
                    List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
            case "missing" -> users.deleteById(caller.getId());
            case "missing-authority" -> {
                authentication = new UsernamePasswordAuthenticationToken(caller.getId().toString(), null,
                        List.of(new SimpleGrantedAuthority("ROLE_PATIENT")));
                expected = "FORBIDDEN";
            }
            case "PATIENT", "RECEPTIONIST", "LAB_TECHNICIAN" -> {
                jdbc.update("UPDATE users SET role=? WHERE id=?", state, caller.getId());
                authentication = new UsernamePasswordAuthenticationToken(caller.getId().toString(), null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + state)));
                expected = "FORBIDDEN";
            }
            case "forged", "demoted" -> {
                jdbc.update("UPDATE users SET role='PATIENT' WHERE id=?", caller.getId());
                expected = "FORBIDDEN";
            }
            case "blocked" -> jdbc.update("UPDATE users SET enabled=false WHERE id=?", caller.getId());
            case "unverified" -> jdbc.update("UPDATE users SET email_verified_at=NULL WHERE id=?", caller.getId());
            case "passwordless" -> jdbc.update("UPDATE users SET password_hash=NULL WHERE id=?", caller.getId());
            case "unaccepted" -> jdbc.update("UPDATE users SET invitation_accepted_at=NULL WHERE id=?", caller.getId());
            default -> throw new IllegalArgumentException(state);
        }
        var actor = authentication;
        var usersBefore = jdbc.queryForList("SELECT * FROM users ORDER BY id");
        var tokensBefore = jdbc.queryForList("SELECT * FROM email_action_tokens ORDER BY id");
        clearInvocations(email);
        List<Runnable> operations = List.of(
                () -> accounts.all(actor),
                () -> accounts.page(actor, java.util.Map.of()),
                () -> accounts.get(actor, target.id()),
                () -> accounts.create(actor, new CreateAccountRequest("Denied Account", "denied@example.invalid", "denied", "000001", Role.ADMIN)),
                () -> accounts.update(actor, target.id(), new UpdateAccountRequest("Changed Name", target.email(), "changed", "000002")),
                () -> accounts.sendSetPassword(actor, target.id()),
                () -> accounts.setBlocked(actor, target.id(), true),
                () -> accounts.setBlocked(actor, target.id(), false),
                () -> accounts.setBlockedBulk(actor, List.of(target.id()), true),
                () -> accounts.setBlockedBulk(actor, List.of(target.id()), false),
                () -> accounts.changeRole(actor, target.id(), Role.ADMIN),
                () -> accounts.delete(actor, target.id()));
        for (Runnable operation : operations) {
            var failure = assertThrows(AuthRequestException.class, operation::run);
            assertEquals(expected, failure.getCode());
            assertEquals(expected.equals("UNAUTHORIZED") ? 401 : 403, failure.getStatus().value());
            assertEquals(usersBefore, jdbc.queryForList("SELECT * FROM users ORDER BY id"));
            assertEquals(tokensBefore, jdbc.queryForList("SELECT * FROM email_action_tokens ORDER BY id"));
            verifyNoInteractions(email);
        }
        // A denied caller must not learn whether a target account exists.
        assertEquals(expected, assertThrows(AuthRequestException.class,
                () -> accounts.get(actor, UUID.randomUUID())).getCode());
    }

    @Test
    void eligibleAdministratorCanUseEveryAccountHttpOperation() throws Exception {
        active("admin", Role.ADMIN);
        String jwt = login.login(new LoginRequest("admin", "oldpass1")).accessToken();
        String body = """
                {"fullName":"Synthetic Staff","email":"staff@example.invalid","userName":"staff","phoneNumber":"000001","role":"RECEPTIONIST"}
                """;
        mvc.perform(get("/api/users").header("Authorization", "Bearer " + jwt)).andExpect(status().isOk());
        mvc.perform(post("/api/users").header("Authorization", "Bearer " + jwt).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("RECEPTIONIST"));
        UUID id = users.findByEmail("staff@example.invalid").orElseThrow().getId();
        mvc.perform(get("/api/users/" + id).header("Authorization", "Bearer " + jwt)).andExpect(status().isOk());
        mvc.perform(get("/api/users/" + id + "/isblocked").header("Authorization", "Bearer " + jwt))
                .andExpect(status().isOk()).andExpect(content().string("false"));
        mvc.perform(put("/api/users/" + id).header("Authorization", "Bearer " + jwt).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Updated Staff\",\"email\":\"staff@example.invalid\",\"userName\":\"staff\",\"phoneNumber\":\"000002\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.fullName").value("Updated Staff"));
        mvc.perform(post("/api/users/" + id + "/set-password-email").header("Authorization", "Bearer " + jwt)).andExpect(status().isOk());
        mvc.perform(put("/api/users/" + id + "/role").header("Authorization", "Bearer " + jwt).contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"LAB_TECHNICIAN\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.role").value("LAB_TECHNICIAN"));
        mvc.perform(patch("/api/users/" + id + "/block").header("Authorization", "Bearer " + jwt)).andExpect(status().isOk());
        mvc.perform(patch("/api/users/" + id + "/unblock").header("Authorization", "Bearer " + jwt)).andExpect(status().isOk());
        mvc.perform(delete("/api/users/" + id).header("Authorization", "Bearer " + jwt)).andExpect(status().isNoContent());
        assertFalse(users.existsById(id));
        assertEquals(0, tokens.count());
    }

    @ParameterizedTest
    @ValueSource(strings = {"creation", "update"})
    void databaseUsernameCollisionStillTranslatesAndRollsBackWhenAnExternalWriterWins(String operation) {
        var administrator = actor(active("admin", Role.ADMIN).getId());
        var target = active("target", Role.PATIENT);
        var before = jdbc.queryForMap("SELECT * FROM users WHERE id=?", target.getId());
        var externalWriter = new TransactionTemplate(transactions.getTransactionManager());
        externalWriter.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        doAnswer(call -> {
            // A synthetic external writer bypasses service coordination after the precheck.
            externalWriter.execute(status -> users.saveAndFlush(UserAccount.invite("Synthetic Competitor",
                    "competitor@example.invalid", "collision", "000001", Role.PATIENT)));
            return false;
        }).when(users).existsByUserNameIgnoreCase("collision");
        var failure = assertThrows(AuthRequestException.class, () -> {
            if (operation.equals("creation"))
                accounts.create(administrator, new CreateAccountRequest("Synthetic Staff", "staff@example.invalid",
                        "collision", "000001", Role.RECEPTIONIST));
            else
                accounts.update(administrator, target.getId(), new UpdateAccountRequest("Changed Account",
                        target.getEmail(), "collision", "000002"));
        });
        assertEquals("USERNAME_IN_USE", failure.getCode());
        assertEquals(409, failure.getStatus().value());
        assertEquals(before, jdbc.queryForMap("SELECT * FROM users WHERE id=?", target.getId()));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM users WHERE user_name='collision'", Integer.class));
        assertEquals(0, tokens.count());
        verifyNoInteractions(email);
    }
}
