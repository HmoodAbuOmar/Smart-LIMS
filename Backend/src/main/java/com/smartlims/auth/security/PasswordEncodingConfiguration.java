package com.smartlims.auth.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class PasswordEncodingConfiguration {

    @Bean
    PasswordEncoder passwordEncoder(
            @Value("${smartlims.auth.password.argon2.salt-length}") int saltLength,
            @Value("${smartlims.auth.password.argon2.hash-length}") int hashLength,
            @Value("${smartlims.auth.password.argon2.parallelism}") int parallelism,
            @Value("${smartlims.auth.password.argon2.memory-kib}") int memoryKib,
            @Value("${smartlims.auth.password.argon2.iterations}") int iterations) {
        // Argon2's encoded value records its algorithm version and cost parameters.
        return new Argon2PasswordEncoder(saltLength, hashLength, parallelism, memoryKib, iterations);
    }
}
