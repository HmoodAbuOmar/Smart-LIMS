package com.smartlims.auth;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.dto.*;
import com.smartlims.auth.email.*;
import com.smartlims.auth.entity.*;
import com.smartlims.auth.repository.*;
import com.smartlims.auth.service.*;
import com.smartlims.patients.dto.CreatePatientRequest;
import com.smartlims.patients.entity.PatientGender;
import com.smartlims.patients.service.PatientService;
import java.time.*;
import java.util.*;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class UserActionsTest extends IsolatedPostgresTest {
    @Autowired UserAccountRepository users;
    @Autowired AccountManagementService accounts;
    @Autowired LoginService login;
    @Autowired PasswordRecoveryService recovery;
    @Autowired PasswordEncoder passwords;
    @Autowired PatientService patients;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @MockitoBean VerificationEmailSender email;
    final AtomicReference<String> invitation = new AtomicReference<>();
    UserAccount admin;
    Authentication actor;
    String hash;

    @BeforeEach
    void fixtures() {
        jdbc.execute("TRUNCATE TABLE reference_ranges,patient_notifications,laboratory_events,result_specimens,result_values,test_results,specimen_attestations,samples,visit_items,visits,test_parameters,appointment_reschedules,appointments,appointment_slots,appointment_types,order_items,test_orders,patient_link_tokens,patients,email_action_tokens,users");
        reset(email);
        doAnswer(call -> { invitation.set(call.getArgument(2)); return null; }).when(email).sendSetPassword(anyString(), any(UUID.class), anyString());
        hash = passwords.encode("testpass1");
        admin = active("admin", Role.ADMIN);
        actor = actor(admin.getId());
    }

    Authentication actor(UUID id) {
        return new UsernamePasswordAuthenticationToken(id.toString(), null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
    }

    UserAccount active(String identity, Role role) {
        var user = UserAccount.invite("Synthetic " + identity, identity + "@example.invalid", identity, "000001", role);
        user.acceptInvitation(hash, Instant.now());
        return users.saveAndFlush(user);
    }

    AccountResponse invite(String name, Role role) {
        return accounts.create(actor, new CreateAccountRequest("Synthetic " + name, name + "@example.invalid", name, "000001", role));
    }

    AuthRequestException error(String code, Runnable call) {
        var failure = assertThrows(AuthRequestException.class, call::run);
        assertEquals(code, failure.getCode()); return failure;
    }

    @Test
    void editRetainsAbsentOptionalFieldsWithoutChangingPatientDemographics() throws Exception {
        var user = users.saveAndFlush(UserAccount.registerPatient("Account Name", "public@example.invalid", hash));
        jdbc.update("UPDATE users SET email_verified_at=CURRENT_TIMESTAMP WHERE id=?", user.getId());
        patients.createMe(new UsernamePasswordAuthenticationToken(user.getId().toString(), null, List.of(new SimpleGrantedAuthority("ROLE_PATIENT"))),
                new CreatePatientRequest("Patient Name", LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000001", null));
        String token = login.login(new LoginRequest("admin", "testpass1")).accessToken();
        mvc.perform(put("/api/users/" + user.getId()).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Updated Account\",\"email\":\" PUBLIC@EXAMPLE.INVALID \"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.fullName").value("Updated Account"))
                .andExpect(jsonPath("$.userName").isEmpty()).andExpect(jsonPath("$.phoneNumber").isEmpty());
        assertNull(users.findById(user.getId()).orElseThrow().getUserName());
        assertEquals("Patient Name", jdbc.queryForObject("SELECT full_name FROM patients WHERE user_id=?", String.class, user.getId()));
        var staff = active("staff", Role.RECEPTIONIST);
        var edited = accounts.update(actor, staff.getId(), new UpdateAccountRequest("Changed Staff", staff.getEmail(), null, null));
        assertEquals("staff", edited.userName()); assertEquals("000001", edited.phoneNumber());
        error("EMAIL_CHANGE_NOT_ALLOWED", () -> accounts.update(actor, user.getId(), new UpdateAccountRequest("Updated Account", "changed@example.invalid", null, null)));
        mvc.perform(put("/api/users/" + user.getId()).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Updated Account\",\"email\":\"public@example.invalid\",\"userName\":\" \",\"phoneNumber\":\"\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/users/" + user.getId()).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Updated Account\",\"email\":\"public@example.invalid\",\"phoneNumber\":\"   \"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.phoneNumber").exists());
    }

    @Test
    void linkedPatientRoleChangeConflictsAndSameRoleIsNoOp() throws Exception {
        var user = active("patient", Role.PATIENT);
        patients.createMe(new UsernamePasswordAuthenticationToken(user.getId().toString(), null, List.of(new SimpleGrantedAuthority("ROLE_PATIENT"))),
                new CreatePatientRequest("Patient Name", LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000001", null));
        var before = jdbc.queryForList("SELECT * FROM patients");
        clearInvocations(email);
        for (Role role : List.of(Role.ADMIN, Role.RECEPTIONIST, Role.LAB_TECHNICIAN))
            assertEquals(409, error("PATIENT_ACCOUNT_LINKED", () -> accounts.changeRole(actor, user.getId(), role)).getStatus().value());
        assertEquals(Role.PATIENT, accounts.changeRole(actor, user.getId(), Role.PATIENT).role());
        assertEquals(before, jdbc.queryForList("SELECT * FROM patients"));
        verifyNoInteractions(email);
        String token = login.login(new LoginRequest("admin", "testpass1")).accessToken();
        mvc.perform(put("/api/users/" + user.getId() + "/role").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"ADMIN\"}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PATIENT_ACCOUNT_LINKED"));
        assertEquals(Role.RECEPTIONIST, accounts.changeRole(actor, active("unlinked", Role.PATIENT).getId(), Role.RECEPTIONIST).role());
    }

    @ParameterizedTest
    @ValueSource(strings = {"patient-link", "patient-creator", "audit-actor"})
    void deletionConflictPreservesRetainedRowsAndActionTokens(String reference) throws Exception {
        var target = invite("retained", Role.PATIENT);
        if (reference.equals("audit-actor")) {
            UUID patient = UUID.randomUUID(), order = UUID.randomUUID(), visit = UUID.randomUUID();
            jdbc.update("INSERT INTO patients(id,patient_number,full_name,date_of_birth,gender,phone_number,created_by) VALUES (?,'PAT-SYNTHETIC','Synthetic history profile','2000-01-01','UNKNOWN','000001',?)", patient, admin.getId());
            jdbc.update("INSERT INTO test_orders(id,order_number,patient_id,created_by,idempotency_key,request_hash) VALUES (?,'ORD-000001',?,?,?,repeat('a',64))", order, patient, admin.getId(), UUID.randomUUID());
            jdbc.update("INSERT INTO visits(id,visit_number,order_id,status,arrived_at,created_by,idempotency_key,request_hash) VALUES (?,'VIS-SYNTHETIC',?,'OPEN',CURRENT_TIMESTAMP,?,?,repeat('a',64))", visit, order, admin.getId(), UUID.randomUUID());
            jdbc.update("INSERT INTO laboratory_events(id,visit_id,kind,actor_id,actor_name_snapshot,occurred_at,recorded_at) VALUES (?,?,'SYNTHETIC',?,'Synthetic retained actor',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", UUID.randomUUID(), visit, target.id());
        } else {
            jdbc.update("INSERT INTO patients(id,patient_number,user_id,full_name,date_of_birth,gender,phone_number,created_by) VALUES (?,'PAT-SYNTHETIC',?,'Synthetic retained profile','2000-01-01','UNKNOWN','000001',?)",
                    UUID.randomUUID(), reference.equals("patient-link") ? target.id() : null, reference.equals("patient-creator") ? target.id() : admin.getId());
        }
        var tokenRows = jdbc.queryForList("SELECT * FROM email_action_tokens");
        var patientRows = jdbc.queryForList("SELECT * FROM patients");
        var eventRows = jdbc.queryForList("SELECT * FROM laboratory_events");
        String token = login.login(new LoginRequest("admin", "testpass1")).accessToken();
        mvc.perform(delete("/api/users/" + target.id()).header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("USER_HAS_RETAINED_REFERENCES"));
        assertTrue(users.existsById(target.id()));
        assertEquals(tokenRows, jdbc.queryForList("SELECT * FROM email_action_tokens"));
        assertEquals(patientRows, jdbc.queryForList("SELECT * FROM patients"));
        assertEquals(eventRows, jdbc.queryForList("SELECT * FROM laboratory_events"));
    }

    @Test
    void eligibleDeletionCascadesOnlyItsOwnEmailTokens() {
        var target = invite("deletable", Role.PATIENT);
        var other = invite("other", Role.RECEPTIONIST);
        accounts.delete(actor, target.id());
        assertFalse(users.existsById(target.id())); assertTrue(users.existsById(other.id()));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM email_action_tokens", Integer.class));
    }

    @Test
    void invitationExpiryReissueAcceptanceResetAndFailureLifecycle() {
        var target = invite("invited", Role.RECEPTIONIST);
        String original = invitation.get();
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM patients", Integer.class));
        jdbc.update("UPDATE email_action_tokens SET expires_at=CURRENT_TIMESTAMP - interval '1 second' WHERE user_id=?", target.id());
        assertEquals(AccountStatus.INVITED, AccountStatus.from(users.findById(target.id()).orElseThrow()));
        error("INVALID_INVITATION", () -> accounts.setPassword(target.id(), original, "newpass1"));
        accounts.sendSetPassword(actor, target.id());
        String replacement = invitation.get(); assertNotEquals(original, replacement);
        error("INVALID_INVITATION", () -> accounts.setPassword(target.id(), original, "newpass1"));
        error("INVALID_INVITATION", () -> accounts.setPassword(admin.getId(), replacement, "newpass1"));
        accounts.setBlocked(actor, target.id(), true);
        error("ACCOUNT_BLOCKED", () -> accounts.sendSetPassword(actor, target.id()));
        error("INVALID_INVITATION", () -> accounts.setPassword(target.id(), replacement, "newpass1"));
        accounts.setBlocked(actor, target.id(), false);
        doThrow(new MailDeliveryException()).when(email).sendPasswordChanged(anyString());
        assertThrows(MailDeliveryException.class, () -> accounts.setPassword(target.id(), replacement, "newpass1"));
        assertNull(users.findById(target.id()).orElseThrow().getPasswordHash());
        assertNull(jdbc.queryForObject("SELECT consumed_at FROM email_action_tokens WHERE user_id=?", Object.class, target.id()));
        doNothing().when(email).sendPasswordChanged(anyString());
        accounts.setPassword(target.id(), replacement, "newpass1");
        error("INVALID_INVITATION", () -> accounts.setPassword(target.id(), replacement, "another1"));
        assertEquals(AccountStatus.ACTIVE, AccountStatus.from(users.findById(target.id()).orElseThrow()));
        recovery.forgot(target.email());
        accounts.sendSetPassword(actor, target.id());
        assertEquals(AccountStatus.ACTIVE, AccountStatus.from(users.findById(target.id()).orElseThrow()));
        String resetProof = invitation.get();
        error("SAME_PASSWORD", () -> accounts.setPassword(target.id(), resetProof, "newpass1"));
        accounts.setPassword(target.id(), resetProof, "another1");
        assertEquals(AccountStatus.ACTIVE, AccountStatus.from(users.findById(target.id()).orElseThrow()));
    }

    @Test
    void invitationCreateAndReissueMailFailuresRollBack() {
        doThrow(new MailDeliveryException()).when(email).sendSetPassword(anyString(), any(UUID.class), anyString());
        assertThrows(MailDeliveryException.class, () -> invite("failed", Role.ADMIN));
        assertFalse(users.existsByEmail("failed@example.invalid"));
        doAnswer(call -> { invitation.set(call.getArgument(2)); return null; }).when(email).sendSetPassword(anyString(), any(UUID.class), anyString());
        var target = invite("target", Role.PATIENT);
        var before = jdbc.queryForList("SELECT * FROM email_action_tokens");
        doThrow(new MailDeliveryException()).when(email).sendSetPassword(anyString(), any(UUID.class), anyString());
        assertThrows(MailDeliveryException.class, () -> accounts.sendSetPassword(actor, target.id()));
        assertEquals(before, jdbc.queryForList("SELECT * FROM email_action_tokens"));
    }

    @Test
    void bulkIsExplicitAtomicOrderedAndIdempotent() throws Exception {
        var a = active("first", Role.PATIENT); var b = active("second", Role.RECEPTIONIST); var untouched = active("untouched", Role.LAB_TECHNICIAN);
        var ids = List.of(b.getId(), a.getId());
        assertEquals(ids, accounts.setBlockedBulk(actor, ids, true).stream().map(AccountResponse::id).toList());
        var before = jdbc.queryForList("SELECT * FROM users ORDER BY id");
        accounts.setBlockedBulk(actor, ids, true);
        assertEquals(before, jdbc.queryForList("SELECT * FROM users ORDER BY id"));
        assertTrue(users.findById(untouched.getId()).orElseThrow().isEnabled());
        String token = login.login(new LoginRequest("admin", "testpass1")).accessToken();
        mvc.perform(patch("/api/users/bulk/unblock").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"ids\":[\"" + b.getId() + "\",\"" + a.getId() + "\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(b.getId().toString())).andExpect(jsonPath("$[1].blocked").value(false));
        before = jdbc.queryForList("SELECT * FROM users ORDER BY id");
        accounts.setBlockedBulk(actor, ids, false);
        assertEquals(before, jdbc.queryForList("SELECT * FROM users ORDER BY id"));
    }

    @Test
    void invalidMissingAndProtectedBatchHasNoPartialChanges() {
        var target = active("target", Role.PATIENT);
        var before = jdbc.queryForList("SELECT * FROM users ORDER BY id");
        for (List<UUID> ids : List.of(List.<UUID>of(), List.of(target.getId(), target.getId()), Arrays.asList(target.getId(), null), Collections.nCopies(101, target.getId())))
            error("VALIDATION_ERROR", () -> accounts.setBlockedBulk(actor, ids, true));
        error("VALIDATION_ERROR", () -> accounts.setBlockedBulk(actor, null, true));
        error("USER_NOT_FOUND", () -> accounts.setBlockedBulk(actor, List.of(target.getId(), UUID.randomUUID()), true));
        error("LAST_ADMIN", () -> accounts.setBlockedBulk(actor, List.of(target.getId(), admin.getId()), true));
        assertEquals(before, jdbc.queryForList("SELECT * FROM users ORDER BY id"));
    }

    @Test
    void maximumHundredTargetsIsSupported() {
        var ids = new ArrayList<UUID>();
        for (int i = 0; i < 100; i++) ids.add(active("target" + i, Role.PATIENT).getId());
        assertEquals(100, accounts.setBlockedBulk(actor, ids, true).size());
        assertEquals(100, jdbc.queryForObject("SELECT count(*) FROM users WHERE NOT enabled", Integer.class));
    }

    @Test
    void bulkDatabaseFailureRollsBackTheWholeTransaction() {
        var a = active("first", Role.PATIENT); var b = active("second", Role.RECEPTIONIST);
        var before = jdbc.queryForList("SELECT * FROM users ORDER BY id");
        jdbc.execute("CREATE FUNCTION synthetic_users_bulk_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NOT NEW.enabled AND NEW.id='" + b.getId() + "'::uuid THEN RAISE EXCEPTION 'Synthetic batch failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$");
        try {
            jdbc.execute("CREATE TRIGGER synthetic_users_bulk_failure BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION synthetic_users_bulk_failure()");
            assertThrows(RuntimeException.class, () -> accounts.setBlockedBulk(actor, List.of(a.getId(), b.getId()), true));
            assertEquals(before, jdbc.queryForList("SELECT * FROM users ORDER BY id"));
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS synthetic_users_bulk_failure ON users");
            jdbc.execute("DROP FUNCTION synthetic_users_bulk_failure()");
        }
    }

    @Test
    void bulkHttpValidationAndCookieCsrfProtectTheBatch() throws Exception {
        var target = active("target", Role.PATIENT);
        String token = login.login(new LoginRequest("admin", "testpass1")).accessToken();
        for (String body : List.of("{}", "{\"ids\":[]}", "{\"ids\":[null]}",
                "{\"ids\":[\"" + target.getId() + "\",\"" + target.getId() + "\"]}"))
            mvc.perform(patch("/api/users/bulk/block").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mvc.perform(patch("/api/users/bulk/block").cookie(new jakarta.servlet.http.Cookie("access_token", token))
                .contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[\"" + target.getId() + "\"]}"))
                .andExpect(status().isForbidden());
        assertTrue(users.findById(target.getId()).orElseThrow().isEnabled());
    }

    @Test
    void concurrentProfileCreationAndRoleChangeCannotCreateAnInvalidLink() throws Exception {
        var target = active("patient", Role.PATIENT);
        var patientActor = new UsernamePasswordAuthenticationToken(target.getId().toString(), null, List.of(new SimpleGrantedAuthority("ROLE_PATIENT")));
        var results = together(() -> outcome(() -> accounts.changeRole(actor, target.getId(), Role.RECEPTIONIST)), () -> {
            try {
                patients.createMe(patientActor, new CreatePatientRequest("Patient Name", LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000001", null));
                return "ok";
            } catch (com.smartlims.patients.exception.PatientForbiddenException error) { return "FORBIDDEN"; }
        });
        assertEquals(1, results.stream().filter("ok"::equals).count());
        var current = users.findById(target.getId()).orElseThrow();
        boolean linked = users.hasLinkedPatient(target.getId());
        assertEquals(linked ? Role.PATIENT : Role.RECEPTIONIST, current.getRole());
        assertTrue(results.contains(linked ? "PATIENT_ACCOUNT_LINKED" : "FORBIDDEN"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing", "blocked", "demoted", "unverified", "passwordless", "unaccepted", "forged-authority", "missing-authority", "RECEPTIONIST", "LAB_TECHNICIAN"})
    void newOperationsRequireCurrentPersistedAdministratorWithoutSideEffects(String state) throws Exception {
        var target = active("target", Role.PATIENT);
        var caller = active("caller", Role.ADMIN);
        var callerActor = actor(caller.getId());
        String token = login.login(new LoginRequest("caller", "testpass1")).accessToken();
        switch (state) {
            case "missing" -> users.deleteById(caller.getId());
            case "blocked" -> jdbc.update("UPDATE users SET enabled=false WHERE id=?", caller.getId());
            case "demoted", "forged-authority" -> jdbc.update("UPDATE users SET role='PATIENT' WHERE id=?", caller.getId());
            case "unverified" -> jdbc.update("UPDATE users SET email_verified_at=NULL WHERE id=?", caller.getId());
            case "passwordless" -> jdbc.update("UPDATE users SET password_hash=NULL WHERE id=?", caller.getId());
            case "unaccepted" -> jdbc.update("UPDATE users SET invitation_accepted_at=NULL WHERE id=?", caller.getId());
            case "missing-authority" -> callerActor = new UsernamePasswordAuthenticationToken(caller.getId().toString(), null, List.of(new SimpleGrantedAuthority("ROLE_PATIENT")));
            case "RECEPTIONIST", "LAB_TECHNICIAN" -> jdbc.update("UPDATE users SET role=? WHERE id=?", state, caller.getId());
        }
        Authentication denied = callerActor;
        var before = jdbc.queryForList("SELECT * FROM users ORDER BY id");
        clearInvocations(email);
        String code = Set.of("demoted", "forged-authority", "missing-authority", "RECEPTIONIST", "LAB_TECHNICIAN").contains(state) ? "FORBIDDEN" : "UNAUTHORIZED";
        error(code, () -> accounts.page(denied, Map.of()));
        error(code, () -> accounts.setBlockedBulk(denied, List.of(target.getId()), true));
        error(code, () -> accounts.setBlockedBulk(denied, List.of(target.getId()), false));
        assertEquals(before, jdbc.queryForList("SELECT * FROM users ORDER BY id")); verifyNoInteractions(email);
        if (!state.equals("missing-authority")) {
            int status = code.equals("FORBIDDEN") ? 403 : 401;
            mvc.perform(get("/api/users/page").header("Authorization", "Bearer " + token)).andExpect(status().is(status));
            mvc.perform(patch("/api/users/bulk/block").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"ids\":[\"" + target.getId() + "\"]}")).andExpect(status().is(status));
        }
    }

    @Test
    void bulkAndIndividualConcurrentRevocationRetainAnAdministrator() throws Exception {
        var second = active("second", Role.ADMIN);
        var target = active("target", Role.PATIENT);
        List<String> outcomes = together(() -> outcome(() -> accounts.setBlockedBulk(actor, List.of(second.getId(), target.getId()), true)),
                () -> outcome(() -> accounts.setBlocked(actor(second.getId()), admin.getId(), true)));
        assertEquals(1, outcomes.stream().filter("ok"::equals).count());
        assertEquals(1, outcomes.stream().filter("UNAUTHORIZED"::equals).count());
        assertEquals(1, users.countByRoleAndEnabledTrueAndEmailVerifiedAtIsNotNull(Role.ADMIN));
        boolean bulkWon = outcomes.getFirst().equals("ok");
        assertEquals(!bulkWon, users.findById(target.getId()).orElseThrow().isEnabled());
    }

    @Test
    void overlappingBulkRequestsSerializeWithoutDeadlock() throws Exception {
        var a = active("first", Role.PATIENT); var b = active("second", Role.PATIENT);
        assertEquals(List.of("ok", "ok"), together(
                () -> outcome(() -> accounts.setBlockedBulk(actor, List.of(a.getId(), b.getId()), true)),
                () -> outcome(() -> accounts.setBlockedBulk(actor, List.of(b.getId(), a.getId()), true))));
        assertFalse(users.findById(a.getId()).orElseThrow().isEnabled()); assertFalse(users.findById(b.getId()).orElseThrow().isEnabled());
    }

    String outcome(Runnable operation) { try { operation.run(); return "ok"; } catch (AuthRequestException error) { return error.getCode(); } }

    List<String> together(Supplier<String> a, Supplier<String> b) throws Exception {
        var ready = new CountDownLatch(2); var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var futures = new ArrayList<Future<String>>();
            for (var action : List.of(a, b)) futures.add(pool.submit(() -> { ready.countDown(); start.await(); return action.get(); }));
            assertTrue(ready.await(5, TimeUnit.SECONDS)); start.countDown();
            return List.of(futures.get(0).get(20, TimeUnit.SECONDS), futures.get(1).get(20, TimeUnit.SECONDS));
        }
    }
}
