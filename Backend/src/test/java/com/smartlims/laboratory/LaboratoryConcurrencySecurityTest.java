package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.results.dto.ResultRequests;
import com.smartlims.visits.dto.VisitRequests;
import jakarta.servlet.http.Cookie;

import java.util.*;
import java.util.concurrent.*;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class LaboratoryConcurrencySecurityTest extends LaboratoryTestSupport {
    @Test
    void arrivalAndNoShowCannotBothCommitForTheSameAppointment() throws Exception {
        var order = create(own, first);
        var appointment = appointment(order, 0, 1);
        jdbc.update("UPDATE appointment_slots SET starts_at=starts_at-interval '2 days',ends_at=ends_at-interval '2 days' WHERE id=?", appointment.slotId());
        try (var pool = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            var arrival = pool.submit(() -> {
                gate.await();
                try {
                    arrive(order, appointment.id());
                    return "ARRIVED";
                } catch (LaboratoryException e) {
                    return e.getCode();
                }
            });
            var noShow = pool.submit(() -> {
                gate.await();
                try {
                    visitService.noShow(actor(Role.RECEPTIONIST), appointment.id().toString(), new VisitRequests.Revision(0L));
                    return "NO_SHOW";
                } catch (LaboratoryException e) {
                    return e.getCode();
                }
            });
            gate.countDown();
            var a = arrival.get(15, TimeUnit.SECONDS);
            var n = noShow.get(15, TimeUnit.SECONDS);
            assertTrue((a.equals("ARRIVED") && n.equals("APPOINTMENT_CHANGED")) || (a.equals("APPOINTMENT_STATE_CONFLICT") && n.equals("NO_SHOW")), a + " / " + n);
        }
        String state = jdbc.queryForObject("SELECT status FROM appointments WHERE id=?", String.class, appointment.id());
        assertEquals(state.equals("CHECKED_IN") ? 1 : 0, jdbc.queryForObject("SELECT count(*) FROM visits", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM laboratory_events WHERE appointment_id=?", Integer.class, appointment.id()));
    }

    @Test
    void concurrentPublicationHasOneLifecycleEventAndOneCurrentVersion() throws Exception {
        var p = prepared(create(own, first));
        var r = publicationService.approve(actor(reviewerId, Role.ADMIN), p.result().id().toString(), new ResultRequests.Revision(p.result().version()));
        try (var pool = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            Callable<String> publish = () -> {
                gate.await();
                try {
                    publicationService.publish(actor(reviewerId, Role.ADMIN), r.id().toString(), new ResultRequests.Revision(r.version()));
                    return "PUBLISHED";
                } catch (LaboratoryException e) {
                    return e.getCode();
                }
            };
            var first = pool.submit(publish);
            var second = pool.submit(publish);
            gate.countDown();
            var outcomes = List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS));
            assertEquals(1, Collections.frequency(outcomes, "PUBLISHED"));
            assertEquals(1, Collections.frequency(outcomes, "RESULT_CHANGED"));
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM test_results WHERE is_current", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM laboratory_events WHERE kind='PUBLISH'", Integer.class));
    }

    @Test
    void clinicalCookieWritesRequireCsrfAndPublicationGrantRechecksStoredEligibility() throws Exception {
        var p = prepared(create(own, first));
        var body = contents(p.result(), p.sample().id());
        String path = "/api/results/" + p.result().id();
        error(mvc.perform(put(path).cookie(new Cookie("access_token", tokens.get(Role.LAB_TECHNICIAN))).contentType("application/json").content(json.writeValueAsString(body))), 403, "FORBIDDEN", null);
        Cookie csrf = mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertNotNull(csrf);
        mvc.perform(put(path).cookie(new Cookie("access_token", tokens.get(Role.LAB_TECHNICIAN)), csrf).header("X-XSRF-TOKEN", csrf.getValue()).contentType("application/json").content(json.writeValueAsString(body))).andExpect(status().isOk());
        var current = draftService.get(actor(Role.LAB_TECHNICIAN), p.result().id().toString());
        String revision = json.writeValueAsString(new ResultRequests.Revision(current.version()));
        error(mvc.perform(post(path + "/approve").cookie(new Cookie("access_token", reviewerToken)).contentType("application/json").content(revision)), 403, "FORBIDDEN", null);
        mvc.perform(post(path + "/approve").cookie(new Cookie("access_token", reviewerToken), csrf).header("X-XSRF-TOKEN", csrf.getValue()).contentType("application/json").content(revision)).andExpect(status().isOk());
        jdbc.update("UPDATE users SET enabled=false WHERE id=?", reviewerId);
        error(mvc.perform(post(path + "/publish").header("Authorization", "Bearer " + reviewerToken).contentType("application/json").content(revision)), 401, "UNAUTHORIZED", null);
        assertEquals("APPROVED", jdbc.queryForObject("SELECT status FROM test_results WHERE id=?", String.class, p.result().id()));
    }
}
