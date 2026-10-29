package com.smartlims.appointments;

import com.smartlims.appointments.dto.*;
import com.smartlims.appointments.exception.AppointmentException;
import com.smartlims.appointments.service.AppointmentActionService;
import com.smartlims.auth.entity.Role;
import jakarta.servlet.http.Cookie;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AppointmentConcurrencyTest extends AppointmentTestSupport {
    @Autowired AppointmentActionService actions;
    @Test void concurrentDifferentOrdersForSamePatientCannotDoubleBookEvenWithSpareCapacity() throws Exception {
        var t=type();var target=slot(0,5);var firstOrder=create(own,first);var secondOrder=create(own,first);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var gate=new CountDownLatch(1);
            Callable<String> x=()->{gate.await();try{book(firstOrder,t,target);return "BOOKED";}catch(AppointmentException e){return e.getCode();}};
            Callable<String> y=()->{gate.await();try{book(secondOrder,t,target);return "BOOKED";}catch(AppointmentException e){return e.getCode();}};
            var a=pool.submit(x);var b=pool.submit(y);gate.countDown();var results=List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));assertEquals(1,Collections.frequency(results,"BOOKED"));assertEquals(1,Collections.frequency(results,"APPOINTMENT_SLOT_UNAVAILABLE"));
        }
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM appointments WHERE status='CONFIRMED'",Integer.class));
    }
    @Test void bookingAndReschedulingCompeteForSameLastPlaceWithoutLosingOldBooking() throws Exception {
        var t=type();var old=slot(0,1);var target=slot(1,1);var existing=book(create(own,first),t,old);var order=create(other,first);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var gate=new CountDownLatch(1);
            Callable<String> x=()->{gate.await();try{actions.move(actor(Role.ADMIN),existing.id().toString(),new AppointmentRequests.Move(target.id().toString(),0L));return "SUCCESS";}catch(AppointmentException e){return e.getCode();}};
            Callable<String> y=()->{gate.await();try{book(order,t,target);return "SUCCESS";}catch(AppointmentException e){return e.getCode();}};
            var a=pool.submit(x);var b=pool.submit(y);gate.countDown();var results=List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));assertEquals(1,Collections.frequency(results,"SUCCESS"));assertEquals(1,Collections.frequency(results,"APPOINTMENT_SLOT_UNAVAILABLE"));
        }
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM appointments WHERE slot_id=? AND status='CONFIRMED'",Integer.class,target.id()));
        assertEquals("CONFIRMED",jdbc.queryForObject("SELECT status FROM appointments WHERE id=?",String.class,existing.id()));
    }
    @Test void cookieAppointmentWritesRequireMatchingCsrfAndBearerTransportRemainsExempt() throws Exception {
        var a=book(create(own,first),type(),slot(0,1));String path="/api/appointments/"+a.id()+"/cancel";
        error(mvc.perform(post(path).cookie(new Cookie("access_token",tokens.get(Role.PATIENT))).contentType("application/json").content("{}")),403,"FORBIDDEN",null);
        Cookie csrf=mvc.perform(get("/api/auth/csrf-token")).andReturn().getResponse().getCookie("XSRF-TOKEN");assertNotNull(csrf);
        mvc.perform(post(path).cookie(new Cookie("access_token",tokens.get(Role.PATIENT)),csrf).header("X-XSRF-TOKEN",csrf.getValue()).contentType("application/json").content("{}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        mvc.perform(bearer(post(path),Role.PATIENT).cookie(new Cookie("access_token","synthetic-invalid-cookie")).contentType("application/json").content("{}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
    }
}
