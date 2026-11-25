package com.smartlims.auth.security;

import com.smartlims.auth.controller.AuthController;
import com.smartlims.auth.dto.LoginRequest;
import com.smartlims.auth.service.LoginService;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AuthCookieResponseTest {
    @Test
    void loginRotatesCsrfAndLogoutClearsBothCookiesOnSeparateHeaders() throws Exception {
        var repository = new SecurityConfiguration().csrfTokenRepository(true, new MockEnvironment());
        var request = new MockHttpServletRequest();
        var response = new MockHttpServletResponse();
        repository.saveToken(repository.generateToken(request), request, response);
        var before = response.getCookie("XSRF-TOKEN");
        var login = mock(LoginService.class);
        when(login.login(any(LoginRequest.class))).thenReturn(
                new LoginService.IssuedLogin("synthetic-access-token", Instant.now().plusSeconds(3600), null));
        var mvc = MockMvcBuilders.standaloneSetup(new AuthController(null, login, null, null, null,
                new AccessCookieFactory(true, 60), repository)).build();

        var signedIn = mvc.perform(post("/api/auth/cookie-login").secure(true).cookie(before)
                        .header("X-XSRF-TOKEN", before.getValue()).contentType("application/json")
                        .content("{\"emailOrUserName\":\"synthetic\",\"password\":\"synthetic-password\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.success").value(true)).andReturn().getResponse();
        var access = assertCookie(signedIn, "access_token", true);
        var after = assertCookie(signedIn, "XSRF-TOKEN", false);
        assertNotEquals(before.getValue(), after.getValue());
        assertFalse(after.getValue().isBlank());

        var signedOut = mvc.perform(post("/api/auth/logout").secure(true).cookie(access, after)
                        .header("X-XSRF-TOKEN", after.getValue()))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.success").value(true)).andReturn().getResponse();
        assertEquals(0, assertCookie(signedOut, "access_token", true).getMaxAge());
        assertEquals(0, assertCookie(signedOut, "XSRF-TOKEN", false).getMaxAge());
    }

    @Test
    void bearerLoginKeepsTokenBodyAndBearerWritesKeepTheirCsrfExemption() throws Exception {
        var login = mock(LoginService.class);
        when(login.login(any(LoginRequest.class))).thenReturn(
                new LoginService.IssuedLogin("synthetic-bearer", Instant.now().plusSeconds(3600), null));
        var mvc = MockMvcBuilders.standaloneSetup(new AuthController(null, login, null, null, null, null, null)).build();
        mvc.perform(post("/api/auth/login").contentType("application/json")
                        .content("{\"emailOrUserName\":\"synthetic\",\"password\":\"synthetic-password\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.token").value("synthetic-bearer"))
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));

        var resolver = new RequestTokenResolver();
        var bearer = new MockHttpServletRequest("POST", "/api/patients");
        bearer.addHeader("Authorization", "Bearer synthetic-bearer");
        bearer.setCookies(new Cookie("access_token", "different-cookie"));
        assertEquals("synthetic-bearer", resolver.resolve(bearer));
        assertFalse(resolver.requiresCsrf(bearer));
        bearer.setRequestURI("/api/auth/cookie-login");
        assertTrue(resolver.requiresCsrf(bearer));
    }

    private static Cookie assertCookie(MockHttpServletResponse response, String name, boolean httpOnly) {
        var headers = response.getHeaders(HttpHeaders.SET_COOKIE);
        assertEquals(2, headers.size());
        assertEquals(1, headers.stream().filter(value -> value.startsWith(name + "=")).count());
        var cookie = response.getCookie(name);
        assertNotNull(cookie);
        assertEquals(httpOnly, cookie.isHttpOnly());
        assertTrue(cookie.getSecure());
        assertEquals("None", cookie.getAttribute("SameSite"));
        assertEquals("/", cookie.getPath());
        return cookie;
    }
}
