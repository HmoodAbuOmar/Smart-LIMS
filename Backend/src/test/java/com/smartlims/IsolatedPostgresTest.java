package com.smartlims;

import java.security.SecureRandom;
import java.util.Base64;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
@ActiveProfiles("local")
@EnabledIfEnvironmentVariable(named = "SMARTLIMS_TEST_DATABASE_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/smartlims_auth_regression")
public abstract class IsolatedPostgresTest {
    @DynamicPropertySource
    static void isolatedProperties(DynamicPropertyRegistry properties) {
        String url = System.getenv("SMARTLIMS_TEST_DATABASE_URL");
        if (url == null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/smartlims_auth_regression")) {
            throw new IllegalStateException("An explicitly isolated regression database is required.");
        }
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.username", () -> "postgres");
        properties.add("spring.datasource.password", () -> "");
        properties.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        properties.add("smartlims.auth.jwt.secret-base64", () -> Base64.getEncoder().encodeToString(key));
        properties.add("smartlims.auth.browser.secure-cookies", () -> false);
        properties.add("smartlims.auth.browser.allowed-origins", () -> "http://localhost:5173");
        properties.add("spring.mail.host", () -> "");
        properties.add("logging.level.org.hibernate.engine.jdbc.spi.SqlExceptionHelper", () -> "OFF");
    }
}
