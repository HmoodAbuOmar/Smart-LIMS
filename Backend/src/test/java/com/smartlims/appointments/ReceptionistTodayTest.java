package com.smartlims.appointments;

import com.smartlims.appointments.dto.AppointmentQuery;
import com.smartlims.appointments.dto.AppointmentResponses;
import com.smartlims.appointments.entity.Appointment;
import com.smartlims.appointments.entity.AppointmentSlot;
import com.smartlims.appointments.entity.AppointmentStatus;
import com.smartlims.appointments.repository.AppointmentRepository;
import com.smartlims.appointments.service.AppointmentAccess;
import com.smartlims.appointments.service.AppointmentMapping;
import com.smartlims.appointments.service.AppointmentReadService;
import com.smartlims.auth.entity.Role;
import com.smartlims.orders.dto.OrderDetailResponse;
import com.smartlims.orders.repository.OrderItemRepository;
import com.smartlims.patients.repository.PatientRepository;
import com.smartlims.visits.dto.VisitRequests;
import com.smartlims.visits.service.VisitService;
import com.smartlims.visits.repository.VisitRepository;
import com.smartlims.laboratory.exception.LaboratoryException;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import static org.junit.jupiter.api.Assertions.*;
import static org.hamcrest.Matchers.contains;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ReceptionistTodayTest extends AppointmentTestSupport {
    private static final String TODAY = "/api/appointments/today";
    private static final String LIST = "/api/receptionist/appointments";
    @Autowired
    VisitService visits;

    @Test
    void listsPersistedAppointmentsWithStablePagesAndUnfilteredSlotOccupancy() throws Exception {
        var zone = AppointmentMapping.LAB_ZONE;
        var date = zone.getRules().nextTransition(Instant.parse("2030-01-01T00:00:00Z"))
                .getDateTimeAfter().toLocalDate();
        var start = date.atStartOfDay(zone).toInstant();
        var end = date.plusDays(1).atStartOfDay(zone).toInstant();
        var shared = slot(0, 2);
        var order = create(own, first, free);
        var booked = book(order, shared);
        var checked = book(create(other, first), shared);
        var late = book(create(own, first), slot(1, 1));
        var next = book(create(other, first), slot(2, 1));
        moveForTest(booked, start);
        moveForTest(late, end.minusSeconds(1800));
        moveForTest(next, end);
        jdbc.update("UPDATE appointments SET status='CHECKED_IN',checked_in_by=created_by,checked_in_at=created_at WHERE id=?", checked.id());

        mvc.perform(bearer(get(LIST).param("date", date.toString()).param("status", "BOOKED")
                .param("search", own.getPatientNumber().toLowerCase(java.util.Locale.ROOT))
                .param("sort", "startsAt,desc").param("size", "1"), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.timezone").value("Asia/Jerusalem"))
                .andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.last").value(false))
                .andExpect(jsonPath("$.content[*].id").value(contains(late.id().toString())));
        mvc.perform(bearer(get(LIST).param("date", date.toString()).param("status", "BOOKED")
                .param("sort", "startsAt,desc").param("size", "1").param("page", "1"), Role.RECEPTIONIST))
                .andExpect(jsonPath("$.last").value(true))
                .andExpect(jsonPath("$.content[*].id").value(contains(booked.id().toString())))
                .andExpect(jsonPath("$.content[0].startsAt").value(start.toString()))
                .andExpect(jsonPath("$.content[0].slotId").value(booked.slotId().toString()))
                .andExpect(jsonPath("$.content[0].booked").value(2))
                .andExpect(jsonPath("$.content[0].capacity").value(2))
                .andExpect(jsonPath("$.content[0].patient.fullName").value(own.getFullName()))
                .andExpect(jsonPath("$.content[0].patient.fileNumber").value(own.getPatientNumber()))
                .andExpect(jsonPath("$.content[0].patient.dateOfBirth").doesNotExist())
                .andExpect(jsonPath("$.content[0].orderNumber").value(order.orderNumber()))
                .andExpect(jsonPath("$.content[0].orderItemIds.length()").value(2))
                .andExpect(jsonPath("$.content[0].status").value("BOOKED"));
        mvc.perform(bearer(get(LIST).param("date", date.toString()).param("search", order.orderNumber())
                .param("status", "CHECKED_IN"), Role.RECEPTIONIST))
                .andExpect(jsonPath("$.totalElements").value(0)).andExpect(jsonPath("$.content").isEmpty());
        mvc.perform(bearer(get(LIST).param("date", date.toString()).param("page", "2147483647"), Role.RECEPTIONIST))
                .andExpect(jsonPath("$.totalElements").value(3)).andExpect(jsonPath("$.content").isEmpty());
    }

    @Test
    void listRejectsUnauthorizedRolesAndInvalidFilters() throws Exception {
        mvc.perform(get(LIST)).andExpect(status().isUnauthorized());
        for (var role : List.of(Role.PATIENT, Role.LAB_TECHNICIAN, Role.ADMIN))
            mvc.perform(bearer(get(LIST), role)).andExpect(status().isForbidden());
        var invalid = Map.of("date", "2030-02-30", "status", "PENDING", "sort", "patient,asc", "size", "101", "page", "-1");
        for (var entry : invalid.entrySet())
            error(mvc.perform(bearer(get(LIST).param(entry.getKey(), entry.getValue()), Role.RECEPTIONIST)),
                    400, "VALIDATION_ERROR", entry.getKey());
        error(mvc.perform(bearer(get(LIST).param("status", "BOOKED", "CHECKED_IN"), Role.RECEPTIONIST)),
                400, "VALIDATION_ERROR", "status");
    }

    @Test
    void showsPersistedRowsCountsAndArrivalTimeUsingLocalDayBoundaries() throws Exception {
        var midnight = LocalDate.now(AppointmentMapping.LAB_ZONE);
        var start = midnight.atStartOfDay(AppointmentMapping.LAB_ZONE).toInstant();
        var end = midnight.plusDays(1).atStartOfDay(AppointmentMapping.LAB_ZONE).toInstant();
        var order = create(own, first);
        var checked = book(order, slot(0, 1));
        var bookedOrder = create(other, first);
        var booked = book(bookedOrder, slot(1, 1));
        var cancelled = book(create(other, first), slot(2, 1));
        var completed = book(create(other, first), slot(3, 1));
        var noShow = book(create(other, first), slot(4, 1));
        var yesterday = book(create(other, first), slot(5, 1));
        var tomorrow = book(create(other, first), slot(6, 1));
        moveForTest(checked, start);
        moveForTest(booked, start.plusSeconds(3600));
        moveForTest(cancelled, start.plusSeconds(7200));
        moveForTest(completed, start.plusSeconds(10800));
        moveForTest(noShow, start.plusSeconds(14400));
        moveForTest(yesterday, start.minusSeconds(1800));
        moveForTest(tomorrow, end);
        jdbc.update("UPDATE appointments SET status='CANCELLED',cancelled_by=created_by,cancelled_at=created_at WHERE id=?", cancelled.id());
        jdbc.update("UPDATE appointments SET status='COMPLETED',checked_in_by=created_by,checked_in_at=created_at,completed_by=created_by,completed_at=created_at WHERE id=?", completed.id());
        jdbc.update("UPDATE appointments SET status='NO_SHOW',no_show_by=created_by,no_show_at=created_at WHERE id=?", noShow.id());
        var arrived = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        var payload = arrival(order, checked, arrived, checked.version());
        var key = UUID.randomUUID().toString();
        mvc.perform(bearer(get(TODAY).param("tab", "arrivals"), Role.RECEPTIONIST))
                .andExpect(jsonPath("$.counts.arrivals").value(5))
                .andExpect(jsonPath("$.counts.checkedIn").value(0))
                .andExpect(jsonPath("$.counts.notArrived").value(2))
                .andExpect(jsonPath("$.content[0].status").value("BOOKED"))
                .andExpect(jsonPath("$.content[0].checkInEligible").value(true));
        mvc.perform(bearer(get(TODAY).param("tab", "notArrived").param("date", midnight.toString()), Role.RECEPTIONIST))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id").value(contains(checked.id().toString(), booked.id().toString())))
                .andExpect(jsonPath("$.content[*].status").value(contains("BOOKED", "BOOKED")));
        mvc.perform(bearer(post("/api/visits").header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload)), Role.RECEPTIONIST))
                .andExpect(status().isCreated());
        mvc.perform(bearer(post("/api/visits").header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload)), Role.RECEPTIONIST))
                .andExpect(status().isOk());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM visits WHERE appointment_id=?", Integer.class, checked.id()));

        mvc.perform(bearer(get(TODAY).param("tab", "checkedIn"), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.date").value(midnight.toString())).andExpect(jsonPath("$.timezone").value("Asia/Jerusalem"))
                .andExpect(jsonPath("$.counts.arrivals").value(5)).andExpect(jsonPath("$.counts.checkedIn").value(1))
                .andExpect(jsonPath("$.counts.notArrived").value(1)).andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(checked.id().toString()))
                .andExpect(jsonPath("$.content[0].startsAt").value(start.toString()))
                .andExpect(jsonPath("$.content[0].patient.id").value(own.getId().toString()))
                .andExpect(jsonPath("$.content[0].patient.fileNumber").value(own.getPatientNumber()))
                .andExpect(jsonPath("$.content[0].patient.fullName").value(own.getFullName()))
                .andExpect(jsonPath("$.content[0].orderId").value(order.id().toString()))
                .andExpect(jsonPath("$.content[0].orderNumber").value(order.orderNumber()))
                .andExpect(jsonPath("$.content[0].arrivedAt").value(arrived.toString()))
                .andExpect(jsonPath("$.content[0].checkInEligible").value(false))
                .andExpect(jsonPath("$.content[0].patient.dateOfBirth").doesNotExist());
        mvc.perform(bearer(get(TODAY).param("tab", "notArrived"), Role.RECEPTIONIST))
                .andExpect(jsonPath("$.content[*].id").value(contains(booked.id().toString())))
                .andExpect(jsonPath("$.counts.arrivals").value(5))
                .andExpect(jsonPath("$.counts.checkedIn").value(1))
                .andExpect(jsonPath("$.counts.notArrived").value(1))
                .andExpect(jsonPath("$.content[0].status").value("BOOKED"))
                .andExpect(jsonPath("$.content[0].patient.id").value(other.getId().toString()))
                .andExpect(jsonPath("$.content[0].patient.fileNumber").value(other.getPatientNumber()))
                .andExpect(jsonPath("$.content[0].patient.fullName").value(other.getFullName()))
                .andExpect(jsonPath("$.content[0].orderId").value(bookedOrder.id().toString()))
                .andExpect(jsonPath("$.content[0].orderNumber").value(bookedOrder.orderNumber()))
                .andExpect(jsonPath("$.content[0].version").value(booked.version()))
                .andExpect(jsonPath("$.content[0].arrivedAt").doesNotExist())
                .andExpect(jsonPath("$.content[0].checkInEligible").value(true))
                .andExpect(jsonPath("$.content[0].orderItemIds[0]").value(bookedOrder.items().getFirst().id().toString()));
        var events = jdbc.queryForObject("SELECT count(*) FROM laboratory_events", Integer.class);
        var refreshed = mvc.perform(bearer(get(TODAY).param("tab", "arrivals"), Role.RECEPTIONIST))
                .andExpect(jsonPath("$.counts.arrivals").value(5))
                .andExpect(jsonPath("$.counts.checkedIn").value(1))
                .andExpect(jsonPath("$.counts.notArrived").value(1))
                .andExpect(jsonPath("$.content[*].id").value(contains(checked.id().toString(),
                        booked.id().toString(), cancelled.id().toString(), completed.id().toString(), noShow.id().toString())))
                .andExpect(jsonPath("$.content[*].status").value(contains("CHECKED_IN", "BOOKED", "CANCELLED", "COMPLETED", "NO_SHOW")))
                .andExpect(jsonPath("$.content[0].arrivedAt").value(arrived.toString()))
                .andExpect(jsonPath("$.content[0].version").value(checked.version() + 1))
                .andExpect(jsonPath("$.content[0].checkInEligible").value(false))
                .andReturn().getResponse().getContentAsString();
        mvc.perform(bearer(get(TODAY), Role.ADMIN)).andExpect(content().json(refreshed));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM visits WHERE appointment_id=?", Integer.class, checked.id()));
        assertEquals(events, jdbc.queryForObject("SELECT count(*) FROM laboratory_events", Integer.class));
        error(mvc.perform(bearer(post("/api/visits").header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload)), Role.RECEPTIONIST)),
                409, "APPOINTMENT_STATE_CONFLICT", null);
        var cancelledPayload = Map.of("orderId", cancelled.orderId(), "appointmentId", cancelled.id(),
                "orderItemIds", List.of(jdbc.queryForObject("SELECT id FROM order_items WHERE order_id=?", UUID.class, cancelled.orderId())),
                "arrivedAt", arrived.toString(), "expectedAppointmentVersion", cancelled.version());
        error(mvc.perform(bearer(post("/api/visits").header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(cancelledPayload)), Role.RECEPTIONIST)),
                409, "APPOINTMENT_STATE_CONFLICT", null);
    }

    @Test
    void elapsedConfirmedAppointmentLeavesNotArrivedOnlyAfterNoShowIsRecorded() throws Exception {
        var zone = AppointmentMapping.LAB_ZONE;
        var date = LocalDate.now(zone).minusDays(1);
        var order = create(own, first);
        var appointment = book(order, slot(0, 1));
        moveForTest(appointment, date.atStartOfDay(zone).toInstant());
        var tab = get(TODAY).param("tab", "notArrived").param("date", date.toString());
        mvc.perform(bearer(tab, Role.RECEPTIONIST))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.counts.notArrived").value(1))
                .andExpect(jsonPath("$.content[*].id").value(contains(appointment.id().toString())))
                .andExpect(jsonPath("$.content[0].noShowSupported").value(true));

        mvc.perform(bearer(post("/api/appointments/" + appointment.id() + "/no-show")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(new VisitRequests.Revision(appointment.version()))), Role.RECEPTIONIST))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("NO_SHOW"));

        mvc.perform(bearer(get(TODAY).param("tab", "notArrived").param("date", date.toString()), Role.RECEPTIONIST))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.counts.arrivals").value(1))
                .andExpect(jsonPath("$.counts.checkedIn").value(0))
                .andExpect(jsonPath("$.counts.notArrived").value(0))
                .andExpect(jsonPath("$.content").isEmpty());
        mvc.perform(bearer(get(TODAY).param("date", date.toString()), Role.RECEPTIONIST))
                .andExpect(jsonPath("$.content[0].id").value(appointment.id().toString()))
                .andExpect(jsonPath("$.content[0].status").value("NO_SHOW"))
                .andExpect(jsonPath("$.content[0].arrivedAt").doesNotExist());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM visits WHERE appointment_id=?", Integer.class, appointment.id()));
    }

    @Test
    void emptyDayAndPermissionsUseExistingErrorAndSecurityConventions() throws Exception {
        mvc.perform(bearer(get(TODAY), Role.RECEPTIONIST)).andExpect(status().isOk())
                .andExpect(jsonPath("$.counts.arrivals").value(0)).andExpect(jsonPath("$.counts.checkedIn").value(0))
                .andExpect(jsonPath("$.counts.notArrived").value(0)).andExpect(jsonPath("$.content").isEmpty());
        mvc.perform(get(TODAY)).andExpect(status().isUnauthorized());
        mvc.perform(bearer(get(TODAY), Role.PATIENT)).andExpect(status().isForbidden());
        mvc.perform(bearer(get(TODAY), Role.LAB_TECHNICIAN)).andExpect(status().isForbidden());
        error(mvc.perform(bearer(get(TODAY).param("tab", "arrivals", "checkedIn"), Role.RECEPTIONIST)),
                400, "VALIDATION_ERROR", "tab");
        for (String date : List.of("", "2030-02-30", "2030-3-01", "0000-01-01")) {
            error(mvc.perform(bearer(get(TODAY).param("date", date), Role.RECEPTIONIST)),
                    400, "VALIDATION_ERROR", "date");
        }
        error(mvc.perform(bearer(get(TODAY).param("date", "2030-03-01", "2030-03-02"), Role.RECEPTIONIST)),
                400, "VALIDATION_ERROR", "date");
        error(mvc.perform(bearer(get(TODAY).param("unknown", "true"), Role.RECEPTIONIST)),
                400, "VALIDATION_ERROR", "unknown");
    }

    @Test
    void selectedArrivalsDateUsesShortDstDayAndKeepsOneRowPerAppointment() throws Exception {
        var zone = AppointmentMapping.LAB_ZONE;
        var date = zone.getRules().nextTransition(Instant.parse("2030-01-01T00:00:00Z"))
                .getDateTimeAfter().toLocalDate();
        var start = date.atStartOfDay(zone).toInstant();
        var end = date.plusDays(1).atStartOfDay(zone).toInstant();
        assertEquals(Duration.ofHours(23), Duration.between(start, end));
        var shared = slot(0, 2);
        var multipleItems = book(create(own, first, free), shared);
        var sameTime = book(create(other, first), shared);
        var previous = book(create(own, first), slot(1, 1));
        var last = book(create(other, first), slot(2, 1));
        var next = book(create(own, first), slot(3, 1));
        moveForTest(multipleItems, start);
        moveForTest(previous, start.minusSeconds(1800));
        moveForTest(last, end.minusSeconds(1800));
        moveForTest(next, end);
        var simultaneous = List.of(multipleItems.id().toString(), sameTime.id().toString()).stream().sorted().toList();
        int multiIndex = simultaneous.indexOf(multipleItems.id().toString());
        mvc.perform(bearer(get(TODAY).param("tab", "arrivals").param("date", date.toString()), Role.RECEPTIONIST))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.date").value(date.toString()))
                .andExpect(jsonPath("$.counts.arrivals").value(3))
                .andExpect(jsonPath("$.counts.checkedIn").value(0))
                .andExpect(jsonPath("$.counts.notArrived").value(3))
                .andExpect(jsonPath("$.content[*].id").value(contains(simultaneous.getFirst(), simultaneous.getLast(), last.id().toString())))
                .andExpect(jsonPath("$.content[" + multiIndex + "].orderItemIds.length()").value(2))
                .andExpect(jsonPath("$.content[2].appointmentDate").value(date.toString()));
    }

    @Test
    void absentOrderAndPatientReferencesAreRenderedAsNullWithNoActions() {
        // Production foreign keys prevent this shape. Verify the defensive read contract independently.
        var repository = mock(AppointmentRepository.class);
        var visitRepository = mock(VisitRepository.class);
        var read = new AppointmentReadService(mock(AppointmentAccess.class), mock(PatientRepository.class),
                repository, mock(OrderItemRepository.class), visitRepository);
        var appointment = mock(Appointment.class);
        var slot = mock(AppointmentSlot.class);
        var id = UUID.randomUUID();
        var start = Instant.now();
        when(appointment.getId()).thenReturn(id);
        when(appointment.getStatus()).thenReturn(AppointmentStatus.CONFIRMED);
        when(appointment.getSlot()).thenReturn(slot);
        when(slot.getId()).thenReturn(UUID.randomUUID());
        when(slot.getStartsAt()).thenReturn(start);
        when(slot.getEndsAt()).thenReturn(start.plusSeconds(1800));
        when(repository.findScheduledDay(any(), any())).thenReturn(List.of(appointment));
        when(visitRepository.visitedAppointments(List.of(id))).thenReturn(Set.of());
        var row = read.today(actor(Role.RECEPTIONIST), Map.of()).content().getFirst();
        assertNull(row.orderId());
        assertNull(row.orderNumber());
        assertNull(row.patient());
        assertTrue(row.orderItemIds().isEmpty());
        assertFalse(row.checkInEligible());
        assertFalse(row.noShowSupported());
        var listRow = read.listReceptionist(actor(Role.RECEPTIONIST), AppointmentQuery.of(Map.of())).content().getFirst();
        assertNull(listRow.orderId());
        assertNull(listRow.orderNumber());
        assertNull(listRow.patient());
        assertFalse(listRow.checkInEligible());
        assertFalse(listRow.canReschedule());
        assertFalse(listRow.canCancel());
    }

    @Test
    void earlyAndLateCheckInsAreRejectedByBothListsAndVisitCreation() throws Exception {
        var zone = AppointmentMapping.LAB_ZONE;
        var today = LocalDate.now(zone);
        var order = create(own, first);
        var appointment = book(order, slot(0, 1));
        var now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        for (var date : List.of(today.minusDays(1), today.plusDays(1))) {
            moveForTest(appointment, date.atStartOfDay(zone).toInstant());
            for (var path : List.of(TODAY, LIST)) {
                mvc.perform(bearer(get(path).param("date", date.toString()), Role.RECEPTIONIST))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.content[0].checkInEligible").value(false));
            }
            // Even an arrival timestamp on yesterday's scheduled date cannot backdate a check-in.
            var payload = arrival(order, appointment, date.isBefore(today) ? date.atStartOfDay(zone).toInstant() : now,
                    appointment.version());
            error(mvc.perform(bearer(post("/api/visits").header("Idempotency-Key", UUID.randomUUID().toString())
                    .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload)), Role.RECEPTIONIST)),
                    409, "APPOINTMENT_STATE_CONFLICT", null);
        }
        moveForTest(appointment, today.atStartOfDay(zone).toInstant());
        var earlyTimestamp = arrival(order, appointment, today.atStartOfDay(zone).toInstant().minusSeconds(1),
                appointment.version());
        error(mvc.perform(bearer(post("/api/visits").header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(earlyTimestamp)), Role.RECEPTIONIST)),
                409, "APPOINTMENT_STATE_CONFLICT", null);
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM visits WHERE appointment_id=?", Integer.class, appointment.id()));
        assertEquals("CONFIRMED", jdbc.queryForObject("SELECT status FROM appointments WHERE id=?", String.class, appointment.id()));
    }

    @Test
    void staleVersionCannotCheckInAndConcurrentArrivalsCreateOneVisit() throws Exception {
        var order = create(own, first);
        var appointment = book(order, slot(0, 1));
        moveForTest(appointment, LocalDate.now(AppointmentMapping.LAB_ZONE)
                .atStartOfDay(AppointmentMapping.LAB_ZONE).toInstant());
        var arrivedAt = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        var stale = arrival(order, appointment, arrivedAt, appointment.version() + 1);
        error(mvc.perform(bearer(post("/api/visits").header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(stale)), Role.RECEPTIONIST)),
                409, "APPOINTMENT_CHANGED", null);
        var payload = arrival(order, appointment, arrivedAt, appointment.version());
        var gate = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Boolean> submit = () -> {
                if (!gate.await(5, TimeUnit.SECONDS))
                    throw new IllegalStateException("Timed out waiting for concurrent arrival");
                try {
                    return visits.arrive(actor(Role.RECEPTIONIST), payload, List.of(UUID.randomUUID().toString())).created();
                } catch (LaboratoryException ex) {
                    assertEquals("APPOINTMENT_STATE_CONFLICT", ex.getCode());
                    return false;
                }
            };
            var first = pool.submit(submit);
            var second = pool.submit(submit);
            gate.countDown();
            assertNotEquals(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS));
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM visits WHERE appointment_id=?", Integer.class, appointment.id()));
        assertEquals("CHECKED_IN", jdbc.queryForObject("SELECT status FROM appointments WHERE id=?", String.class, appointment.id()));
    }

    private VisitRequests.Arrival arrival(OrderDetailResponse order, AppointmentResponses.Detail appointment,
                                          Instant arrivedAt, long version) {
        return new VisitRequests.Arrival(order.id().toString(), appointment.id().toString(),
                List.of(order.items().getFirst().id().toString()), arrivedAt.toString(), version);
    }

    private void moveForTest(AppointmentResponses.Detail appointment, Instant start) {
        jdbc.update("UPDATE appointment_slots SET starts_at=?,ends_at=? WHERE id=?",
                Timestamp.from(start), Timestamp.from(start.plusSeconds(1800)), appointment.slotId());
    }
}
