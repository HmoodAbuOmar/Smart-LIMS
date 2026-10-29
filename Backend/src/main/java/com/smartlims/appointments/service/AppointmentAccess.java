package com.smartlims.appointments.service;

import com.smartlims.auth.entity.*;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.auth.security.LoginEligibility;
import com.smartlims.appointments.exception.AppointmentException;
import com.smartlims.orders.entity.TestOrder;
import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

@Component
public class AppointmentAccess {
    private final UserAccountRepository users;
    public AppointmentAccess(UserAccountRepository users) { this.users=users; }
    public UserAccount current(Authentication actor, Role... allowed) {
        if (actor==null || !actor.isAuthenticated()) throw AppointmentException.unauthorized();
        if (Arrays.stream(allowed).noneMatch(r -> actor.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_"+r)))) throw AppointmentException.forbidden();
        UUID id;
        try { id=UUID.fromString(actor.getName()); } catch (IllegalArgumentException | NullPointerException e) { throw AppointmentException.unauthorized(); }
        var user=users.findById(id).orElseThrow(AppointmentException::unauthorized);
        if (!LoginEligibility.eligible(user)) throw AppointmentException.unauthorized();
        if (!Arrays.asList(allowed).contains(user.getRole())) throw AppointmentException.forbidden();
        return user;
    }
    public void own(UserAccount actor, TestOrder order, String missingKind) {
        if (actor.getRole()==Role.PATIENT && (order.getPatient().getUser()==null || !order.getPatient().getUser().getId().equals(actor.getId()))) throw AppointmentException.missing(missingKind);
    }
}
