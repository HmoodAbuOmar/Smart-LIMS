package com.smartlims.auth.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.junit.jupiter.api.Assertions.*;

class BrowserSecurityTest {
    @Test
    void cookieIssuingAndClearingUseCompatibleFlags() {
        for (boolean secure : new boolean[] {true, false}) {
            var factory = new AccessCookieFactory(secure, 60);
            var environment = new MockEnvironment().withProperty("spring.profiles.active", "local");
            environment.setActiveProfiles("local");
            var repository = new SecurityConfiguration().csrfTokenRepository(secure, environment);
            var request = new MockHttpServletRequest();
            var response = new MockHttpServletResponse();
            var token = repository.generateToken(request);
            repository.saveToken(token, request, response);
            var csrf = response.getCookie("XSRF-TOKEN");
            assertNotNull(csrf);
            assertFalse(csrf.isHttpOnly());
            assertEquals(secure, csrf.getSecure());
            assertEquals(secure ? "None" : "Lax", csrf.getAttribute("SameSite"));
            for (var cookie : new org.springframework.http.ResponseCookie[] {factory.issued("test"), factory.cleared()}) {
                assertTrue(cookie.isHttpOnly());
                assertEquals(secure, cookie.isSecure());
                assertEquals(secure ? "None" : "Lax", cookie.getSameSite());
                assertEquals("/", cookie.getPath());
            }
            var clear = new MockHttpServletResponse();
            repository.saveToken(null, request, clear);
            assertEquals(0, clear.getCookie("XSRF-TOKEN").getMaxAge());
            assertEquals(secure ? "None" : "Lax", clear.getCookie("XSRF-TOKEN").getAttribute("SameSite"));
        }
        assertThrows(IllegalStateException.class,
                () -> new SecurityConfiguration().csrfTokenRepository(false, new MockEnvironment()));
    }

    @Test
    void corsRejectsWildcardsAndEmptyConfigurationAllowsNoOrigins() {
        var configuration = new SecurityConfiguration();
        assertThrows(IllegalStateException.class, () -> configuration.corsConfigurationSource("https://*.example.invalid"));
        assertNull(configuration.corsConfigurationSource("")
                .getCorsConfiguration(new MockHttpServletRequest("GET", "/api/users")).getAllowedOrigins());
    }
}
