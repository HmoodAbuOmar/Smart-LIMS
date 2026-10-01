package com.smartlims.auth.security;

import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class CurrentAccountAuthenticationConverter implements Converter<Jwt, JwtAuthenticationToken> {
    private final UserAccountRepository users;
    public CurrentAccountAuthenticationConverter(UserAccountRepository users) { this.users = users; }

    @Override
    @Transactional(readOnly = true)
    public JwtAuthenticationToken convert(Jwt jwt) {
        UUID id;
        try { id = UUID.fromString(jwt.getSubject()); }
        catch (RuntimeException error) { throw new BadCredentialsException("Invalid access token"); }
        UserAccount user = users.findById(id).orElseThrow(() -> new BadCredentialsException("Invalid access token"));
        if (!LoginEligibility.eligible(user)) throw new BadCredentialsException("Invalid access token");
        return new JwtAuthenticationToken(jwt,
                List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name())), id.toString());
    }
}
