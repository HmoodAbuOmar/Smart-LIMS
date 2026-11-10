package com.smartlims.laboratory;

import com.smartlims.auth.dto.*;
import com.smartlims.auth.entity.*;
import com.smartlims.auth.service.AccountManagementService;
import com.smartlims.appointments.dto.*;
import com.smartlims.appointments.service.AppointmentActionService;
import com.smartlims.labtests.dto.*;
import com.smartlims.labtests.service.*;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.service.*;
import com.smartlims.orders.dto.*;
import com.smartlims.orders.service.OrderCancellationService;
import com.smartlims.patients.dto.*;
import com.smartlims.patients.entity.PatientGender;
import com.smartlims.patients.service.PatientService;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AdminAuditWorkflowTest extends LaboratoryTestSupport {
    @Autowired LabTestService catalog;
    @Autowired ReferenceRangeService ranges;
    @Autowired PatientService patientService;
    @Autowired AccountManagementService accounts;
    @Autowired AdminActivityService activity;
    @Autowired AuditPublisher audit;
    @Autowired AppointmentActionService appointmentActions;
    @Autowired OrderCancellationService cancellations;

    LaboratoryQuery query(String... pairs) {
        var values = new LinkedHashMap<String, List<String>>();
        for (int n = 0; n < pairs.length; n += 2) values.put(pairs[n], List.of(pairs[n + 1]));
        return LaboratoryQuery.of(values, "fromDate", "toDate", "actorId", "action", "search");
    }
    long count() { return jdbc.queryForObject("SELECT count(*) FROM audit_logs", Long.class); }
    LabTestRequest definition(String code, String name) {
        return new LabTestRequest(code, name, "SENSITIVE_AUDIT_PAYLOAD", BigDecimal.ONE, "ILS", "SYNTHETIC", "SENSITIVE_AUDIT_PAYLOAD", List.of());
    }

    @Test
    void catalogParametersRangesTypesAndSlotsRecordSafeMetadataOnlyForRealChanges() {
        var admin = actor(Role.ADMIN);
        var test = catalog.create(admin, definition("AUDIT_CFG", "SENSITIVE_AUDIT_PAYLOAD"));
        var body = new LabTestDetailsRequest(test.code(), test.name(), test.description(), test.price(), "ILS", test.sampleType(), test.preparationInstructions());
        catalog.updateDetails(admin, test.id().toString(), body); // Semantic no-op.
        assertEquals(1, count());
        catalog.updateDetails(admin, test.id().toString(), new LabTestDetailsRequest(test.code(), "Changed", test.description(), test.price(), "ILS", test.sampleType(), test.preparationInstructions()));
        catalog.update(admin, test.id().toString(), definition(test.code(), "Replaced"));
        catalog.changeStatus(admin, test.id().toString(), new LabTestStatusRequest(false));
        catalog.changeStatus(admin, test.id().toString(), new LabTestStatusRequest(false));
        catalog.changeStatus(admin, test.id().toString(), new LabTestStatusRequest(true));
        var parameter = parameterService.save(admin, test.id().toString(), null,
                new TestParameterRequest("AUD", "SENSITIVE_AUDIT_PAYLOAD", "NUMERIC", null, null, 0, false, true, null));
        var changed = parameterService.save(admin, test.id().toString(), parameter.id().toString(),
                new TestParameterRequest("AUD", "Changed", "NUMERIC", null, null, 1, false, false, parameter.version()));
        parameterService.save(admin, test.id().toString(), parameter.id().toString(),
                new TestParameterRequest("AUD", "Changed", "NUMERIC", null, null, 1, false, false, changed.version()));
        ranges.create(admin, test.id().toString(), parameter.id().toString(), new ReferenceRangeRequest("ANY", null, null, BigDecimal.ZERO, BigDecimal.TEN, null, null));
        var type = schedule.saveType(admin, null, new AppointmentRequests.Type("AUD", "SENSITIVE_AUDIT_PAYLOAD", true));
        schedule.saveType(admin, type.id().toString(), new AppointmentRequests.Type("AUD", "SENSITIVE_AUDIT_PAYLOAD", true));
        schedule.saveType(admin, type.id().toString(), new AppointmentRequests.Type("AUD", "Changed", false));
        var start = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS).plusSeconds(86400);
        var slot = schedule.createSlot(actor(Role.RECEPTIONIST), new AppointmentRequests.SlotCreate(start.toString(), start.plusSeconds(600).toString(), 2, true));
        schedule.updateSlot(admin, slot.id().toString(), new AppointmentRequests.SlotUpdate(3, true));
        schedule.updateSlot(admin, slot.id().toString(), new AppointmentRequests.SlotUpdate(3, false));
        schedule.updateSlot(admin, slot.id().toString(), new AppointmentRequests.SlotUpdate(3, false));
        assertEquals(13, count());
        var page = activity.audit(admin, query("size", "100"));
        assertEquals(count(), page.totalElements());
        assertTrue(page.actions().containsAll(List.of("CREATE", "UPDATE", "ACTIVATE", "DEACTIVATE")));
        assertFalse(jdbc.queryForList("SELECT * FROM audit_logs").toString().contains("SENSITIVE_AUDIT_PAYLOAD"));
        for (var event : page.content()) {
            assertNotNull(event.id()); assertNotNull(event.entityId()); assertNotNull(event.actor().id());
            assertNotNull(event.actor().name()); assertNotNull(event.recordedAt()); assertNotNull(event.occurredAt());
            assertFalse(event.details().contains("SENSITIVE_AUDIT_PAYLOAD"));
        }
        assertEquals(1, activity.audit(admin, query("action", "CREATE", "actorId", actors.get(Role.RECEPTIONIST).getId().toString(), "search", slot.id().toString())).totalElements());
        assertEquals(0, activity.audit(admin, query("search", "SENSITIVE_AUDIT_PAYLOAD")).totalElements());
    }

    @Test
    void staffAccountAndPatientMutationsPreservePrivacyNoOpsAndDeletedEntityHistory() {
        var admin = actor(Role.ADMIN);
        var invited = accounts.create(admin, new CreateAccountRequest("Private target name", "private-target@example.invalid", "audit_target", "000002", Role.RECEPTIONIST));
        accounts.update(admin, invited.id(), new UpdateAccountRequest("Changed target", invited.email(), null, null));
        accounts.changeRole(admin, invited.id(), Role.LAB_TECHNICIAN);
        accounts.changeRole(admin, invited.id(), Role.LAB_TECHNICIAN);
        accounts.setBlocked(admin, invited.id(), true); accounts.setBlocked(admin, invited.id(), true);
        accounts.setBlocked(admin, invited.id(), false);
        accounts.sendSetPassword(admin, invited.id());
        accounts.delete(admin, invited.id());
        var profile = patientService.create(admin, new CreatePatientRequest("Private patient name", LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000002", "Private address"));
        patientService.update(admin, profile.id().toString(), new UpdatePatientRequest("Private patient edit", LocalDate.of(2000, 1, 1), PatientGender.UNKNOWN, "000003", null));
        patientService.issueLinkToken(admin, profile.id().toString());
        assertEquals(10, count());
        var stored = jdbc.queryForList("SELECT * FROM audit_logs").toString();
        for (String privateText : List.of("Private target", "private-target@", "Private patient", "Private address", "000003")) assertFalse(stored.contains(privateText));
        var page = activity.audit(admin, query("search", invited.id().toString(), "size", "100"));
        assertEquals(7, page.totalElements());
        assertEquals("DELETE", page.content().getFirst().action());
        assertTrue(page.actions().containsAll(List.of("INVITE", "ROLE_CHANGE", "BLOCK", "UNBLOCK", "DELETE", "INVITATION_SENT", "LINK_ISSUED")));
        assertFalse(users.existsById(invited.id()));
    }

    @Test
    void orderAndAppointmentReplaysAddNothingAndCancellationCascadeRecordsEachChangedEntity() {
        var admin = actor(Role.ADMIN);
        var body = new CreateStaffOrderRequest(own.getId().toString(), List.of(first.getId().toString()));
        var key = List.of(UUID.randomUUID().toString());
        var order = creation.create(admin, body, key).order();
        creation.create(admin, body, key);
        assertEquals(1, count());
        var type = schedule.saveType(admin, null, new AppointmentRequests.Type("AUD", "Synthetic", true));
        var start = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS).plusSeconds(86400);
        var slot = schedule.createSlot(admin, new AppointmentRequests.SlotCreate(start.toString(), start.plusSeconds(600).toString(), 2, true));
        var next = schedule.createSlot(admin, new AppointmentRequests.SlotCreate(start.plusSeconds(3600).toString(), start.plusSeconds(4200).toString(), 2, true));
        var booking = new AppointmentRequests.Book(order.id().toString(), type.id().toString(), slot.id().toString());
        var bookingKey = List.of(UUID.randomUUID().toString());
        var a = bookingService.book(admin, booking, bookingKey).appointment();
        bookingService.book(admin, booking, bookingKey);
        appointmentActions.move(admin, a.id().toString(), new AppointmentRequests.Move(a.slotId().toString(), a.version()));
        appointmentActions.move(admin, a.id().toString(), new AppointmentRequests.Move(next.id().toString(), a.version()));
        appointmentActions.move(admin, a.id().toString(), new AppointmentRequests.Move(next.id().toString(), a.version()));
        assertEquals(6, count());
        cancellations.cancel(admin, order.id().toString(), new CancelOrderRequest("SENSITIVE_AUDIT_PAYLOAD"));
        cancellations.cancel(admin, order.id().toString(), new CancelOrderRequest("SENSITIVE_AUDIT_PAYLOAD"));
        assertEquals(8, count());
        assertEquals(1, activity.audit(admin, query("action", "CANCEL", "search", a.id().toString())).totalElements());
        assertEquals(1, activity.audit(admin, query("action", "CANCEL", "search", order.id().toString())).totalElements());
        assertFalse(jdbc.queryForList("SELECT * FROM audit_logs").toString().contains("SENSITIVE_AUDIT_PAYLOAD"));
    }

    @Test
    void rollbackAfterAuditInsertRemovesBusinessAndAuditIncludingDeferredCommitFailure() {
        var tx = new TransactionTemplate(transactionManager);
        tx.executeWithoutResult(status -> {
            catalog.create(actor(Role.ADMIN), definition("AUD_ROLLBACK", "Synthetic"));
            assertEquals(1, count()); // Proves the event was in this source transaction.
            status.setRollbackOnly();
        });
        assertEquals(0, count()); assertFalse(tests.existsByCode("AUD_ROLLBACK"));
        jdbc.execute("CREATE FUNCTION audit_test_deferred_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic deferred failure' USING ERRCODE='23514'; END $$");
        jdbc.execute("CREATE CONSTRAINT TRIGGER audit_test_deferred_failure AFTER INSERT ON lab_tests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION audit_test_deferred_failure()");
        try {
            assertThrows(RuntimeException.class, () -> tx.executeWithoutResult(status -> {
                catalog.create(actor(Role.ADMIN), definition("AUD_DEFERRED", "Synthetic"));
                assertEquals(1, count());
            }));
            assertEquals(0, count()); assertFalse(tests.existsByCode("AUD_DEFERRED"));
        } finally {
            jdbc.execute("DROP TRIGGER audit_test_deferred_failure ON lab_tests");
            jdbc.execute("DROP FUNCTION audit_test_deferred_failure()");
        }
    }

    @Test
    void auditWriteFailureRollsBackSlotAndWholeBulkAccountChanges() {
        jdbc.execute("CREATE FUNCTION audit_test_insert_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure' USING ERRCODE='23514'; END $$");
        jdbc.execute("CREATE TRIGGER audit_test_insert_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_test_insert_failure()");
        try {
            var start = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS).plusSeconds(86400);
            assertThrows(RuntimeException.class, () -> schedule.createSlot(actor(Role.ADMIN), new AppointmentRequests.SlotCreate(start.toString(), start.plusSeconds(600).toString(), 2, true)));
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM appointment_slots", Long.class));
            var ids = List.of(actors.get(Role.RECEPTIONIST).getId(), actors.get(Role.LAB_TECHNICIAN).getId());
            assertThrows(RuntimeException.class, () -> accounts.setBlockedBulk(actor(Role.ADMIN), ids, true));
            for (var id : ids) assertTrue(users.findById(id).orElseThrow().isEnabled());
            assertEquals(0, count());
        } finally {
            jdbc.execute("DROP TRIGGER audit_test_insert_failure ON audit_logs");
            jdbc.execute("DROP FUNCTION audit_test_insert_failure()");
        }
        var ids = List.of(actors.get(Role.RECEPTIONIST).getId(), actors.get(Role.LAB_TECHNICIAN).getId());
        accounts.setBlockedBulk(actor(Role.ADMIN), ids, true);
        accounts.setBlockedBulk(actor(Role.ADMIN), ids, true);
        assertEquals(2, count());
        accounts.setBlockedBulk(actor(Role.ADMIN), ids, false);
        assertEquals(4, count());
    }

    @Test
    void directAppointmentCancelAuditsOnceWhilePatientSelfServiceDoesNotBecomeAnAdminEvent() {
        var order = create(own, first);
        var appointment = appointment(order, 0, 2);
        long before = count();
        appointmentActions.cancel(actor(Role.RECEPTIONIST), appointment.id().toString(), new AppointmentRequests.Cancel("SENSITIVE_AUDIT_PAYLOAD"));
        appointmentActions.cancel(actor(Role.ADMIN), appointment.id().toString(), new AppointmentRequests.Cancel("SENSITIVE_AUDIT_PAYLOAD"));
        assertEquals(before + 1, count());
        assertEquals(1, activity.audit(actor(Role.ADMIN), query("action", "CANCEL", "search", appointment.id().toString())).totalElements());
        creation.createMe(actor(Role.PATIENT), new CreateSelfOrderRequest(List.of(first.getId().toString())), List.of(UUID.randomUUID().toString()));
        assertEquals(before + 1, count());
    }

    @Test
    void actorSnapshotAndOptionsSurvivePermittedAccountDeletion() {
        var staff = UserAccount.invite("Retained synthetic staff", "audit-actor@example.invalid", "audit_actor", "000001", Role.ADMIN);
        staff.acceptInvitation("synthetic-unused-hash", Instant.now());
        staff = users.saveAndFlush(staff);
        accounts.setBlocked(actor(staff.getId(), Role.ADMIN), actors.get(Role.RECEPTIONIST).getId(), true);
        accounts.delete(actor(Role.ADMIN), staff.getId());
        assertFalse(users.existsById(staff.getId()));
        var page = activity.audit(actor(Role.ADMIN), query("actorId", staff.getId().toString()));
        assertEquals(1, page.totalElements());
        assertEquals("Retained synthetic staff", page.content().getFirst().actor().name());
        var id = staff.getId();
        assertTrue(page.actors().stream().anyMatch(a -> a.id().equals(id)));
    }

    @Test
    void deniedAndConflictingChangesAndReadsNeverProduceEventsAndPublisherRequiresTransaction() throws Exception {
        mvc.perform(bearer(post("/api/lab-tests"), Role.RECEPTIONIST).contentType("application/json").content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(bearer(get("/api/audit-logs"), Role.PATIENT)).andExpect(status().isForbidden());
        assertEquals(0, count());
        assertThrows(org.springframework.transaction.IllegalTransactionStateException.class,
                () -> audit.record(actors.get(Role.ADMIN), AuditOperation.SLOT_CREATE, UUID.randomUUID()));
        var start = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS).plusSeconds(86400);
        schedule.createSlot(actor(Role.ADMIN), new AppointmentRequests.SlotCreate(start.toString(), start.plusSeconds(600).toString(), 1, true));
        assertThrows(RuntimeException.class, () -> schedule.createSlot(actor(Role.ADMIN), new AppointmentRequests.SlotCreate(start.toString(), start.plusSeconds(600).toString(), 1, false)));
        assertEquals(1, count());
        activity.audit(actor(Role.ADMIN), query());
        assertEquals(1, count());
    }

    @Test
    void combinedHistoryPaginatesAndFiltersAcrossSourcesWithJerusalemBoundaries() {
        var prepared = prepared(create(own, first));
        var at = Instant.parse("2026-10-24T21:00:00Z");
        UUID shared = UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff");
        jdbc.update("INSERT INTO laboratory_events(id,sample_id,kind,actor_id,actor_name_snapshot,occurred_at,recorded_at) VALUES (?,?,'CREATE',?,'Retained staff',?,?)",
                shared, prepared.sample().id(), actors.get(Role.ADMIN).getId(), java.sql.Timestamp.from(at), java.sql.Timestamp.from(at));
        // Logical references allow retained/deleted configuration identities; no backfill of real history.
        jdbc.update("INSERT INTO audit_logs(id,actor_id,actor_name_snapshot,action,entity_type,entity_id,occurred_at,recorded_at,summary) VALUES (?,?,'Retained staff','CREATE','booking slot',?,?,?,'Created a booking slot.')",
                shared, actors.get(Role.ADMIN).getId(), UUID.randomUUID(), java.sql.Timestamp.from(at), java.sql.Timestamp.from(at));
        var p = activity.audit(actor(Role.ADMIN), query("fromDate", "2026-10-25", "toDate", "2026-10-25", "action", "CREATE", "size", "1"));
        assertEquals(2, p.totalElements()); assertEquals("booking slot", p.content().getFirst().entityName());
        var second = activity.audit(actor(Role.ADMIN), query("fromDate", "2026-10-25", "toDate", "2026-10-25", "action", "CREATE", "size", "1", "page", "1"));
        assertEquals("sample", second.content().getFirst().entityName()); assertTrue(second.last());
        assertTrue(p.actors().stream().anyMatch(a -> a.id().equals(actors.get(Role.LAB_TECHNICIAN).getId())));
        assertEquals(1, activity.audit(actor(Role.ADMIN), query("fromDate", "2026-10-25", "toDate", "2026-10-25", "search", "booking slot")).totalElements());
        var huge = activity.audit(actor(Role.ADMIN), query("page", "2147483647", "size", "100"));
        assertTrue(huge.content().isEmpty()); assertTrue(huge.last()); assertTrue(huge.totalElements() > 2);
    }
}
