package com.smartlims.auth.service;

import com.smartlims.auth.dto.AccountResponse;
import com.smartlims.auth.dto.CreateAccountRequest;
import com.smartlims.auth.dto.UpdateAccountRequest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.entity.EmailActionPurpose;
import com.smartlims.auth.entity.EmailActionToken;
import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.EmailActionTokenRepository;
import com.smartlims.auth.repository.UserAccountRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountManagementService {
    private final UserAccountRepository users;
    private final EmailActionTokenRepository tokens;
    private final VerificationTokens values;
    private final VerificationEmailSender email;
    private final EmailIdentity identities;
    private final PasswordPolicy policy;
    private final PasswordEncoder passwords;
    private final UserNames userNames;
    private final AdministratorCoordination administrators;

    public AccountManagementService(UserAccountRepository users, EmailActionTokenRepository tokens,
            VerificationTokens values, VerificationEmailSender email, EmailIdentity identities,
            PasswordPolicy policy, PasswordEncoder passwords, UserNames userNames,
            AdministratorCoordination administrators) {
        this.users = users;
        this.tokens = tokens;
        this.values = values;
        this.email = email;
        this.identities = identities;
        this.policy = policy;
        this.passwords = passwords;
        this.userNames = userNames;
        this.administrators = administrators;
    }

    @Transactional
    public AccountResponse create(CreateAccountRequest request) {
        administrators.lock();
        String canonical = identities.canonicalize(request.email());
        String name = userNames.normalize(request.userName());
        if (users.existsByEmail(canonical)) {
            throw new AuthRequestException(HttpStatus.CONFLICT, "EMAIL_IN_USE", "Email already exists.", "email");
        }
        if (users.existsByUserNameIgnoreCase(name)) throw UserNames.conflict();
        UserAccount user;
        try {
            user = users.saveAndFlush(UserAccount.invite(request.fullName().strip(), canonical,
                    name, request.phoneNumber().strip(), request.role()));
        } catch (DataIntegrityViolationException error) {
            throw AccountConstraintErrors.translate(error);
        }
        String token = values.create();
        tokens.saveAndFlush(EmailActionToken.invitation(user, values.hash(token), Instant.now().plusSeconds(86400)));
        email.sendSetPassword(canonical, user.getId(), token);
        return AccountResponse.from(user);
    }

    @Transactional
    public void provisionFirstAdministrator(CreateAccountRequest request) {
        administrators.lock();
        if (users.existsByRole(Role.ADMIN)) {
            throw new AuthRequestException(HttpStatus.CONFLICT, "ADMIN_ALREADY_EXISTS",
                    "An administrator already exists; provisioning refused.", null);
        }
        AccountResponse created = create(new CreateAccountRequest(request.fullName(), request.email(),
                request.userName(), request.phoneNumber(), Role.ADMIN));
        locked(created.id()).markFirstAdministratorInvitation();
    }

    @Transactional
    public void sendSetPassword(UUID id) {
        UserAccount user = locked(id);
        if (!user.isEnabled()) throw new AuthRequestException(HttpStatus.FORBIDDEN,
                "ACCOUNT_BLOCKED", "Your account is blocked.", null);
        tokens.deleteByUserAndPurpose(user, EmailActionPurpose.ACCEPT_INVITATION);
        String token = values.create();
        tokens.saveAndFlush(EmailActionToken.invitation(user, values.hash(token), Instant.now().plusSeconds(86400)));
        email.sendSetPassword(user.getEmail(), user.getId(), token);
    }

    @Transactional
    public void setPassword(UUID userId, String rawToken, String newPassword) {
        policy.validate(newPassword, "newPassword");
        UserAccount user = locked(userId);
        EmailActionToken token = tokens.findByTokenHashAndPurpose(values.hash(rawToken),
                EmailActionPurpose.ACCEPT_INVITATION).orElseThrow(this::invalidInvite);
        if (!token.getUser().getId().equals(userId) || !user.isEnabled() || tokens.consumeIfValid(token.getId(),
                EmailActionPurpose.ACCEPT_INVITATION, Instant.now()) != 1) throw invalidInvite();
        if (user.getPasswordHash() != null && passwords.matches(newPassword, user.getPasswordHash())) {
            throw new AuthRequestException(HttpStatus.BAD_REQUEST, "SAME_PASSWORD",
                    "New password must be different from the old password.", "newPassword");
        }
        if (user.getInvitationAcceptedAt() == null) user.acceptInvitation(passwords.encode(newPassword), Instant.now());
        else user.changePassword(passwords.encode(newPassword));
        email.sendPasswordChanged(user.getEmail());
    }

    @Transactional(readOnly = true)
    public List<AccountResponse> all() {
        return users.findAll(Sort.by("userName")).stream().map(AccountResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public AccountResponse get(UUID id) { return AccountResponse.from(users.findById(id).orElseThrow(this::missing)); }

    @Transactional
    public AccountResponse update(UUID id, UpdateAccountRequest request) {
        UserAccount user = locked(id);
        String canonical = identities.canonicalize(request.email());
        if (!canonical.equals(identities.canonicalize(user.getEmail()))) {
            throw new AuthRequestException(HttpStatus.BAD_REQUEST, "EMAIL_CHANGE_NOT_ALLOWED",
                    "Changing the email address is not supported.", "email");
        }
        String name = userNames.normalize(request.userName());
        if (!name.equalsIgnoreCase(user.getUserName()) && users.existsByUserNameIgnoreCase(name)) {
            throw UserNames.conflict();
        }
        user.setProfile(request.fullName().strip(), canonical, name,
                request.phoneNumber().strip());
        try {
            users.flush();
        } catch (DataIntegrityViolationException error) {
            throw AccountConstraintErrors.translate(error);
        }
        return AccountResponse.from(user);
    }

    @Transactional
    public AccountResponse setBlocked(UUID actor, UUID id, boolean blocked) {
        administrators.lock();
        UserAccount user = locked(id);
        if (blocked && actor.equals(id)) throw protectedAdmin();
        guardLastAdmin(user, blocked || user.getRole() != Role.ADMIN);
        user.setEnabled(!blocked);
        return AccountResponse.from(user);
    }

    @Transactional
    public AccountResponse changeRole(UUID actor, UUID id, Role role) {
        administrators.lock();
        UserAccount user = locked(id);
        if (actor.equals(id) && user.getRole() != role) throw protectedAdmin();
        if (user.getRole() == role) return AccountResponse.from(user);
        guardLastAdmin(user, true);
        user.setRole(role);
        email.sendRoleChanged(user.getEmail(), role.name());
        return AccountResponse.from(user);
    }

    @Transactional
    public void delete(UUID actor, UUID id) {
        administrators.lock();
        UserAccount user = locked(id);
        if (actor.equals(id)) throw protectedAdmin();
        guardLastAdmin(user, true);
        users.delete(user);
    }

    private void guardLastAdmin(UserAccount user, boolean removing) {
        if (removing && user.getRole() == Role.ADMIN && user.isEnabled()
                && user.getEmailVerifiedAt() != null
                && users.countByRoleAndEnabledTrueAndEmailVerifiedAtIsNotNull(Role.ADMIN) <= 1) throw protectedAdmin();
    }

    private UserAccount locked(UUID id) { return users.findWithLockById(id).orElseThrow(this::missing); }
    private AuthRequestException missing() {
        return new AuthRequestException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "User not found.", null);
    }
    private AuthRequestException invalidInvite() {
        return new AuthRequestException(HttpStatus.BAD_REQUEST, "INVALID_INVITATION",
                "Set-password link is invalid or expired.", null);
    }
    private AuthRequestException protectedAdmin() {
        return new AuthRequestException(HttpStatus.BAD_REQUEST, "LAST_ADMIN",
                "This administrator account cannot be changed.", null);
    }
}
