package com.smartlims.appointments;

import com.smartlims.auth.entity.Role;
import com.smartlims.appointments.dto.*;

import java.time.Instant;

import static java.time.temporal.ChronoUnit.MICROS;

import java.util.*;
import java.util.concurrent.*;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AppointmentScheduleTest extends AppointmentTestSupport {
    @Test
    void typeManagementAndActiveDiscoveryRequireCorrectRolesAndNormalize() throws Exception {
        var result = mvc.perform(bearer(post("/api/appointment-types"), Role.ADMIN).contentType("application/json").content("{\"code\":\" synth \",\"name\":\" Synthetic visit \",\"active\":true}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.code").value("SYNTH")).andReturn();
        String id = json.readTree(result.getResponse().getContentAsString()).get("id").asString();
        mvc.perform(bearer(get("/api/appointment-types"), Role.PATIENT)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(bearer(put("/api/appointment-types/" + id), Role.ADMIN).contentType("application/json").content("{\"code\":\"SYNTH\",\"name\":\"Changed\",\"active\":false}")).andExpect(status().isOk());
        mvc.perform(bearer(get("/api/appointment-types"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(bearer(get("/api/appointment-types").param("includeInactive", "true"), Role.RECEPTIONIST)).andExpect(jsonPath("$.totalElements").value(1));
        error(mvc.perform(bearer(get("/api/appointment-types").param("includeInactive", "true"), Role.PATIENT)), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(post("/api/appointment-types"), Role.RECEPTIONIST).contentType("application/json").content("{}")), 403, "FORBIDDEN", null);
        error(mvc.perform(bearer(get("/api/appointment-types"), Role.LAB_TECHNICIAN)), 403, "FORBIDDEN", null);
        error(mvc.perform(get("/api/appointment-types")), 401, "UNAUTHORIZED", null);
    }

    @Test
    void slotsUseExplicitOffsetsAllowAdjacencyAndRejectOverlapEvenInactive() {
        var start = Instant.now().truncatedTo(MICROS).plusSeconds(86400);
        var s = schedule.createSlot(actor(Role.RECEPTIONIST), new AppointmentRequests.SlotCreate(start.toString(), start.plusSeconds(1800).toString(), 2, true));
        assertEquals(start, s.startsAt());
        assertEquals(2, s.remainingCapacity());
        schedule.createSlot(actor(Role.ADMIN), new AppointmentRequests.SlotCreate(start.plusSeconds(1800).toString(), start.plusSeconds(3600).toString(), 1, false));
        assertThrows(RuntimeException.class, () -> schedule.createSlot(actor(Role.ADMIN), new AppointmentRequests.SlotCreate(start.plusSeconds(1).toString(), start.plusSeconds(60).toString(), 1, true)));
        var updated = schedule.updateSlot(actor(Role.RECEPTIONIST), s.id().toString(), new AppointmentRequests.SlotUpdate(3, false));
        assertFalse(updated.active());
        assertEquals(s.startsAt(), updated.startsAt());
    }

    @Test
    void strictJsonAndQueryValidationRejectCoercionUnknownRepeatedAndInvalidValues() throws Exception {
        for (String body : List.of("{}", "{\"code\":1,\"name\":\"Synthetic\",\"active\":true}", "{\"code\":\"S\",\"name\":\"Synthetic\",\"active\":\"true\"}", "{\"code\":\"S\",\"name\":\"Synthetic\",\"active\":true,\"patientId\":\"x\"}")) {
            mvc.perform(bearer(post("/api/appointment-types"), Role.ADMIN).contentType("application/json").content(body)).andExpect(status().isBadRequest());
        }
        error(mvc.perform(bearer(get("/api/appointment-types").param("page", "0", "1"), Role.PATIENT)), 400, "VALIDATION_ERROR", "page");
        error(mvc.perform(bearer(get("/api/appointment-types").param("patientId", "x"), Role.PATIENT)), 400, "VALIDATION_ERROR", "patientId");
        error(mvc.perform(bearer(get("/api/appointment-types").param("size", "101"), Role.PATIENT)), 400, "VALIDATION_ERROR", "size");
        error(mvc.perform(bearer(get("/api/appointment-slots/schedule").param("from", "2026-12-01T10:00:00").param("to", "2026-12-02T10:00:00Z"), Role.ADMIN)), 400, "VALIDATION_ERROR", "from");
        error(mvc.perform(bearer(post("/api/appointment-slots"), Role.RECEPTIONIST).contentType("application/json").content("{\"startsAt\":\"2026-12-01T10:00:00Z\",\"endsAt\":\"2026-12-01T10:30:00Z\",\"capacity\":1.5,\"active\":true}")), 400, "INVALID_JSON", null);
    }

    @Test
    void rejectsPastInvalidRangesAndDuplicateCodes() {
        var body = new AppointmentRequests.Type("SYNTH", "Synthetic", true);
        schedule.saveType(actor(Role.ADMIN), null, body);
        assertThrows(RuntimeException.class, () -> schedule.saveType(actor(Role.ADMIN), null, body));
        assertThrows(RuntimeException.class, () -> schedule.createSlot(actor(Role.ADMIN), new AppointmentRequests.SlotCreate("2020-01-01T00:00:00Z", "2020-01-01T00:30:00Z", 1, true)));
        assertThrows(RuntimeException.class, () -> schedule.createSlot(actor(Role.ADMIN), new AppointmentRequests.SlotCreate("2028-02-30T00:00:00Z", "2028-03-01T00:00:00Z", 1, true)));
    }

    @Test
    void concurrentOverlappingPublicationHasExactlyOneWinner() throws Exception {
        var start = Instant.now().truncatedTo(MICROS).plusSeconds(86400).toString();
        var end = Instant.now().truncatedTo(MICROS).plusSeconds(90000).toString();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var latch = new CountDownLatch(1);
            Callable<Boolean> task = () -> {
                latch.await();
                try {
                    schedule.createSlot(actor(Role.RECEPTIONIST), new AppointmentRequests.SlotCreate(start, end, 1, true));
                    return true;
                } catch (RuntimeException e) {
                    return false;
                }
            };
            var a = pool.submit(task);
            var b = pool.submit(task);
            latch.countDown();
            assertNotEquals(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM appointment_slots", Integer.class));
    }

    @Test
    void schedulePagingRangeAndHugeOffsetsHaveCorrectCounts() throws Exception {
        var start = Instant.now().truncatedTo(MICROS).plusSeconds(86400);
        schedule.createSlot(actor(Role.ADMIN), new AppointmentRequests.SlotCreate(start.toString(), start.plusSeconds(60).toString(), 1, false));
        mvc.perform(bearer(get("/api/appointment-slots/schedule").param("from", start.minusSeconds(1).toString()).param("to", start.plusSeconds(3600).toString()), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].active").value(false));
        mvc.perform(bearer(get("/api/appointment-slots/schedule").param("from", start.minusSeconds(1).toString()).param("to", start.plusSeconds(3600).toString()).param("page", "2147483647").param("size", "100"), Role.ADMIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content").isEmpty());
    }

    @Test
    void persistedAppointmentsRetainRelationshipsSnapshotsAndGuardOccupiedCapacity() {
        var type = schedule.saveType(actor(Role.ADMIN), null, new AppointmentRequests.Type("SYNTH", "Original synthetic type", true));
        var start = Instant.now().truncatedTo(MICROS).plusSeconds(86400);
        var slot = schedule.createSlot(actor(Role.ADMIN), new AppointmentRequests.SlotCreate(start.toString(), start.plusSeconds(600).toString(), 2, true));
        var order = create(own, first);
        var second = create(other, first);
        String insert = "INSERT INTO appointments(id,order_id,slot_id,original_slot_id,type_id,type_name_snapshot,created_by,idempotency_key) VALUES (?,?,?,?,?,'Original synthetic type',?,?)";
        UUID id = UUID.randomUUID();
        jdbc.update(insert, id, order.id(), slot.id(), slot.id(), type.id(), actors.get(Role.ADMIN).getId(), UUID.randomUUID());
        jdbc.update(insert, UUID.randomUUID(), second.id(), slot.id(), slot.id(), type.id(), actors.get(Role.ADMIN).getId(), UUID.randomUUID());
        var error = assertThrows(com.smartlims.appointments.exception.AppointmentException.class, () -> schedule.updateSlot(actor(Role.RECEPTIONIST), slot.id().toString(), new AppointmentRequests.SlotUpdate(1, true)));
        assertEquals("APPOINTMENT_SCHEDULE_CONFLICT", error.getCode());
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class, () -> jdbc.update(insert, UUID.randomUUID(), order.id(), slot.id(), slot.id(), type.id(), actors.get(Role.ADMIN).getId(), UUID.randomUUID()));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class, () -> jdbc.update("DELETE FROM appointment_slots WHERE id=?", slot.id()));
        schedule.saveType(actor(Role.ADMIN), type.id().toString(), new AppointmentRequests.Type("SYNTH", "Renamed synthetic", false));
        assertEquals("Original synthetic type", jdbc.queryForObject("SELECT type_name_snapshot FROM appointments WHERE id=?", String.class, id));
        assertEquals(0, schedule.updateSlot(actor(Role.RECEPTIONIST), slot.id().toString(), new AppointmentRequests.SlotUpdate(2, false)).remainingCapacity());
    }
}
