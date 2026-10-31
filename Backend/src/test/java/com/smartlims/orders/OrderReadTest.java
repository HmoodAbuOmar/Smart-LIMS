package com.smartlims.orders;

import com.smartlims.auth.entity.Role;
import com.smartlims.labtests.entity.LabTest;
import com.smartlims.orders.dto.*;
import com.smartlims.orders.exception.OrderException;
import com.smartlims.orders.service.OrderReadService;
import jakarta.servlet.http.Cookie;

import java.math.BigDecimal;
import java.util.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class OrderReadTest extends OrderWorkflowTestSupport {
    @Autowired
    OrderReadService reads;

    private OrderPageResponse page(String... parameters) throws Exception {
        var request = bearer(get("/api/orders/me"), Role.PATIENT);
        for (int i = 0; i < parameters.length; i += 2)
            request.param(parameters[i], parameters[i + 1]);
        return json.readValue(mvc.perform(request).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsByteArray(), OrderPageResponse.class);
    }

    private OrderDetailResponse detail(UUID id) throws Exception {
        return json.readValue(mvc.perform(bearer(get("/api/orders/me/" + id), Role.PATIENT)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray(), OrderDetailResponse.class);
    }

    @Test
    void listCountsUniqueOwnedStaffCreatedOrdersAndAggregatesEachOriginalItemOnce() throws Exception {
        var a = create(own, first, free);
        var b = create(own, first);
        create(other, first, free);
        create(unlinked, first);
        var result = page();
        assertEquals(2, result.totalElements());
        assertEquals(1, result.totalPages());
        assertTrue(result.first());
        assertTrue(result.last());
        assertEquals(List.of(b.id(), a.id()), result.content().stream().map(OrderSummaryResponse::id).toList());
        assertEquals(1, result.content().get(0).testCount());
        assertEquals(2, result.content().get(1).testCount());
        assertEquals(new BigDecimal("12.34"), result.content().get(1).totalAmount());
        assertTrue(result.content().stream().allMatch(order -> order.canCancel() && !order.visitDetailsAvailable() && order.currency().equals("ILS")));
        var raw = mvc.perform(bearer(get("/api/orders/me"), Role.PATIENT)).andReturn().getResponse().getContentAsByteArray();
        var body = json.readValue(raw, Map.class);
        assertEquals(Set.of("content", "page", "size", "totalElements", "totalPages", "first", "last"), body.keySet());
        assertEquals(Set.of("id", "orderNumber", "createdAt", "updatedAt", "testCount", "totalAmount", "currency", "status", "canCancel", "visitDetailsAvailable"),
                ((Map<?, ?>) ((List<?>) body.get("content")).getFirst()).keySet());
        verifyNoInteractions(email);
    }

    @Test
    void combinedSearchStatusAndOwnershipPrecedePaginationAndAccurateTotals() throws Exception {
        List<OrderDetailResponse> owned = new ArrayList<>();
        for (String status : List.of("PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED")) {
            var order = create(own, first, free);
            state(order.id(), status);
            owned.add(order);
            var hidden = create(other, first);
            state(hidden.id(), status);
        }
        assertEquals(4, page().totalElements());
        for (String status : List.of("PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED")) {
            var result = page("status", status, "search", " oRd- ", "size", "1");
            assertEquals(1, result.totalElements());
            assertEquals(status, result.content().getFirst().status().name());
            assertEquals(status.equals("PENDING"), result.content().getFirst().canCancel());
            assertEquals(new BigDecimal("12.34"), result.content().getFirst().totalAmount());
            assertEquals(2, result.content().getFirst().testCount());
        }
        assertEquals(1, page("search", owned.getFirst().orderNumber().toLowerCase(Locale.ROOT)).totalElements());
        assertEquals(0, page("status", "COMPLETED", "search", owned.getFirst().orderNumber()).totalElements());
        for (String literal : List.of("%", "_", "\\", "Synthetic", "Z_SYN"))
            assertEquals(0, page("search", literal).totalElements());
    }

    @Test
    void paginationAndEverySortUseDeterministicAscendingUuidTies() throws Exception {
        List<OrderDetailResponse> created = List.of(create(own, first), create(own, first, free), create(own, free));
        jdbc.update("UPDATE test_orders SET created_at='2020-01-01T00:00:00Z',updated_at='2021-01-01T00:00:00Z' WHERE patient_id=?", own.getId());
        List<UUID> ties = created.stream().map(OrderDetailResponse::id).sorted(Comparator.comparing(UUID::toString)).toList();
        for (String sort : List.of("createdAt,asc", "createdAt,desc", "updatedAt,asc", "updatedAt,desc")) {
            assertEquals(ties, page("sort", sort).content().stream().map(OrderSummaryResponse::id).toList());
            var middle = page("sort", sort, "page", "1", "size", "1");
            assertEquals(ties.get(1), middle.content().getFirst().id());
            assertEquals(3, middle.totalElements());
            assertEquals(3, middle.totalPages());
            assertFalse(middle.first());
            assertFalse(middle.last());
        }
        var ascending = created.stream().sorted(Comparator.comparing(OrderDetailResponse::orderNumber)).map(OrderDetailResponse::id).toList();
        assertEquals(ascending, page("sort", "orderNumber,asc").content().stream().map(OrderSummaryResponse::id).toList());
        assertEquals(ascending.reversed(), page("sort", "orderNumber,desc").content().stream().map(OrderSummaryResponse::id).toList());
        assertTrue(page("page", "2", "size", "1").last());
        for (String distant : List.of("1000", "2147483647")) {
            var empty = page("page", distant, "size", "100");
            assertTrue(empty.content().isEmpty());
            assertEquals(3, empty.totalElements());
            assertEquals(1, empty.totalPages());
            assertTrue(empty.last());
        }
    }

    @Test
    void emptyLinkedProfileAndMissingLinkHaveDifferentContracts() throws Exception {
        assertEquals(new OrderPageResponse(List.of(), 0, 20, 0, 0, true, true), page());
        assertTrue(page("status", "COMPLETED").content().isEmpty());
        jdbc.update("UPDATE patients SET user_id=NULL WHERE id=?", own.getId());
        error(mvc.perform(bearer(get("/api/orders/me"), Role.PATIENT)), 404, "PATIENT_PROFILE_NOT_LINKED", null);
        error(mvc.perform(bearer(get("/api/orders/me/" + UUID.randomUUID()), Role.PATIENT)), 404, "ORDER_NOT_FOUND", null);
        error(mvc.perform(bearer(get("/api/orders/me").param("page", "-1"), Role.PATIENT)), 400, "VALIDATION_ERROR", "page");
    }

    @Test
    void patientsCannotReadAnotherProfilesOrdersOrOverrideOwnershipThroughQueryParameters() throws Exception {
        var hidden = create(other, first);
        var visible = create(own, first);
        assertEquals(List.of(visible.id()), page("patientId", other.getId().toString(), "userId", stranger.getId().toString())
                .content().stream().map(OrderSummaryResponse::id).toList());
        for (UUID id : List.of(hidden.id(), UUID.randomUUID())) {
            var response = mvc.perform(bearer(get("/api/orders/me/" + id), Role.PATIENT));
            error(response, 404, "ORDER_NOT_FOUND", null);
            response.andExpect(jsonPath("$.message").value("Order not found."));
        }
        mvc.perform(get("/api/orders/me/" + visible.id()).header("Authorization", "Bearer " + strangerToken)).andExpect(status().isNotFound());
        mvc.perform(get("/api/orders/me/" + hidden.id()).header("Authorization", "Bearer " + strangerToken)).andExpect(status().isOk());
    }

    @Test
    void storedSnapshotsAndDetailFieldsSurviveCatalogChangesAndCancellationState() throws Exception {
        var created = create(own, first, free);
        assertEquals(created, detail(created.id()));
        jdbc.update("UPDATE lab_tests SET name='Synthetic renamed test',code='RENAMED',price=999.99,active=false WHERE id=?", first.getId());
        assertEquals(created, detail(created.id()));
        assertEquals(new BigDecimal("12.34"), page().content().getFirst().totalAmount());
        state(created.id(), "CANCELLED");
        var cancelled = detail(created.id());
        assertEquals(created.items(), cancelled.items());
        assertEquals(new BigDecimal("12.34"), cancelled.totalAmount());
        assertEquals("Synthetic cancellation", cancelled.cancellationReason());
        assertNotNull(cancelled.cancelledAt());
        assertFalse(cancelled.canCancel());
        assertFalse(cancelled.visitDetailsAvailable());
        var raw = json.readValue(mvc.perform(bearer(get("/api/orders/me/" + created.id()), Role.PATIENT))
                .andReturn().getResponse().getContentAsByteArray(), Map.class);
        assertEquals(Set.of("id", "orderNumber", "createdAt", "updatedAt", "testCount", "totalAmount", "currency", "status",
                "canCancel", "visitDetailsAvailable", "patientId", "items", "cancelledAt", "cancellationReason"), raw.keySet());
        assertEquals(List.of("A_SYN", "Z_SYN"), cancelled.items().stream().map(OrderItemResponse::testCode).toList());
    }

    @Test
    void linkingAnExistingStaffOrderChangesVisibilityThroughThePatientAccountLinkOnly() throws Exception {
        var order = create(unlinked, first);
        error(mvc.perform(bearer(get("/api/orders/me/" + order.id()), Role.PATIENT)), 404, "ORDER_NOT_FOUND", null);
        jdbc.update("UPDATE patients SET user_id=NULL WHERE id=?", own.getId());
        jdbc.update("UPDATE patients SET user_id=? WHERE id=?", actors.get(Role.PATIENT).getId(), unlinked.getId());
        assertEquals(List.of(order.id()), page().content().stream().map(OrderSummaryResponse::id).toList());
        assertEquals(unlinked.getId(), detail(order.id()).patientId());
    }

    @Test
    void allReadRoleAndTransportBoundariesAndStoredAccountChecksAreEnforced() throws Exception {
        var order = create(own, first);
        for (Role role : List.of(Role.ADMIN, Role.RECEPTIONIST, Role.LAB_TECHNICIAN)) {
            error(mvc.perform(bearer(get("/api/orders/me"), role)), 403, "FORBIDDEN", null);
            error(mvc.perform(bearer(get("/api/orders/me/" + order.id()), role)), 403, "FORBIDDEN", null);
            assertEquals("FORBIDDEN", assertThrows(OrderException.class, () -> reads.listMe(actor(role), new OrderQueryRequest(null, null, 0, 20, null))).getCode());
        }
        mvc.perform(get("/api/orders/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/orders/me/" + order.id()).header("Authorization", "Bearer invalid")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/orders/me/" + order.id()).cookie(new Cookie("access_token", tokens.get(Role.PATIENT)))).andExpect(status().isOk());
        mvc.perform(get("/api/orders/me/" + order.id()).cookie(new Cookie("access_token", tokens.get(Role.ADMIN)))
                .header("Authorization", "Bearer " + tokens.get(Role.PATIENT))).andExpect(status().isOk());
        for (String path : List.of("/api/orders", "/api/orders/" + order.id()))
            mvc.perform(bearer(get(path), Role.PATIENT)).andExpect(status().isForbidden());
        jdbc.update("UPDATE users SET role='ADMIN' WHERE id=?", actors.get(Role.PATIENT).getId());
        assertEquals("FORBIDDEN", assertThrows(OrderException.class, () -> reads.getMe(actor(Role.PATIENT), order.id().toString())).getCode());
        jdbc.update("UPDATE users SET role='PATIENT',enabled=false WHERE id=?", actors.get(Role.PATIENT).getId());
        assertEquals("UNAUTHORIZED", assertThrows(OrderException.class, () -> reads.getMe(actor(Role.PATIENT), order.id().toString())).getCode());
        mvc.perform(bearer(get("/api/orders/me"), Role.PATIENT)).andExpect(status().isUnauthorized());
    }

    @Test
    void queryAndPathValidationUsesDocumentedFieldsAndRejectsRepeatedKeys() throws Exception {
        for (var entry : Map.of("search", "x".repeat(31), "page", "2147483648", "size", "0", "status", "pending", "sort", "totalAmount,asc").entrySet())
            error(mvc.perform(bearer(get("/api/orders/me").param(entry.getKey(), entry.getValue()), Role.PATIENT)), 400, "VALIDATION_ERROR", entry.getKey());
        for (var entry : Map.of("search", "", "page", "0", "size", "20", "status", "PENDING", "sort", "createdAt,desc").entrySet())
            error(mvc.perform(bearer(get("/api/orders/me").param(entry.getKey(), entry.getValue(), entry.getValue()), Role.PATIENT)), 400, "VALIDATION_ERROR", entry.getKey());
        for (String id : List.of("bad", "1-1-1-1-1", "00000000-0000-0000-0000-00000000000G"))
            error(mvc.perform(bearer(get("/api/orders/me/" + id), Role.PATIENT)), 400, "VALIDATION_ERROR", "id");
        var created = create(own, first);
        mvc.perform(bearer(get("/api/orders/me/" + created.id().toString().toUpperCase(Locale.ROOT)), Role.PATIENT)).andExpect(status().isOk());
    }

    @Test
    void pageAggregationPreservesTheMaximumExactTotalAcrossOneHundredItems() throws Exception {
        List<LabTest> maximum = new ArrayList<>();
        for (int i = 0; i < 100; i++)
            maximum.add(tests.saveAndFlush(new LabTest("MAX_READ_" + i, "Synthetic maximum test " + i,
                    null, new BigDecimal("9999999999.99"), "SYNTHETIC", null)));
        var order = create(own, maximum.toArray(LabTest[]::new));
        assertEquals(100, page().content().getFirst().testCount());
        assertEquals(new BigDecimal("999999999999.00"), page().content().getFirst().totalAmount());
        assertEquals(new BigDecimal("999999999999.00"), detail(order.id()).totalAmount());
    }
}
