package com.smartlims.appointments;

import com.smartlims.appointments.dto.*;
import com.smartlims.appointments.exception.AppointmentException;
import com.smartlims.auth.entity.Role;

import java.util.*;
import java.util.concurrent.*;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AppointmentBookingTest extends AppointmentTestSupport {
    @Test
    void patientBooksWithOwnOrderAndRetriesWithoutNewRows() throws Exception {
        var slot = slot(0, 2);
        var order = create(own, first);
        String key = UUID.randomUUID().toString();
        String body = json.writeValueAsString(new AppointmentRequests.Book(order.id().toString(), slot.id().toString()));
        var response = mvc.perform(bearer(post("/api/appointments"), Role.PATIENT).header("Idempotency-Key", key).contentType("application/json").content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("CONFIRMED")).andExpect(jsonPath("$.canReschedule").value(true)).andExpect(jsonPath("$.canCancel").value(true)).andExpect(jsonPath("$.timezone").value("Asia/Jerusalem")).andReturn().getResponse();
        var id = json.readTree(response.getContentAsString()).get("id").asString();
        assertEquals("/api/appointments/me/" + id, response.getHeader("Location"));
        mvc.perform(bearer(post("/api/appointments"), Role.PATIENT).header("Idempotency-Key", key).contentType("application/json").content(body)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM appointments", Integer.class));
        assertEquals("PENDING", jdbc.queryForObject("SELECT status FROM test_orders WHERE id=?", String.class, order.id()));
    }

    @Test
    void ownershipRolesInputAndRetryIntentAreEnforced() throws Exception {
        var s = slot(0, 2);
        var order = create(own, first);
        var key = UUID.randomUUID().toString();
        var body = new AppointmentRequests.Book(order.id().toString(), s.id().toString());
        bookings.book(actor(Role.PATIENT), body, List.of(key));
        var changed = new AppointmentRequests.Book(order.id().toString(), slot(1, 2).id().toString());
        assertEquals("IDEMPOTENCY_KEY_REUSED", assertThrows(AppointmentException.class, () -> bookings.book(actor(Role.PATIENT), changed, List.of(key))).getCode());
        error(mvc.perform(post("/api/appointments").header("Authorization", "Bearer " + strangerToken).header("Idempotency-Key", UUID.randomUUID()).contentType("application/json").content(json.writeValueAsString(body))), 404, "ORDER_NOT_FOUND", null);
        error(mvc.perform(bearer(post("/api/appointments"), Role.LAB_TECHNICIAN).contentType("application/json").content("{}")), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(post("/api/appointments"), Role.PATIENT).contentType("application/json").content(json.writeValueAsString(body))), 400, "VALIDATION_ERROR", "idempotencyKey");
        error(mvc.perform(bearer(post("/api/appointments"), Role.PATIENT).header("Idempotency-Key", key, key).contentType("application/json").content(json.writeValueAsString(body))), 400, "VALIDATION_ERROR", "idempotencyKey");
        error(mvc.perform(bearer(post("/api/appointments"), Role.PATIENT).header("Idempotency-Key", key).contentType("application/json").content("{\"orderId\":123,\"typeId\":\"x\",\"slotId\":\"x\"}")), 400, "INVALID_JSON", null);
    }

    @Test
    void sharedCapacityPatientOverlapAndActiveOrderUniquenessAreIndependent() {
        var s = slot(0, 2);
        var o = create(own, first);
        book(o, s);
        assertEquals("ORDER_NOT_BOOKABLE", assertThrows(AppointmentException.class, () -> book(o, slot(1, 2))).getCode());
        assertEquals("APPOINTMENT_SLOT_UNAVAILABLE", assertThrows(AppointmentException.class, () -> book(create(own, first), s)).getCode());
        book(create(other, first), s);
        assertEquals("APPOINTMENT_SLOT_UNAVAILABLE", assertThrows(AppointmentException.class, () -> book(create(unlinked, first), s)).getCode());
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM appointments", Integer.class));
    }

    @Test
    void availabilityFiltersFullInactivePatientConflictsAndUsesAccuratePages() throws Exception {
        var s = slot(0, 1);
        var target = slot(1, 3);
        var inactive = slot(2, 1);
        schedule.updateSlot(actor(Role.ADMIN), inactive.id().toString(), new AppointmentRequests.SlotUpdate(1, false));
        book(create(other, first), s);
        var order = create(own, first);
        mvc.perform(bearer(get("/api/appointment-slots").param("orderId", order.id().toString()).param("from", future.minusSeconds(1).toString()).param("to", future.plusSeconds(86400).toString()), Role.PATIENT))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].id").value(target.id().toString())).andExpect(jsonPath("$.content[0].remainingCapacity").value(3));
        book(create(own, first), target);
        var query = AppointmentQuery.of(Map.of("orderId", List.of(order.id().toString()), "from", List.of(future.minusSeconds(1).toString()), "to", List.of(future.plusSeconds(86400).toString())), "orderId", "from", "to");
        assertEquals(0, bookings.slots(actor(Role.PATIENT), query).totalElements());
    }

    @Test
    void unavailableOrderRejectsWithoutPartialBooking() {
        var s = slot(0, 1);
        var o = create(own, first);
        state(o.id(), "IN_PROGRESS");
        assertEquals("ORDER_NOT_BOOKABLE", assertThrows(AppointmentException.class, () -> book(o, s)).getCode());
        var pending = create(own, first);
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM appointments", Integer.class));
        assertNotNull(book(pending, s));
        assertNotNull(book(create(unlinked, first), slot(1, 1)));
    }

    @Test
    void concurrentLastCapacityAndConcurrentRetriesHaveOneDurableBooking() throws Exception {
        var s = slot(0, 1);
        var ownOrder = create(own, first);
        var otherOrder = create(other, first);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            Callable<String> a = () -> {
                gate.await();
                try {
                    return book(ownOrder, s).id().toString();
                } catch (AppointmentException ex) {
                    return ex.getCode();
                }
            };
            Callable<String> b = () -> {
                gate.await();
                try {
                    return book(otherOrder, s).id().toString();
                } catch (AppointmentException ex) {
                    return ex.getCode();
                }
            };
            var x = pool.submit(a);
            var y = pool.submit(b);
            gate.countDown();
            var results = List.of(x.get(15, TimeUnit.SECONDS), y.get(15, TimeUnit.SECONDS));
            assertEquals(1, Collections.frequency(results, "APPOINTMENT_SLOT_UNAVAILABLE"));
        }
        var second = slot(1, 2);
        var request = new AppointmentRequests.Book(create(unlinked, first).id().toString(), second.id().toString());
        var key = List.of(UUID.randomUUID().toString());
        try (var pool = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            Callable<UUID> task = () -> {
                gate.await();
                return bookings.book(actor(Role.RECEPTIONIST), request, key).appointment().id();
            };
            var a = pool.submit(task);
            var b = pool.submit(task);
            gate.countDown();
            assertEquals(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
        }
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM appointments", Integer.class));
    }
    @Test
    void obsoleteTypeInputIsRejectedAndNoTypeIsExposed() throws Exception {
        var order = create(own, first);
        var slot = slot(0, 2);
        error(mvc.perform(bearer(get("/api/appointment-slots"), Role.PATIENT)
                .param("orderId", order.id().toString()).param("typeId", UUID.randomUUID().toString())
                .param("from", future.minusSeconds(1).toString()).param("to", future.plusSeconds(86400).toString())),
                400, "VALIDATION_ERROR", "typeId");
        String body = json.writeValueAsString(Map.of("orderId", order.id(), "slotId", slot.id(), "typeId", UUID.randomUUID()));
        error(mvc.perform(bearer(post("/api/appointments"), Role.PATIENT).header("Idempotency-Key", UUID.randomUUID())
                .contentType("application/json").content(body)), 400, "INVALID_JSON", null);
        var saved = book(order, slot);
        mvc.perform(bearer(get("/api/appointments/me/" + saved.id()), Role.PATIENT))
                .andExpect(status().isOk()).andExpect(jsonPath("$.typeId").doesNotExist()).andExpect(jsonPath("$.typeName").doesNotExist());
    }

}
