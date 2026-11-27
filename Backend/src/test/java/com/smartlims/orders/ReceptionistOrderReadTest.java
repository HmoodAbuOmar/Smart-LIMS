package com.smartlims.orders;

import com.smartlims.auth.entity.Role;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ReceptionistOrderReadTest extends OrderWorkflowTestSupport {
    private static final String PATH = "/api/receptionist/orders";



    @Test
    void listsPersistedSnapshotsWithStablePaginationAndNoDuplicateOrders() throws Exception {
        var firstOrder = create(own, first, free);
        var secondOrder = create(other, free);
        jdbc.update("UPDATE test_orders SET created_at='2026-11-14T22:30:00Z'");
        mvc.perform(bearer(get(PATH).param("size", "1").param("sort", "orderNumber,asc"), Role.RECEPTIONIST))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.last").value(false))
                .andExpect(jsonPath("$.content[0].id").value(firstOrder.id().toString()))
                .andExpect(jsonPath("$.content[0].patientNumber").value(own.getPatientNumber()))
                .andExpect(jsonPath("$.content[0].patientName").value(own.getFullName()))
                .andExpect(jsonPath("$.content[0].createdAt").value("2026-11-14T22:30:00Z"))
                .andExpect(jsonPath("$.content[0].testCount").value(2))
                .andExpect(jsonPath("$.content[0].totalAmount").value(12.34))
                .andExpect(jsonPath("$.content[0].currency").value(firstOrder.currency()))
                .andExpect(jsonPath("$.content[0].patient").doesNotExist())
                .andExpect(jsonPath("$.content[0].financial").doesNotExist())
                .andExpect(jsonPath("$.content[0].status").value("PENDING"));
        mvc.perform(bearer(get(PATH).param("page", "1").param("size", "1").param("sort", "orderNumber,asc"), Role.RECEPTIONIST))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.last").value(true))
                .andExpect(jsonPath("$.content[0].id").value(secondOrder.id().toString()));
    }

    @Test
    void searchesReferenceNameAndFileNumberWithLiteralMatching() throws Exception {
        var order = create(own, first);
        for (String search : new String[]{order.orderNumber().toLowerCase(java.util.Locale.ROOT),
                "  WORKFLOW PROFILE ", own.getPatientNumber()}) {
            mvc.perform(bearer(get(PATH).param("search", search), Role.RECEPTIONIST))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.content[0].id").value(order.id().toString()));
        }
        mvc.perform(bearer(get(PATH).param("search", "%"), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.content").isEmpty());
        for (String field : new String[]{"status", "fromDate", "paymentStatus", "patientId"}) {
            mvc.perform(bearer(get(PATH).param(field, "invalid"), Role.RECEPTIONIST))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors." + field).exists());
        }
        mvc.perform(bearer(get(PATH).param("size", "101"), Role.RECEPTIONIST)).andExpect(status().isBadRequest());
        mvc.perform(bearer(get(PATH).param("search", "a", "b"), Role.RECEPTIONIST)).andExpect(status().isBadRequest());
        mvc.perform(bearer(get(PATH).param("sort", "patientName,asc"), Role.RECEPTIONIST)).andExpect(status().isBadRequest());
    }

    @Test
    void detailIncludesOnlyAppointmentsLinkedToTheSelectedOrder() throws Exception {
        var order = create(own, first);
        var unrelated = create(other, first);
        UUID slot = UUID.randomUUID();
        UUID booked = UUID.randomUUID();
        UUID receptionist = actors.get(Role.RECEPTIONIST).getId();
        jdbc.update("""
                INSERT INTO appointment_slots (id, starts_at, ends_at, capacity)
                VALUES (?, '2026-11-15T08:00:00Z', '2026-11-15T08:30:00Z', 2)
                """, slot);
        for (var entry : java.util.Map.of(order.id(), booked, unrelated.id(), UUID.randomUUID()).entrySet()) {
            jdbc.update("""
                    INSERT INTO appointments (id, order_id, slot_id, original_slot_id, status, created_by, idempotency_key)
                    VALUES (?, ?, ?, ?, 'CONFIRMED', ?, ?)
                    """, entry.getValue(), entry.getKey(), slot, slot, receptionist, UUID.randomUUID());
        }
        mvc.perform(bearer(get(PATH + "/" + order.id()), Role.RECEPTIONIST))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.appointments.length()").value(1))
                .andExpect(jsonPath("$.appointments[0].id").value(booked.toString()))
                .andExpect(jsonPath("$.appointments[0].startsAt").value("2026-11-15T08:00:00Z"))
                .andExpect(jsonPath("$.appointments[0].status").value("CONFIRMED"));
    }

    @Test
    void opensAnAuthorizedOrderWithoutClinicalOrAdministrativeFields() throws Exception {
        var order = create(unlinked, first);
        String detail = PATH + "/" + order.id();
        mvc.perform(bearer(get(detail), Role.RECEPTIONIST))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.order.patientId").value(unlinked.getId().toString()))
                .andExpect(jsonPath("$.order.patientNumber").value(unlinked.getPatientNumber()))
                .andExpect(jsonPath("$.patient.dateOfBirth").value(unlinked.getDateOfBirth().toString()))
                .andExpect(jsonPath("$.patient.gender").value(unlinked.getGender().name()))
                .andExpect(jsonPath("$.patient.phoneNumber").value(unlinked.getPhoneNumber()))
                .andExpect(jsonPath("$.patient.address").doesNotExist())
                .andExpect(jsonPath("$.patient.userId").doesNotExist())
                .andExpect(jsonPath("$.financial.supported").value(true))
                .andExpect(jsonPath("$.financial.confirmedPayments").value(0.0))
                .andExpect(jsonPath("$.financial.netConfirmedCollections").value(0.0))
                .andExpect(jsonPath("$.outstanding").value(12.34))
                .andExpect(jsonPath("$.transactions").doesNotExist())
                .andExpect(jsonPath("$.items[0].testCode").value(first.getCode()))
                .andExpect(jsonPath("$.items[0].labTestId").value(first.getId().toString()))
                .andExpect(jsonPath("$.items[0].priceAtOrder").value(12.34))
                .andExpect(jsonPath("$.order.totalAmount").value(12.34))
                .andExpect(jsonPath("$.appointments").isEmpty())
                .andExpect(jsonPath("$.order.dateOfBirth").doesNotExist())
                .andExpect(jsonPath("$.order.phoneNumber").doesNotExist())
                .andExpect(jsonPath("$.order.cancellationReason").doesNotExist())
                .andExpect(jsonPath("$.results").doesNotExist());
        error(mvc.perform(bearer(get(PATH + "/" + UUID.randomUUID()), Role.RECEPTIONIST)),
                404, "ORDER_NOT_FOUND", null);
        error(mvc.perform(bearer(get(PATH + "/invalid"), Role.RECEPTIONIST)), 400, "VALIDATION_ERROR", "id");
        error(mvc.perform(bearer(get(detail).param("patientId", own.getId().toString()), Role.RECEPTIONIST)),
                400, "VALIDATION_ERROR", "patientId");
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        mvc.perform(get(detail)).andExpect(status().isUnauthorized());
        for (Role role : new Role[]{Role.ADMIN, Role.PATIENT, Role.LAB_TECHNICIAN}) {
            mvc.perform(bearer(get(PATH), role)).andExpect(status().isForbidden());
            mvc.perform(bearer(get(detail), role)).andExpect(status().isForbidden());
        }
        mvc.perform(bearer(get("/api/orders"), Role.RECEPTIONIST)).andExpect(status().isForbidden());
        mvc.perform(bearer(get("/api/orders/" + order.id()), Role.RECEPTIONIST)).andExpect(status().isForbidden());
        mvc.perform(bearer(get("/api/orders"), Role.ADMIN)).andExpect(status().isOk());
        mvc.perform(bearer(get("/api/orders/" + order.id()), Role.ADMIN)).andExpect(status().isOk());
    }
}
