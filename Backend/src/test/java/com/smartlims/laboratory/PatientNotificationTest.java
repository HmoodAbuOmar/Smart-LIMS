package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.appointments.dto.AppointmentRequests;
import com.smartlims.laboratory.dto.LaboratoryQuery;
import com.smartlims.notifications.dto.NotificationResponse;
import com.smartlims.notifications.service.*;
import com.smartlims.orders.dto.*;
import com.smartlims.patients.dto.LinkPatientRequest;
import com.smartlims.results.dto.ResultRequests;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.core.type.TypeReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PatientNotificationTest extends MedicalHistoryTestSupport {
    static final String URL = "/api/notifications/me";
    @Autowired
    NotificationService inbox;
    @Autowired
    NotificationPublisher publisher;
    @Autowired
    com.smartlims.orders.service.OrderCancellationService cancellation;
    @Autowired
    com.smartlims.appointments.service.AppointmentActionService actions;
    @Autowired
    com.smartlims.patients.service.PatientService profiles;

    LaboratoryQuery.PageBody<NotificationResponse> list(String... query) throws Exception {
        var request = get(URL);
        for (int i = 0; i < query.length; i += 2)
            request.param(query[i], query[i + 1]);
        var response = mvc.perform(bearer(request, Role.PATIENT)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse();
        return json.readValue(response.getContentAsByteArray(), new TypeReference<>() {
        });
    }

    long count() {
        return inbox.unreadCount(actor(Role.PATIENT));
    }

    long events(String type) {
        return jdbc.queryForObject("SELECT count(*) FROM patient_notifications WHERE event_type=?", Long.class, type);
    }

    NotificationResponse mark(UUID id) throws Exception {
        var response = mvc.perform(bearer(post(URL + "/" + id + "/read"), Role.PATIENT).contentType("application/json").content("{}"))
                .andExpect(status().isOk()).andReturn().getResponse();
        return json.readValue(response.getContentAsByteArray(), NotificationResponse.class);
    }

    int all() throws Exception {
        var response = mvc.perform(bearer(post(URL + "/read-all"), Role.PATIENT).contentType("application/json").content("{}"))
                .andExpect(status().isOk()).andReturn().getResponse();
        return json.readValue(response.getContentAsByteArray(), NotificationResponse.MarkAllResult.class).updatedCount();
    }

    @Test
    void emptyInboxSystemFilterAndDashboardUseRealZeroWithoutBackfill() throws Exception {
        assertEquals(0, list().totalElements());
        assertTrue(list().first());
        assertTrue(list().last());
        assertEquals(0, list().totalPages());
        assertEquals(0, count());
        assertEquals(0, all());
        assertEquals(0, list("category", "SYSTEM").totalElements());
        mvc.perform(bearer(get(URL + "/unread-count"), Role.PATIENT)).andExpect(jsonPath("$.unreadCount").value(0));
        mvc.perform(bearer(get("/api/patients/me/dashboard"), Role.PATIENT)).andExpect(jsonPath("$.notifications.available").value(true))
                .andExpect(jsonPath("$.notifications.unreadCount").value(0));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM patient_notifications", Integer.class));
    }

    @Test
    void realSelfAndStaffOrdersNotifyOnceAcrossCreationReplayAndCancellationRetry() throws Exception {
        var key = keys();
        var request = new CreateSelfOrderRequest(List.of(first.getId().toString()));
        var created = creation.createMe(actor(Role.PATIENT), request, key).order();
        assertEquals(created.id(), creation.createMe(actor(Role.PATIENT), request, key).order().id());
        create(other, first);
        create(unlinked, first);
        assertEquals(3, events("ORDER_CREATED"));
        assertEquals(1, count());
        cancellation.cancel(actor(Role.PATIENT), created.id().toString(), new CancelOrderRequest(null));
        cancellation.cancel(actor(Role.PATIENT), created.id().toString(), new CancelOrderRequest(null));
        assertEquals(1, events("ORDER_CANCELLED"));
        assertEquals(2, count());
        for (var row : list().content()) {
            assertEquals("ORDERS", row.category());
            assertEquals(created.id(), row.orderId());
            assertFalse(row.read());
            assertNull(row.readAt());
            assertNull(row.resultId());
            assertNull(row.appointmentId());
            mvc.perform(bearer(get(row.navigationUrl()), Role.PATIENT)).andExpect(status().isOk());
        }
    }

    @Test
    void categoryUnreadFiltersStablePaginationAndDistantPagesUseOwnedTotals() throws Exception {
        for (int i = 0; i < 5; i++)
            create(own, first);
        var order = create(own, free);
        appointment(order, 1, 2);
        create(other, first);
        // Equal creation instants exercise deterministic UUID ordering across pages.
        jdbc.update("UPDATE patient_notifications SET created_at='2026-01-01T00:00:00Z'");
        var expected = jdbc.queryForList("SELECT n.id FROM patient_notifications n JOIN patients p ON p.id=n.patient_id WHERE p.user_id=? ORDER BY n.created_at DESC,n.id", UUID.class, actors.get(Role.PATIENT).getId());
        var ids = new ArrayList<UUID>();
        for (int page = 0; page < 4; page++) {
            var result = list("page", Integer.toString(page), "size", "2");
            assertEquals(7, result.totalElements());
            assertEquals(4, result.totalPages());
            result.content().forEach(n -> ids.add(n.id()));
        }
        assertEquals(expected, ids);
        assertEquals(7, new HashSet<>(ids).size());
        assertEquals(6, list("category", "ORDERS").totalElements());
        assertEquals(1, list("category", "APPOINTMENTS").totalElements());
        assertEquals(0, list("category", "RESULTS").totalElements());
        assertEquals(0, list("category", "SYSTEM").totalElements());
        var appt = list("category", "APPOINTMENTS").content().getFirst();
        mark(appt.id());
        assertEquals(0, list("category", "APPOINTMENTS", "unread", "true").totalElements());
        assertEquals(1, list("category", "APPOINTMENTS", "unread", "false").totalElements());
        assertEquals(6, count());
        assertEquals(6, list("unread", "true").totalElements());
        var distant = list("page", "2147483647", "size", "100");
        assertTrue(distant.content().isEmpty());
        assertEquals(7, distant.totalElements());
        assertTrue(distant.last());
    }

    @Test
    void oneAndAllReadAreIdempotentPreserveTimestampsAndUpdateDashboard() throws Exception {
        create(own, first);
        create(own, free);
        create(other, first);
        var initial = list().content().getFirst();
        var once = mark(initial.id());
        var again = mark(initial.id());
        assertTrue(once.read());
        assertNotNull(once.readAt());
        assertEquals(once, again);
        assertEquals(initial.createdAt(), once.createdAt());
        assertEquals(initial.navigationUrl(), once.navigationUrl());
        assertEquals(1, count());
        assertEquals(1, all());
        assertEquals(0, all());
        assertEquals(0, count());
        assertEquals(once.readAt(), mark(initial.id()).readAt());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM patient_notifications WHERE patient_id=? AND read_at IS NULL", Integer.class, other.getId()));
        mvc.perform(bearer(get("/api/patients/me/dashboard"), Role.PATIENT)).andExpect(jsonPath("$.notifications.unreadCount").value(0));
        create(own, first);
        assertEquals(1, count());
        mvc.perform(bearer(get("/api/patients/me/dashboard"), Role.PATIENT)).andExpect(jsonPath("$.notifications.unreadCount").value(1));
    }

    @Test
    void concurrentMarkOneAndMarkAllRetainFirstReadAndNeverTouchOtherPatients() throws Exception {
        create(own, first);
        create(own, free);
        create(other, first);
        UUID id = list().content().getFirst().id();
        try (var pool = Executors.newFixedThreadPool(3)) {
            var gate = new CountDownLatch(1);
            var tasks = new ArrayList<Future<?>>();
            tasks.add(pool.submit(() -> {
                gate.await();
                return inbox.markRead(actor(Role.PATIENT), id.toString());
            }));
            tasks.add(pool.submit(() -> {
                gate.await();
                return inbox.markRead(actor(Role.PATIENT), id.toString());
            }));
            tasks.add(pool.submit(() -> {
                gate.await();
                return inbox.markAllRead(actor(Role.PATIENT));
            }));
            gate.countDown();
            for (var task : tasks)
                task.get(20, TimeUnit.SECONDS);
        }
        var firstRead = mark(id);
        assertEquals(firstRead, mark(id));
        assertEquals(0, count());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM patient_notifications WHERE patient_id=? AND read_at IS NULL", Integer.class, other.getId()));
    }

    @Test
    void rolesForeignIdsStoredEligibilityAndProfileLinkingAreEnforced() throws Exception {
        create(other, first);
        UUID foreign = jdbc.queryForObject("SELECT id FROM patient_notifications WHERE patient_id=?", UUID.class, other.getId());
        mvc.perform(get(URL)).andExpect(status().isUnauthorized());
        for (Role role : List.of(Role.ADMIN, Role.RECEPTIONIST, Role.LAB_TECHNICIAN)) {
            mvc.perform(bearer(get(URL), role)).andExpect(status().isForbidden());
            mvc.perform(bearer(get(URL + "/unread-count"), role)).andExpect(status().isForbidden());
            mvc.perform(bearer(post(URL + "/read-all"), role).contentType("application/json").content("{}")).andExpect(status().isForbidden());
            mvc.perform(bearer(post(URL + "/" + foreign + "/read"), role).contentType("application/json").content("{}")).andExpect(status().isForbidden());
        }
        for (UUID id : List.of(foreign, UUID.randomUUID()))
            error(mvc.perform(bearer(post(URL + "/" + id + "/read"), Role.PATIENT)
                    .contentType("application/json").content("{}")), 404, "NOTIFICATION_NOT_FOUND", null);
        assertEquals(0, list().totalElements());
        assertEquals(0, all());
        assertThrows(com.smartlims.laboratory.exception.LaboratoryException.class,
                () -> inbox.unreadCount(actor(actors.get(Role.ADMIN).getId(), Role.PATIENT)));
        jdbc.update("UPDATE users SET enabled=false WHERE id=?", actors.get(Role.PATIENT).getId());
        mvc.perform(bearer(get(URL), Role.PATIENT)).andExpect(status().isUnauthorized());
        jdbc.update("UPDATE users SET enabled=true WHERE id=?", actors.get(Role.PATIENT).getId());
        jdbc.update("UPDATE patients SET user_id=null WHERE id=?", own.getId());
        error(mvc.perform(bearer(get(URL), Role.PATIENT)), 404, "PATIENT_PROFILE_NOT_LINKED", null);
        error(mvc.perform(bearer(get(URL + "/unread-count"), Role.PATIENT)), 404, "PATIENT_PROFILE_NOT_LINKED", null);
        error(mvc.perform(bearer(post(URL + "/read-all"), Role.PATIENT).contentType("application/json").content("{}")), 404, "PATIENT_PROFILE_NOT_LINKED", null);
    }

    @Test
    void secureLinkingExposesOnlyRealNewProfileEventsWithoutCreatingNotifications() throws Exception {
        create(own, first);
        var target = create(unlinked, free);
        jdbc.update("UPDATE patients SET user_id=null WHERE id=?", own.getId());
        var claim = profiles.issueLinkToken(actor(Role.RECEPTIONIST), unlinked.getId().toString());
        profiles.linkMe(actor(Role.PATIENT), new LinkPatientRequest(claim.token()));
        assertEquals(1, count());
        assertEquals(target.id(), list().content().getFirst().orderId());
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM patient_notifications", Integer.class));
    }

    @Test
    void strictQueriesJsonAndCookieWriteCsrfFollowExistingRules() throws Exception {
        String[][] invalid = {{"category", "orders"}, {"category", ""}, {"unread", "yes"}, {"page", "-1"}, {"size", "101"}, {"patientId", own.getId().toString()}};
        for (var pair : invalid)
            error(mvc.perform(bearer(get(URL).param(pair[0], pair[1]), Role.PATIENT)), 400, "VALIDATION_ERROR", pair[0]);
        for (String field : List.of("category", "unread", "page", "size"))
            error(mvc.perform(bearer(get(URL).param(field, "x", "y"), Role.PATIENT)), 400, "VALIDATION_ERROR", field);
        error(mvc.perform(bearer(get(URL + "/unread-count").param("category", "ORDERS"), Role.PATIENT)), 400, "VALIDATION_ERROR", "category");
        error(mvc.perform(bearer(post(URL + "/bad/read"), Role.PATIENT).contentType("application/json").content("{}")), 400, "VALIDATION_ERROR", "id");
        for (String body : List.of("{\"read\":true}", "[]", "null"))
            mvc.perform(bearer(post(URL + "/read-all"), Role.PATIENT).contentType("application/json").content(body)).andExpect(status().isBadRequest());
        mvc.perform(bearer(post(URL + "/read-all"), Role.PATIENT).contentType("application/json")).andExpect(status().isBadRequest());
        var cookie = new jakarta.servlet.http.Cookie("access_token", tokens.get(Role.PATIENT));
        mvc.perform(get(URL).cookie(cookie)).andExpect(status().isOk());
        mvc.perform(post(URL + "/read-all").cookie(cookie).contentType("application/json").content("{}")).andExpect(status().isForbidden());
        var csrf = mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        mvc.perform(post(URL + "/read-all").cookie(cookie, csrf).header("X-XSRF-TOKEN", csrf.getValue())
                .contentType("application/json").content("{}")).andExpect(status().isOk());
    }

    @Test
    void appointmentBookingMovesNoOpsAndDirectCancellationGenerateExactlyTheirTransitions() throws Exception {
        var order = create(own, first);
        var a = appointment(order, 1, 3);
        var originalKey = jdbc.queryForObject("SELECT idempotency_key FROM appointments WHERE id=?", UUID.class, a.id());
        bookingService.book(actor(Role.ADMIN), new AppointmentRequests.Book(order.id().toString(), a.typeId().toString(), a.slotId().toString()), List.of(originalKey.toString()));
        assertEquals(1, events("APPOINTMENT_CONFIRMED"));
        var start = a.startsAt().plusSeconds(3600);
        var target = schedule.createSlot(actor(Role.RECEPTIONIST), new AppointmentRequests.SlotCreate(start.toString(), start.plusSeconds(1800).toString(), 3, true));
        var move = new AppointmentRequests.Move(target.id().toString(), a.version());
        var moved = actions.move(actor(Role.PATIENT), a.id().toString(), move);
        actions.move(actor(Role.PATIENT), a.id().toString(), move); // retry
        actions.move(actor(Role.PATIENT), a.id().toString(), new AppointmentRequests.Move(target.id().toString(), moved.version())); // no-op
        var back = actions.move(actor(Role.PATIENT), a.id().toString(), new AppointmentRequests.Move(a.slotId().toString(), moved.version()));
        assertEquals(2, events("APPOINTMENT_RESCHEDULED"));
        actions.cancel(actor(Role.PATIENT), a.id().toString(), new AppointmentRequests.Cancel(null));
        actions.cancel(actor(Role.PATIENT), a.id().toString(), new AppointmentRequests.Cancel(null));
        assertEquals(1, events("APPOINTMENT_CANCELLED"));
        assertNotNull(back);
        for (var row : list("category", "APPOINTMENTS").content()) {
            assertEquals(a.id(), row.appointmentId());
            assertNull(row.resultId());
            mvc.perform(bearer(get(row.navigationUrl()), Role.PATIENT)).andExpect(status().isOk());
        }
    }

    @Test
    void orderCascadeCheckInVisitCompletionAndNoShowNotifyOnlyActualChanges() throws Exception {
        var cancelledOrder = create(own, first);
        appointment(cancelledOrder, 1, 3);
        cancellation.cancel(actor(Role.PATIENT), cancelledOrder.id().toString(), new CancelOrderRequest(null));
        cancellation.cancel(actor(Role.PATIENT), cancelledOrder.id().toString(), new CancelOrderRequest(null));
        assertEquals(1, events("APPOINTMENT_CANCELLED"));
        var order = create(own, first);
        var a = appointment(order, 2, 3);
        var visit = arrive(order, a.id());
        arrive(order, null); // second actual visit must not repeat ORDER_IN_PROGRESS
        assertEquals(1, events("ORDER_IN_PROGRESS"));
        assertEquals(1, events("APPOINTMENT_CHECKED_IN"));
        close(visit);
        close(visit);
        assertEquals(1, events("APPOINTMENT_COMPLETED"));
        var missed = appointment(create(own, free), 3, 3);
        jdbc.update("UPDATE appointment_slots SET starts_at=CURRENT_TIMESTAMP-interval '2 hours',ends_at=CURRENT_TIMESTAMP-interval '1 hour' WHERE id=?", missed.slotId());
        visitService.noShow(actor(Role.RECEPTIONIST), missed.id().toString(), new com.smartlims.visits.dto.VisitRequests.Revision(missed.version()));
        visitService.noShow(actor(Role.RECEPTIONIST), missed.id().toString(), new com.smartlims.visits.dto.VisitRequests.Revision(missed.version()));
        assertEquals(1, events("APPOINTMENT_NO_SHOW"));
    }

    @Test
    void onlySuccessfulPublicationAndPublishedCorrectionsNotifyWithActualNavigationIds() throws Exception {
        var f = measurement(own, first, "2026-10-10T07:00:00Z", "1", "NORMAL", true);
        assertEquals(0, list("category", "RESULTS").totalElements());
        var approved = publicationService.approve(actor(reviewerId, Role.ADMIN), f.result().id().toString(), new ResultRequests.Revision(f.result().version()));
        assertEquals(0, list("category", "RESULTS").totalElements());
        var published = publicationService.publish(actor(reviewerId, Role.ADMIN), approved.id().toString(), new ResultRequests.Revision(approved.version()));
        publicationService.publish(actor(reviewerId, Role.ADMIN), published.id().toString(), new ResultRequests.Revision(published.version()));
        assertEquals(1, events("RESULT_PUBLISHED"));
        assertEquals(1, events("ORDER_COMPLETED"));
        var working = publicationService.correct(actor(Role.LAB_TECHNICIAN), published.id().toString(), new ResultRequests.Correction("Private correction reason"), keys()).result();
        var corrected = fill(working, List.of(f.sample().id()), "2026-10-10T07:00:00Z", "2", "HIGH", null);
        assertEquals(1, list("category", "RESULTS").totalElements());
        var next = publish(corrected);
        assertEquals(1, events("RESULT_CORRECTED"));
        assertEquals(1, events("ORDER_COMPLETED"));
        var rows = list("category", "RESULTS").content();
        assertEquals(2, rows.size());
        assertEquals(next.id(), rows.getFirst().resultId());
        for (var row : rows) {
            assertEquals(f.order().id(), row.orderId());
            assertEquals(published.orderItemId(), row.orderItemId());
            assertFalse(row.message().contains("Private correction reason"));
            mvc.perform(bearer(get(row.navigationUrl()), Role.PATIENT)).andExpect(status().isOk());
        }
    }

    @Test
    void rolledBackWorkflowAndDuplicatePublisherCallsCannotLeaveExtraNotifications() throws Exception {
        var order = create(own, first);
        long before = count();
        new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
            cancellation.cancel(actor(Role.PATIENT), order.id().toString(), new CancelOrderRequest(null));
            assertEquals(before + 1, count());
            tx.setRollbackOnly();
        });
        assertEquals(before, count());
        assertEquals(0, events("ORDER_CANCELLED"));
        assertEquals("PENDING", orders.findById(order.id()).orElseThrow().getStatus().name());
        var id = list().content().getFirst().id();
        var read = mark(id);
        new TransactionTemplate(transactionManager).executeWithoutResult(tx -> publisher.order(orders.findById(order.id()).orElseThrow()));
        assertEquals(1, events("ORDER_CREATED"));
        assertEquals(read, mark(id));
        assertThrows(org.springframework.transaction.IllegalTransactionStateException.class,
                () -> publisher.order(orders.findById(order.id()).orElseThrow()));
    }

    @Test
    void publicationRollbackRestoresPriorVisibilityAndCreatesNoResultNotification() throws Exception {
        var f = measurement(own, first, "2026-10-10T07:00:00Z", "1", "NORMAL", true);
        var approved = publicationService.approve(actor(reviewerId, Role.ADMIN), f.result().id().toString(), new ResultRequests.Revision(f.result().version()));
        long before = count();
        new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
            publicationService.publish(actor(reviewerId, Role.ADMIN), approved.id().toString(), new ResultRequests.Revision(approved.version()));
            tx.setRollbackOnly();
        });
        assertEquals(before, count());
        assertEquals(0, events("RESULT_PUBLISHED"));
        assertEquals(0, events("ORDER_COMPLETED"));
        assertEquals(0, list("category", "RESULTS").totalElements());
    }

    @Test
    void defensiveVisibilityHidesCorruptForeignTargetsAndUnpublishedResultReferences() throws Exception {
        var draft = measurement(own, first, "2026-10-10T07:00:00Z", "1", "NORMAL", true).result();
        create(other, first);
        UUID foreignOrder = jdbc.queryForObject("SELECT id FROM test_orders WHERE patient_id=? LIMIT 1", UUID.class, other.getId());
        jdbc.update("INSERT INTO patient_notifications(patient_id,order_id,result_id,category,event_type,event_key,title,message) VALUES (?,?,?,'RESULTS','RESULT_PUBLISHED','synthetic-unpublished','Synthetic','Synthetic')",
                own.getId(), draft.orderId(), draft.id());
        jdbc.update("INSERT INTO patient_notifications(patient_id,order_id,category,event_type,event_key,title,message) VALUES (?,?,'ORDERS','ORDER_CREATED','synthetic-foreign','Synthetic','Synthetic')", own.getId(), foreignOrder);
        var hidden = jdbc.queryForList("SELECT id FROM patient_notifications WHERE event_key LIKE 'synthetic-%'", UUID.class);
        long visible = count();
        assertEquals(2, visible); // own order + processing transition only
        assertEquals(visible, list().totalElements());
        assertEquals(0, list("category", "RESULTS").totalElements());
        for (UUID id : hidden)
            error(mvc.perform(bearer(post(URL + "/" + id + "/read"), Role.PATIENT).contentType("application/json").content("{}")), 404, "NOTIFICATION_NOT_FOUND", null);
        assertEquals(2, all());
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM patient_notifications WHERE event_key LIKE 'synthetic-%' AND read_at IS NULL", Integer.class));
    }

    @Test
    void concurrentOrderRetriesProduceExactlyOneDurableEvent() throws Exception {
        var key = keys();
        var request = new CreateSelfOrderRequest(List.of(first.getId().toString()));
        try (var pool = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            var a = pool.submit(() -> {
                gate.await();
                return creation.createMe(actor(Role.PATIENT), request, key);
            });
            var b = pool.submit(() -> {
                gate.await();
                return creation.createMe(actor(Role.PATIENT), request, key);
            });
            gate.countDown();
            assertEquals(a.get(20, TimeUnit.SECONDS).order().id(), b.get(20, TimeUnit.SECONDS).order().id());
        }
        assertEquals(1, events("ORDER_CREATED"));
        assertEquals(1, count());
    }

    @Test
    void notificationInsertFailureRollsBackNewOrderAndItsItems() {
        jdbc.execute("CREATE FUNCTION synthetic_reject_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic notification failure' USING ERRCODE='23514'; END $$");
        jdbc.execute("CREATE TRIGGER synthetic_reject_notification BEFORE INSERT ON patient_notifications FOR EACH ROW EXECUTE FUNCTION synthetic_reject_notification()");
        try {
            assertThrows(RuntimeException.class, () -> creation.createMe(actor(Role.PATIENT),
                    new CreateSelfOrderRequest(List.of(first.getId().toString())), keys()));
            assertEquals(0, orders.count());
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM order_items", Integer.class));
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM patient_notifications", Integer.class));
        } finally {
            jdbc.execute("DROP TRIGGER synthetic_reject_notification ON patient_notifications");
            jdbc.execute("DROP FUNCTION synthetic_reject_notification()");
        }
    }

    @Test
    void bookingRollbackLeavesNoEventAndRetryAfterRollbackCreatesOne() {
        var order = create(own, first);
        var type = schedule.saveType(actor(Role.ADMIN), null, new AppointmentRequests.Type("SYN_ROLLBACK", "Synthetic booking", true));
        var start = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS).plusSeconds(86400);
        var slot = schedule.createSlot(actor(Role.RECEPTIONIST), new AppointmentRequests.SlotCreate(start.toString(), start.plusSeconds(1800).toString(), 2, true));
        var request = new AppointmentRequests.Book(order.id().toString(), type.id().toString(), slot.id().toString());
        var key = keys();
        new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
            bookingService.book(actor(Role.PATIENT), request, key);
            tx.setRollbackOnly();
        });
        assertEquals(0, events("APPOINTMENT_CONFIRMED"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM appointments", Integer.class));
        bookingService.book(actor(Role.PATIENT), request, key);
        assertEquals(1, events("APPOINTMENT_CONFIRMED"));
        assertEquals(2, count());
    }
}
