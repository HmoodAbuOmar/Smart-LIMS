package com.smartlims.appointments.service;

import com.smartlims.appointments.dto.*;
import com.smartlims.appointments.entity.*;
import com.smartlims.appointments.exception.AppointmentException;
import com.smartlims.appointments.repository.AppointmentRepository;
import com.smartlims.auth.entity.Role;
import com.smartlims.patients.repository.PatientRepository;

import java.time.Instant;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class AppointmentReadService {
    private final AppointmentAccess access;
    private final PatientRepository patients;
    private final AppointmentRepository appointments;

    public AppointmentReadService(AppointmentAccess access, PatientRepository patients, AppointmentRepository appointments) {
        this.access = access;
        this.patients = patients;
        this.appointments = appointments;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AppointmentResponses.Detail getMe(Authentication actor, String id) {
        var key = AppointmentQuery.uuid(id, "id");
        var account = access.current(actor, Role.PATIENT);
        return AppointmentMapping.detail(appointments.findByIdAndOrder_Patient_User_Id(key, account.getId()).orElseThrow(() -> AppointmentException.missing("APPOINTMENT")), Instant.now());
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AppointmentResponses.Page<AppointmentResponses.Detail> listMe(Authentication actor, AppointmentQuery query) {
        String tab = query.get("tab", "UPCOMING");
        if (!tab.equals("UPCOMING") && !tab.equals("PAST"))
            throw AppointmentException.invalid("tab");
        var account = access.current(actor, Role.PATIENT);
        if (!patients.existsByUser_Id(account.getId()))
            throw AppointmentException.notLinked();
        var now = Instant.now();
        boolean upcoming = tab.equals("UPCOMING");
        Specification<Appointment> filter = (r, q, c) -> {
            var future = c.and(c.equal(r.get("status"), AppointmentStatus.CONFIRMED), c.greaterThan(r.get("slot").get("startsAt"), now));
            return c.and(c.equal(r.get("order").get("patient").get("user").get("id"), account.getId()), upcoming ? future : c.not(future));
        };
        var sort = Sort.by(upcoming ? Sort.Direction.ASC : Sort.Direction.DESC, "slot.startsAt").and(Sort.by("id"));
        return AppointmentMapping.page(AppointmentPages.find(appointments, filter, query, sort), a -> AppointmentMapping.detail(a, now));
    }
}
