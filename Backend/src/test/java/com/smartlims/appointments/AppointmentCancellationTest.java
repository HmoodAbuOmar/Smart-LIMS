package com.smartlims.appointments;

import com.smartlims.appointments.dto.*;
import com.smartlims.appointments.exception.AppointmentException;
import com.smartlims.appointments.service.AppointmentActionService;
import com.smartlims.auth.entity.Role;
import com.smartlims.orders.dto.CancelOrderRequest;
import com.smartlims.orders.service.OrderCancellationService;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AppointmentCancellationTest extends AppointmentTestSupport {
    @Autowired AppointmentActionService actions;
    @Autowired OrderCancellationService cancellations;
    @Test void patientCancelRetainsRecordOrderAndOriginalMetadataReleasesCapacityAndAllowsRebooking() throws Exception {
        var t=type();var s=slot(0,1);var o=create(own,first);var key=List.of(UUID.randomUUID().toString());var request=new AppointmentRequests.Book(o.id().toString(),t.id().toString(),s.id().toString());var a=bookings.book(actor(Role.PATIENT),request,key).appointment();
        mvc.perform(bearer(post("/api/appointments/"+a.id()+"/cancel"),Role.PATIENT).contentType("application/json").content("{}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED")).andExpect(jsonPath("$.canCancel").value(false)).andExpect(jsonPath("$.canReschedule").value(false));
        var cancelled=actions.cancel(actor(Role.PATIENT),a.id().toString(),new AppointmentRequests.Cancel("Later reason"));
        assertNull(cancelled.cancellationReason());assertEquals(cancelled,actions.cancel(actor(Role.ADMIN),a.id().toString(),new AppointmentRequests.Cancel("Staff repeated synthetic request")));
        assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM test_orders WHERE id=?",String.class,o.id()));
        assertEquals(cancelled,bookings.book(actor(Role.PATIENT),request,key).appointment());
        var replacement=book(o,t,s);assertNotEquals(a.id(),replacement.id());assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM appointments",Integer.class));
        mvc.perform(bearer(get("/api/appointments/me").param("tab","PAST"),Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(1));
    }
    @Test void staffReasonStrictJsonRolesAndOwnershipApplyEvenOnRepeats() throws Exception {
        var a=book(create(own,first),type(),slot(0,1));String path="/api/appointments/"+a.id()+"/cancel";
        error(mvc.perform(bearer(post(path),Role.RECEPTIONIST).contentType("application/json").content("{}")),400,"VALIDATION_ERROR","reason");
        error(mvc.perform(bearer(post(path),Role.PATIENT).contentType("application/json").content("{\"reason\":123}")),400,"INVALID_JSON",null);
        error(mvc.perform(bearer(post(path),Role.PATIENT).contentType("application/json").content("{\"status\":\"CANCELLED\"}")),400,"INVALID_JSON",null);
        error(mvc.perform(bearer(post(path),Role.LAB_TECHNICIAN).contentType("application/json").content("{}")),403,"FORBIDDEN",null);
        error(mvc.perform(post(path).header("Authorization","Bearer "+strangerToken).contentType("application/json").content("{}")),404,"APPOINTMENT_NOT_FOUND",null);
        var result=actions.cancel(actor(Role.RECEPTIONIST),a.id().toString(),new AppointmentRequests.Cancel("  Synthetic reason  "));assertEquals("Synthetic reason",result.cancellationReason());
        error(mvc.perform(bearer(post(path),Role.ADMIN).contentType("application/json").content("{\"reason\":\" \"}")),400,"VALIDATION_ERROR","reason");
    }
    @Test void startedDirectCancelRejectsButLinkedOrderCascadeCancelsAtomicallyWithCopiedMetadata() {
        var o=create(own,first);var a=book(o,type(),slot(0,1));
        jdbc.update("UPDATE appointment_slots SET starts_at=starts_at-interval '2 days',ends_at=ends_at-interval '2 days' WHERE id=?",a.slotId());
        assertEquals("APPOINTMENT_NOT_CHANGEABLE",assertThrows(AppointmentException.class,()->actions.cancel(actor(Role.PATIENT),a.id().toString(),new AppointmentRequests.Cancel(null))).getCode());
        var cancelled=cancellations.cancel(actor(Role.PATIENT),o.id().toString(),new CancelOrderRequest("Synthetic order cancellation"));
        assertEquals("CANCELLED",jdbc.queryForObject("SELECT status FROM appointments WHERE id=?",String.class,a.id()));
        assertEquals(cancelled.cancelledAt(),jdbc.queryForObject("SELECT cancelled_at FROM appointments WHERE id=?",java.sql.Timestamp.class,a.id()).toInstant());
        assertEquals("Synthetic order cancellation",jdbc.queryForObject("SELECT cancellation_reason FROM appointments WHERE id=?",String.class,a.id()));
        assertEquals(actors.get(Role.PATIENT).getId(),jdbc.queryForObject("SELECT cancelled_by FROM appointments WHERE id=?",UUID.class,a.id()));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM appointments WHERE status='CONFIRMED'",Integer.class));
        assertNotNull(actions.cancel(actor(Role.PATIENT),a.id().toString(),new AppointmentRequests.Cancel(null)));
    }
    @Test void orderCascadeLeavesPreviouslyCancelledHistoryUntouchedAndBookingReplayReturnsCurrentState() {
        var o=create(own,first);var t=type();var s=slot(0,1);var old=book(o,t,s);
        var oldCancelled=actions.cancel(actor(Role.RECEPTIONIST),old.id().toString(),new AppointmentRequests.Cancel("Original synthetic"));
        var request=new AppointmentRequests.Book(o.id().toString(),t.id().toString(),s.id().toString());var key=List.of(UUID.randomUUID().toString());var current=bookings.book(actor(Role.PATIENT),request,key).appointment();
        cancellations.cancel(actor(Role.ADMIN),o.id().toString(),new CancelOrderRequest("Order synthetic"));
        assertEquals(oldCancelled,actions.cancel(actor(Role.PATIENT),old.id().toString(),new AppointmentRequests.Cancel(null)));
        var replay=bookings.book(actor(Role.PATIENT),request,key).appointment();assertEquals(current.id(),replay.id());assertEquals("CANCELLED",replay.status().name());
        assertEquals("Order synthetic",replay.cancellationReason());
    }
    @Test void orderAndAppointmentRollbackTogetherIncludingCapacity() {
        var o=create(own,first);var a=book(o,type(),slot(0,1));
        assertThrows(IllegalStateException.class,()->new TransactionTemplate(transactionManager).execute(tx->{cancellations.cancel(actor(Role.ADMIN),o.id().toString(),new CancelOrderRequest("Synthetic rollback"));throw new IllegalStateException("Synthetic rollback");}));
        assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM test_orders WHERE id=?",String.class,o.id()));assertEquals("CONFIRMED",jdbc.queryForObject("SELECT status FROM appointments WHERE id=?",String.class,a.id()));assertEquals(0,jdbc.queryForObject("SELECT version FROM appointments WHERE id=?",Long.class,a.id()));
    }
    @Test void concurrentPatientStaffCancelReturnsIdenticalRetainedMetadata() throws Exception {
        var a=book(create(own,first),type(),slot(0,1));
        try(var pool=Executors.newFixedThreadPool(2)) {
            var gate=new CountDownLatch(1);var x=pool.submit(()->{gate.await();return actions.cancel(actor(Role.PATIENT),a.id().toString(),new AppointmentRequests.Cancel("Patient synthetic"));});
            var y=pool.submit(()->{gate.await();return actions.cancel(actor(Role.ADMIN),a.id().toString(),new AppointmentRequests.Cancel("Staff synthetic"));});gate.countDown();assertEquals(x.get(15,TimeUnit.SECONDS),y.get(15,TimeUnit.SECONDS));
        }
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM appointments",Integer.class));assertEquals(1,jdbc.queryForObject("SELECT version FROM appointments WHERE id=?",Long.class,a.id()));
    }
    @Test void rescheduleVersusCancelCannotLeaveCapacityAllocated() throws Exception {
        var a=book(create(own,first),type(),slot(0,1));var target=slot(1,1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var gate=new CountDownLatch(1);var x=pool.submit(()->{gate.await();try{actions.move(actor(Role.PATIENT),a.id().toString(),new AppointmentRequests.Move(target.id().toString(),0L));return "MOVED";}catch(AppointmentException e){return e.getCode();}});
            var y=pool.submit(()->{gate.await();return actions.cancel(actor(Role.RECEPTIONIST),a.id().toString(),new AppointmentRequests.Cancel("Synthetic concurrent"));});gate.countDown();assertNotNull(x.get(15,TimeUnit.SECONDS));assertEquals("CANCELLED",y.get(15,TimeUnit.SECONDS).status().name());
        }
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM appointments WHERE status='CONFIRMED'",Integer.class));
    }
    @Test void bookingVersusOrderCancelNeverLeavesActiveAppointmentOnCancelledOrder() throws Exception {
        var o=create(own,first);var t=type();var s=slot(0,1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var gate=new CountDownLatch(1);var x=pool.submit(()->{gate.await();try{book(o,t,s);return "BOOKED";}catch(AppointmentException e){return e.getCode();}});
            var y=pool.submit(()->{gate.await();return cancellations.cancel(actor(Role.PATIENT),o.id().toString(),new CancelOrderRequest(null));});gate.countDown();assertTrue(Set.of("BOOKED","ORDER_NOT_BOOKABLE").contains(x.get(15,TimeUnit.SECONDS)));assertEquals("CANCELLED",y.get(15,TimeUnit.SECONDS).status().name());
        }
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM appointments WHERE status='CONFIRMED'",Integer.class));
    }
    @Test void rescheduleVersusOrderCancelAndReleasedSlotReallocationAreSafe() throws Exception {
        var o=create(own,first);var t=type();var old=slot(0,1);var target=slot(1,1);var a=book(o,t,old);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var gate=new CountDownLatch(1);var x=pool.submit(()->{gate.await();try{actions.move(actor(Role.RECEPTIONIST),a.id().toString(),new AppointmentRequests.Move(target.id().toString(),0L));return "MOVED";}catch(AppointmentException e){return e.getCode();}});
            var y=pool.submit(()->{gate.await();return cancellations.cancel(actor(Role.PATIENT),o.id().toString(),new CancelOrderRequest(null));});gate.countDown();assertNotNull(x.get(15,TimeUnit.SECONDS));y.get(15,TimeUnit.SECONDS);
        }
        assertEquals("CANCELLED",jdbc.queryForObject("SELECT status FROM appointments WHERE id=?",String.class,a.id()));
        assertNotNull(book(create(other,first),t,old));assertNotNull(book(create(unlinked,first),t,target));
    }
}
