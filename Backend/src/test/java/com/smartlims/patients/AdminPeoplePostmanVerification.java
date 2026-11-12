package com.smartlims.patients;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.*;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.JwtKeyConfiguration;
import com.smartlims.patients.entity.*;
import com.smartlims.patients.repository.PatientRepository;
import java.nio.file.*;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Opt-in live verification after focused regression tests; synthetic data and fake email only. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "server.address=127.0.0.1")
class AdminPeoplePostmanVerification extends IsolatedPostgresTest {
    @Value("${local.server.port}") int port;
    @Autowired UserAccountRepository users;
    @Autowired PatientRepository patients;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwords;
    @Autowired JwtEncoder encoder;
    @Autowired JsonMapper json;
    @MockitoBean VerificationEmailSender email;
    @TempDir Path temporary;

    @Test
    void runCanonicalPatientThenUserRequestsOnGuardedDisposableApp() throws Exception {
        assertEquals("smartlims_auth_regression", jdbc.queryForObject("SELECT current_database()", String.class));
        assertEquals(55432, jdbc.queryForObject("SELECT inet_server_port()", Integer.class));
        assertEquals("smartlims-disposable-regression-20261031", jdbc.queryForObject("SELECT current_setting('cluster_name')", String.class));
        assertEquals(System.getenv("SMARTLIMS_TEST_POSTGRES_DATA").replace('\\', '/').toLowerCase(Locale.ROOT),
                jdbc.queryForObject("SELECT current_setting('data_directory')", String.class).replace('\\', '/').toLowerCase(Locale.ROOT));
        jdbc.execute("TRUNCATE TABLE audit_logs,reference_ranges,patient_notifications,laboratory_events,result_specimens,result_values,test_results,specimen_attestations,samples,visit_items,visits,test_parameters,appointment_reschedules,appointments,appointment_slots,appointment_types,order_items,test_orders,lab_test_categories,lab_tests,patient_link_tokens,patients,email_action_tokens,users");
        var runtime = new LinkedHashMap<String, String>();
        runtime.put("baseUrl", "http://127.0.0.1:" + port); runtime.put("disposableConfirmed", "true");
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        byte[] random = new byte[32]; new SecureRandom().nextBytes(random);
        String loginPassword = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
        var accounts = new EnumMap<Role, UserAccount>(Role.class);
        for (Role role : Role.values()) {
            String label = switch (role) { case ADMIN -> "Admin"; case PATIENT -> "Patient"; case RECEPTIONIST -> "Receptionist"; case LAB_TECHNICIAN -> "Technician"; };
            var user = UserAccount.invite("Synthetic " + label, "people-" + label.toLowerCase(Locale.ROOT) + "-" + suffix + "@example.invalid", "people_" + label + "_" + suffix, "000001", role);
            user.acceptInvitation(role == Role.PATIENT ? passwords.encode(loginPassword) : "synthetic-unused-hash", Instant.now());
            user = users.saveAndFlush(user); accounts.put(role, user);
            String tokenKey = switch (role) { case ADMIN -> "adminToken"; case PATIENT -> "patientToken"; case RECEPTIONIST -> "receptionistToken"; case LAB_TECHNICIAN -> "labTechnicianToken"; };
            runtime.put(tokenKey, token(user));
        }
        var patientAccount = accounts.get(Role.PATIENT);
        var blocked = UserAccount.invite("Synthetic Blocked", "people-blocked-" + suffix + "@example.invalid", "blocked_" + suffix, "000001", Role.PATIENT);
        blocked.acceptInvitation("synthetic-unused-hash", Instant.now()); blocked.setEnabled(false); blocked = users.saveAndFlush(blocked);
        users.saveAndFlush(UserAccount.invite("Synthetic Invited", "people-invited-" + suffix + "@example.invalid", "invited_" + suffix, "000001", Role.PATIENT));
        users.saveAndFlush(UserAccount.registerPatient("Synthetic Pending", "people-pending-" + suffix + "@example.invalid", "synthetic-unused-hash"));
        jdbc.update("UPDATE users SET created_at=? WHERE id=?", Timestamp.from(Instant.parse("2026-10-01T10:00:00Z")), patientAccount.getId());
        jdbc.update("UPDATE users SET created_at=? WHERE id=?", Timestamp.from(Instant.parse("2026-10-31T10:00:00Z")), blocked.getId());
        jdbc.update("UPDATE users SET last_login_at='2026-10-01T00:00:00Z' WHERE id=?", accounts.get(Role.RECEPTIONIST).getId());
        jdbc.update("UPDATE users SET last_login_at='2026-10-02T00:00:00Z' WHERE id=?", accounts.get(Role.LAB_TECHNICIAN).getId());
        var linked = profile(accounts.get(Role.ADMIN), "Synthetic linked profile", "000101", patientAccount);
        var unlinked = profile(accounts.get(Role.ADMIN), "Synthetic walk-in profile", "000102", null);
        profile(accounts.get(Role.ADMIN), "Literal %_\\ profile", "000103", null);
        runtime.put("patientId", linked.getId().toString()); runtime.put("patientNumber", linked.getPatientNumber());
        runtime.put("unlinkedPatientId", unlinked.getId().toString()); runtime.put("unlinkedPatientNumber", unlinked.getPatientNumber());
        runtime.put("loginEmail", patientAccount.getEmail()); runtime.put("loginPassword", loginPassword);
        runtime.put("inviteFullName", "Synthetic New Invitation"); runtime.put("inviteEmail", "people-new-" + suffix + "@example.invalid");
        runtime.put("inviteUserName", "people_new_" + suffix); runtime.put("invitePhoneNumber", "000010"); runtime.put("inviteRole", "LAB_TECHNICIAN");
        Path log = temporary.resolve("newman.log");
        var process = new ProcessBuilder("node", "postman/run-people.cjs").redirectErrorStream(true).redirectOutput(log.toFile()).start();
        try (var input = process.getOutputStream()) { input.write(json.writeValueAsBytes(runtime)); }
        if (!process.waitFor(180, TimeUnit.SECONDS)) { process.destroyForcibly(); fail("People Postman verification timed out"); }
        System.out.println(Files.readString(log));
        assertEquals(0, process.exitValue(), "See sanitized postman/people-run-summary.json");
        assertEquals(patientAccount.getId(), jdbc.queryForObject("SELECT user_id FROM patients WHERE id=?", UUID.class, linked.getId()));
        assertEquals(linked.getPatientNumber(), jdbc.queryForObject("SELECT patient_number FROM patients WHERE id=?", String.class, linked.getId()));
        assertNotNull(users.findById(patientAccount.getId()).orElseThrow().getLastLoginAt());
        verify(email, times(1)).sendSetPassword(eq(runtime.get("inviteEmail")), any(UUID.class), anyString());
        assertEquals(4, patients.count()); // Three fixtures plus one HTTP create; user invitation creates no profile.
    }

    private Patient profile(UserAccount admin, String name, String phone, UserAccount linked) {
        var p = new Patient("PAT-" + patients.nextPatientNumber(), admin, name, LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, phone, null);
        if (linked != null) p.linkAccount(linked);
        return patients.saveAndFlush(p);
    }

    private String token(UserAccount account) {
        var now = Instant.now();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder().subject(account.getId().toString()).issuer(JwtKeyConfiguration.ISSUER)
                        .audience(List.of(JwtKeyConfiguration.AUDIENCE)).issuedAt(now).expiresAt(now.plusSeconds(600)).build())).getTokenValue();
    }
}
