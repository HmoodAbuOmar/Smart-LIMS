package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.labtests.dto.*;
import com.smartlims.labtests.entity.LabTestCategory;
import com.smartlims.labtests.exception.LabTestException;
import com.smartlims.labtests.service.*;
import com.smartlims.orders.exception.OrderException;
import java.math.BigDecimal;
import java.sql.DriverManager;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class LabTestDeletionTest extends LaboratoryTestSupport {
    @Autowired LabTestService catalog;
    @Autowired ReferenceRangeService ranges;

    UUID configure() {
        first.getCategories().add(LabTestCategory.THYROID);
        tests.saveAndFlush(first);
        var parameter = parameterService.save(actor(Role.ADMIN), first.getId().toString(), null,
                new TestParameterRequest("DELETE_SYN", "Synthetic numeric", "NUMERIC", null, null, 0, false, true, null));
        ranges.create(actor(Role.ADMIN), first.getId().toString(), parameter.id().toString(),
                new ReferenceRangeRequest("ANY", null, null, BigDecimal.ZERO, BigDecimal.TEN, null, null));
        return parameter.id();
    }

    @Test
    void deletesUnusedActiveAndInactiveTestsWithAllCatalogDependenciesAndRetainedAudit() throws Exception {
        configure();
        catalog.changeStatus(actor(Role.ADMIN), first.getId().toString(), new LabTestStatusRequest(false));
        mvc.perform(bearer(delete("/api/lab-tests/" + first.getId()), Role.ADMIN))
                .andExpect(status().isNoContent()).andExpect(content().string(""))
                .andExpect(header().string("Cache-Control", "no-store"));
        assertFalse(tests.existsById(first.getId()));
        for (String table : List.of("test_parameters", "reference_ranges", "lab_test_categories"))
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class));
        assertTrue(tests.existsById(free.getId()));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE action='DELETE' AND entity_id=?", Integer.class, first.getId()));
        error(mvc.perform(bearer(delete("/api/lab-tests/" + first.getId()), Role.ADMIN)), 404, "LAB_TEST_NOT_FOUND", null);
        mvc.perform(bearer(delete("/api/lab-tests/" + free.getId()), Role.ADMIN)).andExpect(status().isNoContent());
    }

    @Test
    void authorizationValidationAndStoredEligibilityAreEnforcedBeforeLookup() throws Exception {
        String missing = UUID.randomUUID().toString();
        for (Role role : List.of(Role.PATIENT, Role.RECEPTIONIST, Role.LAB_TECHNICIAN)) {
            error(mvc.perform(bearer(delete("/api/lab-tests/" + first.getId()), role)), 403, "FORBIDDEN", null);
            error(mvc.perform(bearer(delete("/api/lab-tests/" + missing), role)), 403, "FORBIDDEN", null);
            assertEquals("FORBIDDEN", assertThrows(LabTestException.class,
                    () -> catalog.delete(actor(role), first.getId().toString())).getCode());
        }
        error(mvc.perform(delete("/api/lab-tests/" + first.getId())), 403, "FORBIDDEN", null); // Existing CSRF rule for unauthenticated writes.
        error(mvc.perform(bearer(delete("/api/lab-tests/" + missing), Role.ADMIN)), 404, "LAB_TEST_NOT_FOUND", null);
        error(mvc.perform(bearer(delete("/api/lab-tests/invalid"), Role.ADMIN)), 400, "VALIDATION_ERROR", "id");
        var account = actors.get(Role.ADMIN);
        account.setRole(Role.RECEPTIONIST); users.saveAndFlush(account);
        assertEquals("FORBIDDEN", assertThrows(LabTestException.class,
                () -> catalog.delete(actor(Role.ADMIN), first.getId().toString())).getCode());
        account.setRole(Role.ADMIN); account.setEnabled(false); users.saveAndFlush(account);
        assertEquals("UNAUTHORIZED", assertThrows(LabTestException.class,
                () -> catalog.delete(actor(Role.ADMIN), first.getId().toString())).getCode());
        assertTrue(tests.existsById(first.getId()));
    }

    @Test
    void anyHistoricalOrderStateBlocksDeletionAndDeactivateStillWorks() throws Exception {
        configure();
        var order = create(own, first);
        for (String status : List.of("PENDING", "COMPLETED", "CANCELLED")) {
            state(order.id(), status);
            error(mvc.perform(bearer(delete("/api/lab-tests/" + first.getId()), Role.ADMIN)), 409, "LAB_TEST_IN_USE", null);
            assertEquals(status, jdbc.queryForObject("SELECT status FROM test_orders WHERE id=?", String.class, order.id()));
            assertConfigured();
        }
        mvc.perform(bearer(patch("/api/lab-tests/" + first.getId() + "/status"), Role.ADMIN)
                .contentType("application/json").content("{\"active\":false}")).andExpect(status().isOk());
        assertFalse(tests.findById(first.getId()).orElseThrow().isActive());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE action='DELETE'", Integer.class));
    }

    @Test
    void draftAndPublishedResultsAndTheirSnapshotsRemainUntouched() throws Exception {
        var prepared = prepared(create(own, first));
        error(mvc.perform(bearer(delete("/api/lab-tests/" + first.getId()), Role.ADMIN)), 409, "LAB_TEST_IN_USE", null);
        publish(prepared.result());
        var before = jdbc.queryForList("SELECT to_jsonb(r)::text AS row FROM test_results r ORDER BY id");
        var values = jdbc.queryForList("SELECT to_jsonb(v)::text AS row FROM result_values v ORDER BY id");
        error(mvc.perform(bearer(delete("/api/lab-tests/" + first.getId()), Role.ADMIN)), 409, "LAB_TEST_IN_USE", null);
        assertEquals(before, jdbc.queryForList("SELECT to_jsonb(r)::text AS row FROM test_results r ORDER BY id"));
        assertEquals(values, jdbc.queryForList("SELECT to_jsonb(v)::text AS row FROM result_values v ORDER BY id"));
    }

    void assertConfigured() {
        assertTrue(tests.existsById(first.getId()));
        for (String table : List.of("test_parameters", "reference_ranges", "lab_test_categories"))
            assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class));
    }

    @Test
    void otherRetainedForeignKeyConflictRollsBackAlreadyDeletedCatalogDependencies() throws Exception {
        configure();
        jdbc.execute("CREATE TABLE synthetic_retained_catalog_use(test_id uuid REFERENCES lab_tests(id))");
        try {
            jdbc.update("INSERT INTO synthetic_retained_catalog_use VALUES (?)", first.getId());
            error(mvc.perform(bearer(delete("/api/lab-tests/" + first.getId()), Role.ADMIN)), 409, "LAB_TEST_IN_USE", null);
            assertConfigured();
            assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM synthetic_retained_catalog_use", Integer.class));
        } finally { jdbc.execute("DROP TABLE synthetic_retained_catalog_use"); }
    }

    @Test
    void auditInsertFailureRollsBackParentAndAllCatalogCleanup() {
        configure();
        jdbc.execute("CREATE FUNCTION synthetic_catalog_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure' USING ERRCODE='23514'; END $$");
        jdbc.execute("CREATE TRIGGER synthetic_catalog_audit_fail BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION synthetic_catalog_audit_fail()");
        try {
            assertThrows(RuntimeException.class, () -> catalog.delete(actor(Role.ADMIN), first.getId().toString()));
            assertConfigured();
        } finally {
            jdbc.execute("DROP TRIGGER synthetic_catalog_audit_fail ON audit_logs");
            jdbc.execute("DROP FUNCTION synthetic_catalog_audit_fail()");
        }
    }

    void awaitCatalogLock() throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            if (jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query ILIKE '%lab_tests%'", Integer.class) > 0) return;
            Thread.sleep(10);
        }
        fail("Expected the competing operation to wait on the catalog lock");
    }

    @Test
    void committedConcurrentOrderWinsAndDeletionRechecksRetainedUse() throws Exception {
        try (var connection = DriverManager.getConnection(System.getenv("SMARTLIMS_TEST_DATABASE_URL"), "postgres", "");
             var pool = Executors.newSingleThreadExecutor()) {
            connection.setAutoCommit(false);
            try (var statement = connection.prepareStatement("SELECT id FROM lab_tests WHERE id=? FOR SHARE")) {
                statement.setObject(1, first.getId()); statement.executeQuery().close();
            }
            var deletion = pool.submit(() -> assertThrows(LabTestException.class,
                    () -> catalog.delete(actor(Role.ADMIN), first.getId().toString())).getCode());
            try {
                awaitCatalogLock();
                // Commit an order reference while holding the same snapshot/FK lock used by order creation.
                UUID orderId = UUID.randomUUID();
                try (var statement = connection.prepareStatement("INSERT INTO test_orders(id,order_number,patient_id,created_by,idempotency_key,request_hash) VALUES (?, 'ORD-'||lpad(nextval('order_number_seq')::text,6,'0'), ?, ?, ?, repeat('a',64))")) {
                    statement.setObject(1, orderId); statement.setObject(2, own.getId());
                    statement.setObject(3, actors.get(Role.ADMIN).getId()); statement.setObject(4, UUID.randomUUID());
                    statement.executeUpdate();
                }
                try (var statement = connection.prepareStatement("INSERT INTO order_items(id,order_id,lab_test_id,test_code_snapshot,test_name_snapshot,price_at_order) SELECT ?,?,id,code,name,price FROM lab_tests WHERE id=?")) {
                    statement.setObject(1, UUID.randomUUID()); statement.setObject(2, orderId); statement.setObject(3, first.getId());
                    statement.executeUpdate();
                }
            } finally { connection.commit(); }
            assertEquals("LAB_TEST_IN_USE", deletion.get(15, TimeUnit.SECONDS));
            assertTrue(tests.existsById(first.getId()));
            assertEquals(1, orders.count());
        }
    }

    @Test
    void committedDeletionWinsAndConcurrentOrderFailsWithoutOrphanOrPartialOrder() throws Exception {
        var deleted = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var deletion = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
                catalog.delete(actor(Role.ADMIN), first.getId().toString()); deleted.countDown();
                try { if (!release.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Timed out"); }
                catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IllegalStateException(error); }
            }));
            try {
                assertTrue(deleted.await(10, TimeUnit.SECONDS));
                var order = pool.submit(() -> assertThrows(OrderException.class, () -> create(own, first)).getCode());
                awaitCatalogLock(); release.countDown();
                deletion.get(15, TimeUnit.SECONDS);
                assertEquals("ORDER_TEST_UNAVAILABLE", order.get(15, TimeUnit.SECONDS));
            } finally { release.countDown(); }
            assertFalse(tests.existsById(first.getId())); assertEquals(0, orders.count());
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM order_items", Integer.class));
        }
    }
}
