package com.smartlims.auth.security;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.config.ObjectPostProcessor;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfiguration {

    @Bean
    UserDetailsService noUsersUntilLoginIsImplemented() {
        // Suppress Boot's generated user. Account login is handled by LoginService.
        return username -> {
            throw new UsernameNotFoundException("Authentication is unavailable.");
        };
    }

    @Bean
    @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
    SecurityFilterChain securityFilterChain(HttpSecurity http, JsonSecurityErrorHandler errors,
            CookieCsrfTokenRepository csrfRepository, RequestTokenResolver tokenResolver,
            CurrentAccountAuthenticationConverter accountConverter) throws Exception {
        http
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .logout(logout -> logout.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .cors(cors -> {})
                .csrf(csrf -> csrf.csrfTokenRepository(csrfRepository)
                        .csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler())
                        .requireCsrfProtectionMatcher(tokenResolver::requiresCsrf)
                        .withObjectPostProcessor(new ObjectPostProcessor<CsrfFilter>() {
                            @Override
                            public <O extends CsrfFilter> O postProcess(O filter) {
                                // Resource Server adds a CSRF exemption for any resolved token, including
                                // our cookies. Override that composite matcher with the transport policy.
                                filter.setRequireCsrfProtectionMatcher(tokenResolver::requiresCsrf);
                                filter.setAccessDeniedHandler(errors);
                                return filter;
                            }
                        }))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(errors)
                        .accessDeniedHandler(errors))
                .oauth2ResourceServer(oauth -> oauth
                        .bearerTokenResolver(tokenResolver)
                        .authenticationEntryPoint(errors)
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(accountConverter)))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.GET, "/api/auth/csrf-token",
                                "/api/auth/confirm-email").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/me").authenticated()
                        .requestMatchers("/api/users/**", "/api/users").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/auth/register",
                                "/api/auth/login", "/api/auth/cookie-login",
                                "/api/auth/logout", "/api/auth/forgot-password",
                                "/api/auth/reset-password", "/api/auth/set-password").permitAll()
                        .anyRequest().denyAll());
        return http.build();
    }

    @Bean
    CookieCsrfTokenRepository csrfTokenRepository(
            @Value("${smartlims.auth.browser.secure-cookies:true}") boolean secureCookies,
            Environment environment) {
        if (!secureCookies && !environment.acceptsProfiles(Profiles.of("local"))) {
            throw new IllegalStateException("Insecure cookies are allowed only in the local profile");
        }
        CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        repository.setCookieCustomizer(cookie -> cookie.path("/")
                .sameSite(secureCookies ? "None" : "Lax").secure(secureCookies));
        return repository;
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${smartlims.auth.browser.allowed-origins:}") String allowedOrigins) {
        CorsConfiguration configuration = new CorsConfiguration();
        List<String> origins = java.util.Arrays.stream(allowedOrigins.split(","))
                .map(String::strip).filter(origin -> !origin.isEmpty()).toList();
        for (String origin : origins) {
            java.net.URI uri = java.net.URI.create(origin);
            if (origin.contains("*") || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getPath() != null && !uri.getPath().isEmpty()
                    || uri.getQuery() != null || uri.getFragment() != null
                    || !("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
                throw new IllegalStateException("Credentialed CORS requires exact origins");
            }
        }
        if (!origins.isEmpty()) {
            configuration.setAllowedOrigins(origins);
            configuration.setAllowCredentials(true);
            configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
            configuration.setAllowedHeaders(List.of("Content-Type", "X-XSRF-TOKEN", "Authorization"));
        }
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }
}
