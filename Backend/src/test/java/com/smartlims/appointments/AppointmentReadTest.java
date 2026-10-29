package com.smartlims.appointments;

import com.smartlims.appointments.dto.AppointmentRequests;
import com.smartlims.auth.entity.Role;
import java.time.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AppointmentReadTest extends AppointmentTestSupport {
    @Test void groupsAllOwnedRowsByStartAndStatusWithCorrectActionsAndPaging() throws Exception {
        var t=type();var upcoming=book(create(own,first),t,slot(0,2));var cancelled=book(create(own,first),t,slot(1,1));var past=book(create(own,first),t,slot(2,1));
        book(create(other,first),t,slot(3,1));
        jdbc.update("UPDATE appointments SET status='CANCELLED',cancelled_by=created_by,cancelled_at=created_at WHERE id=?",cancelled.id());
        jdbc.update("UPDATE appointment_slots SET starts_at=starts_at-interval '2 days',ends_at=ends_at-interval '2 days' WHERE id=?",past.slotId());
        mvc.perform(bearer(get("/api/appointments/me"),Role.PATIENT)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].id").value(upcoming.id().toString())).andExpect(jsonPath("$.content[0].canCancel").value(true));
        mvc.perform(bearer(get("/api/appointments/me").param("tab","PAST").param("size","1"),Role.PATIENT)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.totalPages").value(2)).andExpect(jsonPath("$.content[0].id").value(cancelled.id().toString())).andExpect(jsonPath("$.content[0].actionIneligibilityReason").value("CANCELLED"));
        mvc.perform(bearer(get("/api/appointments/me/"+past.id()),Role.PATIENT)).andExpect(jsonPath("$.status").value("CONFIRMED")).andExpect(jsonPath("$.canReschedule").value(false)).andExpect(jsonPath("$.canCancel").value(false)).andExpect(jsonPath("$.actionIneligibilityReason").value("STARTED"));
        mvc.perform(bearer(get("/api/appointments/me").param("page","2147483647").param("size","100"),Role.PATIENT)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content").isEmpty());
    }
    @Test void displaysLabDateTimeOffsetsAndOriginalTypeNamesAcrossDst() throws Exception {
        var t=type();
        for(String start:new String[]{"2030-01-01T23:30:00Z","2030-07-01T23:30:00Z"}) {
            var instant=Instant.parse(start);var slot=schedule.createSlot(actor(Role.ADMIN),new AppointmentRequests.SlotCreate(start,instant.plusSeconds(1800).toString(),1,true));
            var a=book(create(own,first),t,slot);var expected=instant.atZone(ZoneId.of("Asia/Jerusalem"));
            mvc.perform(bearer(get("/api/appointments/me/"+a.id()),Role.PATIENT)).andExpect(status().isOk()).andExpect(jsonPath("$.appointmentDate").value(expected.toLocalDate().toString())).andExpect(jsonPath("$.appointmentTime").value(expected.toLocalTime().withSecond(0).toString()+":00")).andExpect(jsonPath("$.utcOffset").value(expected.getOffset().toString()));
        }
        schedule.saveType(actor(Role.ADMIN),t.id().toString(),new AppointmentRequests.Type(t.code(),"Renamed synthetic",false));
        mvc.perform(bearer(get("/api/appointments/me"),Role.PATIENT)).andExpect(jsonPath("$.content[0].typeName").value("Synthetic appointment"));
    }
    @Test void deniesForeignUnknownAndUnlinkedDetailAndEnforcesPatientOnlyLists() throws Exception {
        var a=book(create(other,first),type(),slot(0,1));
        error(mvc.perform(bearer(get("/api/appointments/me/"+a.id()),Role.PATIENT)),404,"APPOINTMENT_NOT_FOUND",null);
        error(mvc.perform(bearer(get("/api/appointments/me/00000000-0000-0000-0000-000000000000"),Role.PATIENT)),404,"APPOINTMENT_NOT_FOUND",null);
        error(mvc.perform(bearer(get("/api/appointments/me"),Role.ADMIN)),403,"FORBIDDEN",null);
        jdbc.update("UPDATE patients SET user_id=null WHERE id=?",own.getId());
        error(mvc.perform(bearer(get("/api/appointments/me"),Role.PATIENT)),404,"PATIENT_PROFILE_NOT_LINKED",null);
        error(mvc.perform(bearer(get("/api/appointments/me/"+a.id()),Role.PATIENT)),404,"APPOINTMENT_NOT_FOUND",null);
    }
    @Test void strictTabsQueriesAndOrderStateEligibilityMatchContract() throws Exception {
        var o=create(own,first);var a=book(o,type(),slot(0,1));state(o.id(),"IN_PROGRESS");
        mvc.perform(bearer(get("/api/appointments/me/"+a.id()),Role.PATIENT)).andExpect(status().isOk()).andExpect(jsonPath("$.canCancel").value(true)).andExpect(jsonPath("$.canReschedule").value(false)).andExpect(jsonPath("$.actionIneligibilityReason").value("ORDER_NOT_PENDING"));
        error(mvc.perform(bearer(get("/api/appointments/me").param("tab","upcoming"),Role.PATIENT)),400,"VALIDATION_ERROR","tab");
        error(mvc.perform(bearer(get("/api/appointments/me").param("tab","UPCOMING","PAST"),Role.PATIENT)),400,"VALIDATION_ERROR","tab");
        error(mvc.perform(bearer(get("/api/appointments/me").param("patientId",other.getId().toString()),Role.PATIENT)),400,"VALIDATION_ERROR","patientId");
    }
}
