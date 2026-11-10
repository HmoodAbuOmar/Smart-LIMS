package com.smartlims.labtests;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import java.nio.file.*;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

/** Explicit opt-in live HTTP verification: -Dtest=CatalogPostmanVerification. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "server.address=127.0.0.1")
class CatalogPostmanVerification extends IsolatedPostgresTest {
    @Value("${local.server.port}")
    int port;
    @Autowired UserAccountRepository users;
    @Autowired PasswordEncoder passwords;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonMapper json;
    @MockitoBean VerificationEmailSender email;
    @TempDir Path temporary;

    @Test
    void runSavedCatalogFlowAgainstGuardedLocalAppWithMemoryOnlySyntheticCredentials() throws Exception {
        assertEquals("smartlims_auth_regression", jdbc.queryForObject("select current_database()", String.class));
        assertEquals(55432, jdbc.queryForObject("select inet_server_port()", Integer.class));
        assertEquals("smartlims-disposable-regression-20261031", jdbc.queryForObject("select current_setting('cluster_name')", String.class));
        String expectedData = System.getenv("SMARTLIMS_TEST_POSTGRES_DATA").replace('\\', '/');
        assertEquals(expectedData.toLowerCase(Locale.ROOT), jdbc.queryForObject("select current_setting('data_directory')", String.class).replace('\\', '/').toLowerCase(Locale.ROOT));
        byte[] random = new byte[32];
        new SecureRandom().nextBytes(random);
        String secret = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
        String hash = passwords.encode(secret);
        Map<String, String> runtime = new LinkedHashMap<>();
        runtime.put("baseUrl", "http://127.0.0.1:" + port);
        runtime.put("catalogDisposableConfirmed", "true");
        runtime.put("fixturePassword", secret);
        var today = LocalDate.now(ZoneId.of("Asia/Jerusalem"));
        runtime.put("rangeToday", today.toString());
        runtime.put("rangeTomorrow", today.plusDays(1).toString());
        String suffix = UUID.randomUUID().toString();
        for (Role role : Role.values()) {
            String identity = "catalog-" + role.name().toLowerCase(Locale.ROOT) + "-" + suffix + "@example.invalid";
            var user = UserAccount.invite("Synthetic catalog runner", identity, null, null, role);
            user.acceptInvitation(hash, Instant.now());
            users.saveAndFlush(user);
            runtime.put("fixture" + switch (role) {
                case ADMIN -> "Admin";
                case PATIENT -> "Patient";
                case RECEPTIONIST -> "Receptionist";
                case LAB_TECHNICIAN -> "Technician";
            } + "Email", identity);
        }
        Path output = temporary.resolve("newman-summary.log");
        var process = new ProcessBuilder("node", "postman/run-catalog.cjs").redirectErrorStream(true).redirectOutput(output.toFile()).start();
        try (var input = process.getOutputStream()) {
            input.write(json.writeValueAsBytes(runtime));
        }
        if (!process.waitFor(180, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            fail("Catalog Newman flow timed out.");
        }
        System.out.println(Files.readString(output));
        assertEquals(0, process.exitValue(), "See sanitized Newman summary; no credentials or tokens are persisted.");
    }
}
