package com.smartlims.auth;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.dto.*;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.*;
import com.smartlims.auth.repository.*;
import com.smartlims.auth.service.*;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class UserListingTest extends IsolatedPostgresTest {
    @Autowired UserAccountRepository users;
    @Autowired AccountManagementService accounts;
    @Autowired LoginService login;
    @Autowired PasswordEncoder passwords;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @MockitoBean VerificationEmailSender email;
    UserAccount admin;
    Authentication actor;
    String hash;

    @BeforeEach
    void fixtures() {
        jdbc.execute("TRUNCATE TABLE reference_ranges,patient_notifications,laboratory_events,result_specimens,result_values,test_results,specimen_attestations,samples,visit_items,visits,test_parameters,appointment_reschedules,appointments,appointment_slots,appointment_types,order_items,test_orders,patient_link_tokens,patients,email_action_tokens,users");
        hash = passwords.encode("testpass1");
        admin = active("Administrator", "admin", Role.ADMIN);
        actor = new UsernamePasswordAuthenticationToken(admin.getId().toString(), null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
    }

    UserAccount active(String name, String identity, Role role) {
        var user = UserAccount.invite(name, identity + "@example.invalid", identity, "000001", role);
        user.acceptInvitation(hash, Instant.now());
        return users.saveAndFlush(user);
    }

    UserPageResponse page(String... pairs) {
        Map<String, List<String>> values = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) values.put(pairs[i], List.of(pairs[i + 1]));
        return accounts.page(actor, values);
    }

    @Test
    void additiveHttpPageAndLegacyArrayRemainDistinct() throws Exception {
        for (int i = 0; i < 8; i++) active("Synthetic " + i, "person" + i, Role.PATIENT);
        String token = login.login(new LoginRequest("admin", "testpass1")).accessToken();
        mvc.perform(get("/api/users/page").param("size", "7").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content.length()").value(7))
                .andExpect(jsonPath("$.content[0].id").exists()).andExpect(jsonPath("$.content[0].fullName").exists())
                .andExpect(jsonPath("$.content[0].email").exists()).andExpect(jsonPath("$.content[0].role").exists())
                .andExpect(jsonPath("$.content[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.totalElements").value(9)).andExpect(jsonPath("$.totalPages").value(2));
        mvc.perform(get("/api/users").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(9))
                .andExpect(jsonPath("$[0].blocked").exists()).andExpect(jsonPath("$[0].status").doesNotExist());
        assertEquals(2, page("page", "1", "size", "7").content().size());
        var huge = page("page", "2147483647", "size", "100");
        assertTrue(huge.content().isEmpty()); assertEquals(9, huge.totalElements()); assertTrue(huge.last());
    }

    @Test
    void searchIsCaseInsensitiveLiteralAndFiltersCombine() {
        active("Special %_\\ Person", "literal", Role.RECEPTIONIST);
        active("Other Person", "needle", Role.PATIENT);
        assertEquals(1, page("search", "  SPECIAL %_\\  ").totalElements());
        assertEquals(1, page("search", "NEEDLE@EXAMPLE.INVALID", "role", "PATIENT", "status", "ACTIVE").totalElements());
        assertEquals(0, page("search", "needle", "role", "RECEPTIONIST").totalElements());
    }

    @Test
    void creationBoundsUseOffsetsInclusiveFromExclusiveToAndNoImplicitDefault() {
        var first = active("First", "first", Role.PATIENT);
        var second = active("Second", "second", Role.PATIENT);
        jdbc.update("UPDATE users SET created_at=?::timestamptz WHERE id=?", "2026-10-01T10:00:00Z", first.getId());
        jdbc.update("UPDATE users SET created_at=?::timestamptz WHERE id=?", "2026-10-31T10:00:00Z", second.getId());
        var result = page("role", "PATIENT", "createdFrom", "2026-10-01T12:00:00+02:00", "createdTo", "2026-10-31T05:00:00-05:00");
        assertEquals(List.of(first.getId()), result.content().stream().map(UserListRow::id).toList());
        assertEquals(2, page("role", "PATIENT").totalElements());
        assertEquals(1, page("role", "PATIENT", "createdFrom", "2026-10-31T10:00:00Z").totalElements());
    }

    @Test
    void lifecycleStatusPrecedenceIgnoresResetProofAndTemporaryLockout() {
        var invited = users.saveAndFlush(UserAccount.invite("Invited", "invited@example.invalid", "invited", "000001", Role.PATIENT));
        var publicUser = users.saveAndFlush(UserAccount.registerPatient("Public", "public@example.invalid", hash));
        var firstAdmin = UserAccount.invite("First Invitation", "first@example.invalid", "first", "000001", Role.ADMIN);
        firstAdmin.markFirstAdministratorInvitation();
        users.saveAndFlush(firstAdmin);
        var accepted = active("Accepted", "accepted", Role.PATIENT);
        jdbc.update("UPDATE users SET locked_until=CURRENT_TIMESTAMP + interval '1 hour',reset_code_hash='synthetic' WHERE id=?", accepted.getId());
        assertEquals(Set.of(invited.getId(), firstAdmin.getId()), new HashSet<>(page("status", "INVITED").content().stream().map(UserListRow::id).toList()));
        assertEquals(List.of(publicUser.getId()), page("status", "PENDING_VERIFICATION").content().stream().map(UserListRow::id).toList());
        assertEquals(2, page("status", "ACTIVE").totalElements());
        jdbc.update("UPDATE users SET enabled=false WHERE id=?", invited.getId());
        assertEquals(List.of(invited.getId()), page("status", "BLOCKED").content().stream().map(UserListRow::id).toList());
        assertEquals(1, page("status", "INVITED").totalElements());
    }

    @ParameterizedTest
    @ValueSource(strings = {"fullName,asc", "fullName,desc", "role,asc", "role,desc", "status,asc", "status,desc", "lastLoginAt,asc", "lastLoginAt,desc"})
    void sortingHasStableIdTieBreakAndNullLastInBothDirections(String sort) {
        var a = active("Same Name", "same1", Role.PATIENT);
        var b = active("same name", "same2", Role.PATIENT);
        var nullLogin = active("Same Name", "same3", Role.PATIENT);
        for (var user : List.of(a, b)) jdbc.update("UPDATE users SET last_login_at='2026-10-01T00:00:00Z' WHERE id=?", user.getId());
        var ids = page("role", "PATIENT", "sort", sort).content().stream().map(UserListRow::id).toList();
        var expected = new ArrayList<>(List.of(a.getId(), b.getId(), nullLogin.getId()));
        expected.sort(Comparator.comparing(UUID::toString));
        if (sort.startsWith("lastLoginAt")) { expected.remove(nullLogin.getId()); expected.add(nullLogin.getId()); }
        assertEquals(expected, ids);
    }

    @Test
    void sortOrdersDifferentValuesAndStatusProjectionMatchesFilter() {
        active("Zulu", "zulu", Role.RECEPTIONIST);
        var invited = users.saveAndFlush(UserAccount.invite("Alpha", "alpha@example.invalid", "alpha", "000001", Role.LAB_TECHNICIAN));
        var rows = page("sort", "fullName,desc").content();
        assertEquals("Zulu", rows.getFirst().fullName());
        assertEquals(List.of("Zulu", "Alpha", "Administrator"), rows.stream().map(UserListRow::fullName).toList());
        assertEquals(List.of(Role.ADMIN, Role.LAB_TECHNICIAN, Role.RECEPTIONIST), page("sort", "role,asc").content().stream().map(UserListRow::role).toList());
        assertEquals(AccountStatus.INVITED, page("sort", "status,desc").content().getFirst().status());
    }

    @ParameterizedTest
    @ValueSource(strings = {"asc", "desc"})
    void lastLoginSortOrdersDifferentInstantsBeforeNull(String direction) {
        var old = active("Old Login", "old", Role.PATIENT);
        var recent = active("Recent Login", "recent", Role.PATIENT);
        var never = active("Never Login", "never", Role.PATIENT);
        jdbc.update("UPDATE users SET last_login_at='2026-10-01T00:00:00Z' WHERE id=?", old.getId());
        jdbc.update("UPDATE users SET last_login_at='2026-10-02T00:00:00Z' WHERE id=?", recent.getId());
        var expected = direction.equals("asc") ? List.of(old.getId(), recent.getId(), never.getId()) : List.of(recent.getId(), old.getId(), never.getId());
        assertEquals(expected, page("role", "PATIENT", "sort", "lastLoginAt," + direction).content().stream().map(UserListRow::id).toList());
    }

    @ParameterizedTest
    @ValueSource(strings = {"page=-1", "page=2147483648", "size=0", "size=101", "role=invalid", "status=LOCKED", "sort=email,asc", "sort=fullName,up", "createdFrom=2026-10-01", "createdTo=2026-10-01T12:00:00", "unknown=x"})
    void invalidQueryHasStableFieldError(String pair) {
        var parts = pair.split("=", 2);
        var error = assertThrows(AuthRequestException.class, () -> page(parts));
        assertEquals(400, error.getStatus().value()); assertEquals("VALIDATION_ERROR", error.getCode()); assertEquals(parts[0], error.getField());
    }

    @Test
    void repeatedParametersLongSearchAndNonIncreasingDatesAreRejected() {
        assertEquals("search", assertThrows(AuthRequestException.class, () -> accounts.page(actor, Map.of("search", List.of("a", "b")))).getField());
        assertEquals("search", assertThrows(AuthRequestException.class, () -> page("search", "x".repeat(121))).getField());
        for (String to : List.of("2026-10-01T00:00:00Z", "2026-09-01T00:00:00Z"))
            assertEquals("createdTo", assertThrows(AuthRequestException.class, () -> page("createdFrom", "2026-10-01T00:00:00Z", "createdTo", to)).getField());
    }

    @Test
    void bothLoginModesRecordOnlySuccessfulAuthentication() throws Exception {
        var user = active("Login Target", "target", Role.PATIENT);
        assertNull(users.findById(user.getId()).orElseThrow().getLastLoginAt());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"emailOrUserName\":\"target\",\"password\":\"wrong\"}"))
                .andExpect(status().isBadRequest());
        assertNull(users.findById(user.getId()).orElseThrow().getLastLoginAt());
        Instant before = Instant.now().minusSeconds(1);
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"emailOrUserName\":\"target\",\"password\":\"testpass1\"}"))
                .andExpect(status().isOk());
        Instant first = users.findById(user.getId()).orElseThrow().getLastLoginAt();
        assertTrue(first.isAfter(before));
        String access = login.login(new LoginRequest("target", "testpass1")).accessToken();
        first = users.findById(user.getId()).orElseThrow().getLastLoginAt();
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + access)).andExpect(status().isOk());
        assertEquals(first, users.findById(user.getId()).orElseThrow().getLastLoginAt());
        Cookie csrf = mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        mvc.perform(post("/api/auth/cookie-login").cookie(csrf).header("X-XSRF-TOKEN", csrf.getValue())
                .contentType(MediaType.APPLICATION_JSON).content("{\"emailOrUserName\":\"target\",\"password\":\"testpass1\"}"))
                .andExpect(status().isOk());
        Instant second = users.findById(user.getId()).orElseThrow().getLastLoginAt();
        assertFalse(second.isBefore(first));
        for (String change : List.of("enabled=false", "locked_until=CURRENT_TIMESTAMP + interval '1 hour'", "email_verified_at=NULL")) {
            jdbc.update("UPDATE users SET enabled=true,locked_until=NULL,email_verified_at=CURRENT_TIMESTAMP WHERE id=?", user.getId());
            jdbc.update("UPDATE users SET " + change + " WHERE id=?", user.getId());
            assertThrows(AuthRequestException.class, () -> login.login(new LoginRequest("target", "testpass1")));
            assertEquals(second, users.findById(user.getId()).orElseThrow().getLastLoginAt());
        }
    }

    @Test
    void pageRequiresPersistedEligibleAdministratorBeforeQueryValidation() throws Exception {
        assertEquals("UNAUTHORIZED", assertThrows(AuthRequestException.class, () -> accounts.page(null, Map.of("unknown", List.of("x")))).getCode());
        jdbc.update("UPDATE users SET role='PATIENT' WHERE id=?", admin.getId());
        assertEquals("FORBIDDEN", assertThrows(AuthRequestException.class, () -> page()).getCode());
        mvc.perform(get("/api/users/page")).andExpect(status().isUnauthorized());
        String token = login.login(new LoginRequest("admin", "testpass1")).accessToken();
        mvc.perform(get("/api/users/page").header("Authorization", "Bearer " + token)).andExpect(status().isForbidden());
    }
}
