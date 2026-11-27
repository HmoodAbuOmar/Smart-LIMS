package com.smartlims.appointments.service;

import com.smartlims.appointments.dto.*;
import com.smartlims.appointments.entity.*;
import com.smartlims.appointments.exception.AppointmentException;
import com.smartlims.appointments.repository.AppointmentRepository;
import com.smartlims.auth.entity.Role;
import com.smartlims.orders.entity.OrderItem;
import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.orders.repository.OrderItemRepository;
import com.smartlims.patients.repository.PatientRepository;
import com.smartlims.visits.repository.VisitRepository;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiFunction;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
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
    private final OrderItemRepository items;
    private final VisitRepository visits;

    public AppointmentReadService(AppointmentAccess access, PatientRepository patients, AppointmentRepository appointments,
                                  OrderItemRepository items, VisitRepository visits) {
        this.access = access;
        this.patients = patients;
        this.appointments = appointments;
        this.items = items;
        this.visits = visits;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AppointmentResponses.Today today(Authentication actor, Map<String, List<String>> query) {
        access.current(actor, Role.ADMIN, Role.RECEPTIONIST);
        query.forEach((key, values) -> {
            if ((!key.equals("tab") && !key.equals("date")) || values.size() != 1)
                throw AppointmentException.invalid(key);
        });
        String tab = query.getOrDefault("tab", List.of("arrivals")).getFirst();
        AppointmentStatus status = switch (tab) {
            case "arrivals" -> null;
            case "checkedIn" -> AppointmentStatus.CHECKED_IN;
            case "notArrived" -> AppointmentStatus.CONFIRMED;
            default -> throw AppointmentException.invalid("tab");
        };
        var zone = AppointmentMapping.LAB_ZONE;
        var now = Instant.now();
        var date = query.containsKey("date") ? scheduledDate(query.get("date").getFirst()) : now.atZone(zone).toLocalDate();
        var day = appointments.findScheduledDay(date.atStartOfDay(zone).toInstant(),
                date.plusDays(1).atStartOfDay(zone).toInstant());
        var counts = new AppointmentResponses.TodayCounts(day.size(),
                day.stream().filter(a -> a.getStatus() == AppointmentStatus.CHECKED_IN).count(),
                day.stream().filter(a -> a.getStatus() == AppointmentStatus.CONFIRMED).count());
        var selected = day.stream().filter(a -> status == null || a.getStatus() == status).toList();
        return new AppointmentResponses.Today(date, zone.getId(), counts, staffRows(selected, now, (a, row) -> row));
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public AppointmentResponses.ReceptionistList listReceptionist(Authentication actor, AppointmentQuery query) {
        access.current(actor, Role.RECEPTIONIST);
        var zone = AppointmentMapping.LAB_ZONE;
        var now = Instant.now();
        var today = now.atZone(zone).toLocalDate();
        var dateValue = query.get("date", null);
        var date = dateValue == null ? today : scheduledDate(dateValue);
        var status = listStatus(query.get("status", "ALL"));
        var term = query.get("search", "").strip().toLowerCase(Locale.ROOT);
        if (term.length() > 100)
            throw AppointmentException.invalid("search");
        var descending = switch (query.get("sort", "startsAt,asc")) {
            case "startsAt,asc" -> false;
            case "startsAt,desc" -> true;
            default -> throw AppointmentException.invalid("sort");
        };

        var day = appointments.findScheduledDay(date.atStartOfDay(zone).toInstant(),
                date.plusDays(1).atStartOfDay(zone).toInstant());
        var occupancy = day.stream()
                .filter(a -> a.getStatus() == AppointmentStatus.CONFIRMED || a.getStatus() == AppointmentStatus.CHECKED_IN)
                .collect(Collectors.groupingBy(a -> a.getSlot().getId(), Collectors.counting()));
        Comparator<Appointment> descendingStart = Comparator.comparing(
                (Appointment a) -> a.getSlot().getStartsAt(), Comparator.reverseOrder());
        var matches = day.stream()
                .filter(a -> (status == null || a.getStatus() == status) && matchesSearch(a, term));
        if (descending)
            matches = matches.sorted(descendingStart); // Keep repository ID order for equal start times.
        var filtered = matches.toList();
        var page = PageRequest.of(query.page(), query.size());
        int first = (int) Math.min(page.getOffset(), filtered.size());
        var selected = filtered.subList(first, first + Math.min(query.size(), filtered.size() - first));
        var rows = staffRows(selected, now, (a, row) -> {
            var slot = a.getSlot();
            var order = a.getOrder();
            boolean cancel = order != null && a.getStatus() == AppointmentStatus.CONFIRMED && slot.getStartsAt().isAfter(now);
            return new AppointmentResponses.ReceptionistAppointment(row.id(), slot.getId(), row.startsAt(), row.endsAt(),
                    row.appointmentDate(), row.appointmentTime(), occupancy.getOrDefault(slot.getId(), 0L), slot.getCapacity(),
                    row.patient(), row.orderId(), row.orderNumber(), row.orderItemIds(), row.status(), row.version(),
                    row.arrivedAt(), row.checkInEligible(),
                    cancel && order.getStatus() == OrderStatus.PENDING, cancel);
        });
        var result = AppointmentMapping.page(new PageImpl<>(rows, page, filtered.size()), row -> row);
        return new AppointmentResponses.ReceptionistList(date, zone.getId(), result.content(), result.page(),
                result.size(), result.totalElements(), result.totalPages(), result.first(), result.last());
    }

    private static AppointmentStatus listStatus(String value) {
        return switch (value.toUpperCase(Locale.ROOT)) {
            case "ALL" -> null;
            case "BOOKED", "CONFIRMED" -> AppointmentStatus.CONFIRMED;
            case "CHECKED_IN" -> AppointmentStatus.CHECKED_IN;
            case "COMPLETED" -> AppointmentStatus.COMPLETED;
            case "CANCELLED" -> AppointmentStatus.CANCELLED;
            case "NO_SHOW" -> AppointmentStatus.NO_SHOW;
            default -> throw AppointmentException.invalid("status");
        };
    }

    private static boolean matchesSearch(Appointment a, String term) {
        if (term.isEmpty())
            return true;
        var order = a.getOrder();
        if (order == null)
            return false;
        var patient = order.getPatient();
        return contains(order.getOrderNumber(), term) || (patient != null &&
                (contains(patient.getFullName(), term) || contains(patient.getPatientNumber(), term)));
    }

    private static boolean contains(String value, String term) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(term);
    }

    private <T> List<T> staffRows(List<Appointment> selected, Instant now,
                                  BiFunction<Appointment, AppointmentResponses.TodayAppointment, T> mapping) {
        if (selected.isEmpty())
            return List.of();
        var orderIds = selected.stream().filter(a -> a.getOrder() != null).map(a -> a.getOrder().getId()).distinct().toList();
        Map<UUID, List<UUID>> itemIds = orderIds.isEmpty() ? Map.of() : items.findByOrder_IdInOrderById(orderIds).stream()
                .collect(Collectors.groupingBy(i -> i.getOrder().getId(), Collectors.mapping(OrderItem::getId, Collectors.toList())));
        var visited = visits.visitedAppointments(selected.stream().map(Appointment::getId).toList());
        return selected.stream().map(a -> {
            var order = a.getOrder();
            var patient = order == null ? null : order.getPatient();
            var patientSummary = patient == null ? null : new AppointmentResponses.TodayPatient(
                    patient.getId(), patient.getPatientNumber(), patient.getFullName());
            var orderId = order == null ? null : order.getId();
            var orderItems = orderId == null ? List.<UUID>of() : itemIds.getOrDefault(orderId, List.of());
            var slot = a.getSlot();
            var local = slot.getStartsAt().atZone(AppointmentMapping.LAB_ZONE);
            boolean booked = a.getStatus() == AppointmentStatus.CONFIRMED;
            boolean openAppointment = booked && a.getCheckedInAt() == null && order != null && !visited.contains(a.getId());
            boolean checkIn = openAppointment && patient != null && !orderItems.isEmpty() && orderItems.size() <= 100
                    && AppointmentMapping.isScheduledDate(a, now)
                    && (order.getStatus() == OrderStatus.PENDING || order.getStatus() == OrderStatus.IN_PROGRESS);
            var row = new AppointmentResponses.TodayAppointment(a.getId(), slot.getStartsAt(), slot.getEndsAt(),
                    local.toLocalDate(), local.toLocalTime(), patientSummary, orderId,
                    order == null ? null : order.getOrderNumber(), orderItems, booked ? "BOOKED" : a.getStatus().name(),
                    a.getVersion(), a.getCheckedInAt(), checkIn, openAppointment);
            return mapping.apply(a, row);
        }).toList();
    }

    private LocalDate scheduledDate(String value) {
        if (value == null || !value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}") || value.startsWith("0000"))
            throw AppointmentException.invalid("date");
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException ex) {
            throw AppointmentException.invalid("date");
        }
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
