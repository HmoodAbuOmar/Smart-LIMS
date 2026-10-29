package com.smartlims.appointments;

import com.smartlims.appointments.dto.*;
import com.smartlims.appointments.exception.AppointmentException;
import com.smartlims.appointments.service.AppointmentActionService;
import com.smartlims.auth.entity.Role;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AppointmentRescheduleTest extends AppointmentTestSupport {
    @Autowired AppointmentActionService actions;
    @Test void alternativesAndMovePreserveIdentityTypeAndOriginalRetryIntent() throws Exception {
        var t=type();var old=slot(0,1);var target=slot(1,1);var full=slot(2,1);book(create(other,first),t,full);
        var order=create(own,first);String key=UUID.randomUUID().toString();var request=new AppointmentRequests.Book(order.id().toString(),t.id().toString(),old.id().toString());
        var a=bookings.book(actor(Role.PATIENT),request,List.of(key)).appointment();
        schedule.saveType(actor(Role.ADMIN),t.id().toString(),new AppointmentRequests.Type(t.code(),"Renamed",false));
        mvc.perform(bearer(get("/api/appointments/"+a.id()+"/alternatives").param("from",future.minusSeconds(1).toString()).param("to",future.plusSeconds(86400).toString()),Role.PATIENT)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].id").value(target.id().toString()));
        var body=new AppointmentRequests.Move(target.id().toString(),a.version());
        var moved=actions.move(actor(Role.PATIENT),a.id().toString(),body);assertEquals(a.id(),moved.id());assertEquals(t.id(),moved.typeId());assertEquals(a.typeName(),moved.typeName());assertEquals(a.createdAt(),moved.createdAt());assertEquals(1,moved.version());
        assertEquals(moved,actions.move(actor(Role.PATIENT),a.id().toString(),body));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM appointment_reschedules",Integer.class));
        assertEquals(moved,bookings.book(actor(Role.PATIENT),request,List.of(key)).appointment());
        assertNotNull(book(create(other,first),type(),old));
    }
    @Test void fullForeignInactivePastAndStaleMovesPreserveOriginalAllocation() throws Exception {
        var t=type();var old=slot(0,1);var full=slot(1,1);var target=slot(2,1);var a=book(create(own,first),t,old);book(create(other,first),t,full);
        assertEquals("APPOINTMENT_SLOT_UNAVAILABLE",assertThrows(AppointmentException.class,()->actions.move(actor(Role.PATIENT),a.id().toString(),new AppointmentRequests.Move(full.id().toString(),0L))).getCode());
        assertEquals(old.id(),jdbc.queryForObject("SELECT slot_id FROM appointments WHERE id=?",UUID.class,a.id()));
        error(mvc.perform(post("/api/appointments/"+a.id()+"/reschedule").header("Authorization","Bearer "+strangerToken).contentType("application/json").content(json.writeValueAsString(new AppointmentRequests.Move(target.id().toString(),0L)))),404,"APPOINTMENT_NOT_FOUND",null);
        actions.move(actor(Role.RECEPTIONIST),a.id().toString(),new AppointmentRequests.Move(target.id().toString(),0L));
        assertEquals("APPOINTMENT_CHANGED",assertThrows(AppointmentException.class,()->actions.move(actor(Role.PATIENT),a.id().toString(),new AppointmentRequests.Move(old.id().toString(),0L))).getCode());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM appointment_reschedules",Integer.class));
    }
    @Test void startedNonPendingAndPatientOverlappingAlternativesAreRejected() {
        var t=type();var old=slot(0,1);var target=slot(1,2);var o=create(own,first);var a=book(o,t,old);book(create(own,first),t,target);
        assertEquals("APPOINTMENT_SLOT_UNAVAILABLE",assertThrows(AppointmentException.class,()->actions.move(actor(Role.PATIENT),a.id().toString(),new AppointmentRequests.Move(target.id().toString(),0L))).getCode());
        state(o.id(),"IN_PROGRESS");assertEquals("APPOINTMENT_NOT_CHANGEABLE",assertThrows(AppointmentException.class,()->actions.move(actor(Role.PATIENT),a.id().toString(),new AppointmentRequests.Move(old.id().toString(),0L))).getCode());
        state(o.id(),"PENDING");jdbc.update("UPDATE appointment_slots SET starts_at=starts_at-interval '2 days',ends_at=ends_at-interval '2 days' WHERE id=?",old.id());
        assertEquals("APPOINTMENT_NOT_CHANGEABLE",assertThrows(AppointmentException.class,()->actions.move(actor(Role.ADMIN),a.id().toString(),new AppointmentRequests.Move(target.id().toString(),0L))).getCode());
    }
    @Test void rollbackRestoresSlotRevisionAndHistoryTogether() {
        var t=type();var old=slot(0,1);var target=slot(1,1);var a=book(create(own,first),t,old);
        assertThrows(IllegalStateException.class,()->new TransactionTemplate(transactionManager).execute(tx->{actions.move(actor(Role.ADMIN),a.id().toString(),new AppointmentRequests.Move(target.id().toString(),0L));throw new IllegalStateException("Synthetic rollback");}));
        assertEquals(old.id(),jdbc.queryForObject("SELECT slot_id FROM appointments WHERE id=?",UUID.class,a.id()));assertEquals(0,jdbc.queryForObject("SELECT version FROM appointments WHERE id=?",Long.class,a.id()));assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM appointment_reschedules",Integer.class));
    }
    @Test void concurrentMovesToLastCapacityAndSameRevisionCannotOverbook() throws Exception {
        var t=type();var a=book(create(own,first),t,slot(0,1));var b=book(create(other,first),t,slot(1,1));var target=slot(2,1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var gate=new CountDownLatch(1);Callable<String> x=()->{gate.await();try{return actions.move(actor(Role.ADMIN),a.id().toString(),new AppointmentRequests.Move(target.id().toString(),0L)).slotId().toString();}catch(AppointmentException e){return e.getCode();}};
            Callable<String> y=()->{gate.await();try{return actions.move(actor(Role.RECEPTIONIST),b.id().toString(),new AppointmentRequests.Move(target.id().toString(),0L)).slotId().toString();}catch(AppointmentException e){return e.getCode();}};
            var f=pool.submit(x);var g=pool.submit(y);gate.countDown();var results=List.of(f.get(15,TimeUnit.SECONDS),g.get(15,TimeUnit.SECONDS));assertEquals(1,Collections.frequency(results,"APPOINTMENT_SLOT_UNAVAILABLE"));
        }
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM appointments WHERE slot_id=? AND status='CONFIRMED'",Integer.class,target.id()));assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM appointments",Integer.class));
    }
    @Test void strictMoveJsonAndTechnicianDenial() throws Exception {
        var a=book(create(own,first),type(),slot(0,1));var target=slot(1,1);
        error(mvc.perform(bearer(post("/api/appointments/"+a.id()+"/reschedule"),Role.PATIENT).contentType("application/json").content("{\"slotId\":\""+target.id()+"\",\"expectedVersion\":\"0\"}")),400,"INVALID_JSON",null);
        error(mvc.perform(bearer(post("/api/appointments/"+a.id()+"/reschedule"),Role.PATIENT).contentType("application/json").content("{\"slotId\":\""+target.id()+"\",\"expectedVersion\":-1}")),400,"VALIDATION_ERROR","expectedVersion");
        error(mvc.perform(bearer(get("/api/appointments/"+a.id()+"/alternatives"),Role.LAB_TECHNICIAN)),403,"FORBIDDEN",null);
    }
}
