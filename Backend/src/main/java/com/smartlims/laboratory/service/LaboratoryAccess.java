package com.smartlims.laboratory.service;

import com.smartlims.auth.entity.*;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.LoginEligibility;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.orders.entity.TestOrder;

import java.util.*;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

@Component
public class LaboratoryAccess {
    private final UserAccountRepository users;
    private final Set<UUID> reviewers;

    public LaboratoryAccess(UserAccountRepository users, @Value("${smartlims.laboratory.authorized-admin-ids:}") String reviewers) {
        this.users = users;
        var ids = new HashSet<UUID>();
        for (var id : reviewers.split(",")) {
            if (!id.isBlank())
                ids.add(LaboratoryInput.uuid(id.strip(), "smartlims.laboratory.authorized-admin-ids"));
        }
        this.reviewers = Set.copyOf(ids);
    }

    public UserAccount current(Authentication actor, Role... roles) {
        if (actor == null || !actor.isAuthenticated())
            throw LaboratoryException.unauthorized();
        if (Arrays.stream(roles).noneMatch(r -> actor.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_" + r))))
            throw LaboratoryException.forbidden();
        UUID id;
        try {
            id = UUID.fromString(actor.getName());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw LaboratoryException.unauthorized();
        }
        var user = users.findById(id).orElseThrow(LaboratoryException::unauthorized);
        if (!LoginEligibility.eligible(user))
            throw LaboratoryException.unauthorized();
        if (!Arrays.asList(roles).contains(user.getRole()))
            throw LaboratoryException.forbidden();
        return user;
    }

    public UserAccount clinical(Authentication actor) {
        var user = current(actor, Role.LAB_TECHNICIAN, Role.ADMIN);
        if (user.getRole() == Role.ADMIN && !reviewers.contains(user.getId()))
            throw LaboratoryException.forbidden();
        return user;
    }

    public UserAccount reviewer(Authentication actor) {
        var user = current(actor, Role.ADMIN);
        if (!reviewers.contains(user.getId()))
            throw LaboratoryException.forbidden();
        return user;
    }

    public void own(UserAccount user, TestOrder order, String resource) {
        if (user.getRole() == Role.PATIENT && (order.getPatient().getUser() == null || !order.getPatient().getUser().getId().equals(user.getId())))
            throw LaboratoryException.missing(resource);
    }
}
