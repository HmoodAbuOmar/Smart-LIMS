package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.visits.dto.VisitRequests;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.laboratory.exception.LaboratoryException;
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

class VisitWorkflowTest extends LaboratoryTestSupport {
 @Autowired OrderCancellationService cancellation;
 @Test void realArrivalChecksInAppointmentAndCompletionDoesNotInventPublishedResults() throws Exception {
  var o=create(own,first);var a=appointment(o,0,1);var v=arrive(o,a.id());assertEquals("IN_PROGRESS",v.orderStatus().name());assertEquals(a.id(),v.appointmentId());
  assertEquals("CHECKED_IN",jdbc.queryForObject("SELECT status FROM appointments WHERE id=?",String.class,a.id()));
  mvc.perform(bearer(get("/api/appointments/me/"+a.id()),Role.PATIENT)).andExpect(jsonPath("$.canCancel").value(false)).andExpect(jsonPath("$.canReschedule").value(false));
  mvc.perform(bearer(get("/api/orders/me/"+o.id()),Role.PATIENT)).andExpect(jsonPath("$.visitDetailsAvailable").value(true));
  mvc.perform(bearer(get("/api/visits/me/"+v.id()),Role.PATIENT)).andExpect(status().isOk()).andExpect(jsonPath("$.tests[0].testName").value(o.items().getFirst().testName())).andExpect(jsonPath("$.tests[0].resultStatus").value("PENDING"));
  var closed=visitService.complete(actor(Role.ADMIN),v.id().toString(),new VisitRequests.Completion(0L,LaboratoryInput.now().toString()));assertEquals("COMPLETED",closed.status().name());assertEquals("IN_PROGRESS",closed.orderStatus().name());
  assertEquals("COMPLETED",jdbc.queryForObject("SELECT status FROM appointments WHERE id=?",String.class,a.id()));
  assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM test_results",Integer.class));
 }
 @Test void selectedItemsOwnershipRoleValidationAndReplayAreEnforced() throws Exception {
  var o=create(own,first);var otherOrder=create(other,first);var key=List.of(UUID.randomUUID().toString());var body=new VisitRequests.Arrival(o.id().toString(),null,List.of(o.items().getFirst().id().toString()),LaboratoryInput.now().toString());
  var v=visitService.arrive(actor(Role.RECEPTIONIST),body,key);assertEquals(v.visit(),visitService.arrive(actor(Role.RECEPTIONIST),body,key).visit());
  assertThrows(LaboratoryException.class,()->visitService.arrive(actor(Role.ADMIN),new VisitRequests.Arrival(o.id().toString(),null,List.of(otherOrder.items().getFirst().id().toString()),body.arrivedAt()),List.of(UUID.randomUUID().toString())));
  error(mvc.perform(post("/api/visits/me/"+v.visit().id()).header("Authorization","Bearer "+strangerToken)),403,"FORBIDDEN",null);
  error(mvc.perform(get("/api/visits/me/"+v.visit().id()).header("Authorization","Bearer "+strangerToken)),404,"VISIT_NOT_FOUND",null);
  error(mvc.perform(bearer(post("/api/visits"),Role.LAB_TECHNICIAN).contentType("application/json").content("{}")),403,"FORBIDDEN",null);
  assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM visits",Integer.class));
 }
 @Test void checkedInAppointmentStillConsumesSharedCapacityAndCannotBeDirectlyCancelled() throws Exception {
  var o=create(own,first);var a=appointment(o,0,1);arrive(o,a.id());
  error(mvc.perform(bearer(post("/api/appointments/"+a.id()+"/cancel"),Role.PATIENT).contentType("application/json").content("{}")),409,"APPOINTMENT_NOT_CHANGEABLE",null);
  var otherOrder=create(other,first);var body=new com.smartlims.appointments.dto.AppointmentRequests.Book(otherOrder.id().toString(),a.typeId().toString(),a.slotId().toString());
  assertEquals("APPOINTMENT_SLOT_UNAVAILABLE",assertThrows(com.smartlims.appointments.exception.AppointmentException.class,()->bookingService.book(actor(Role.ADMIN),body,List.of(UUID.randomUUID().toString()))).getCode());
 }
 @Test void noShowRequiresUnvisitedAppointmentAfterEndAndReleasesCapacity() {
  var o=create(own,first);var a=appointment(o,0,1);assertThrows(LaboratoryException.class,()->visitService.noShow(actor(Role.ADMIN),a.id().toString(),new VisitRequests.Revision(0L)));
  jdbc.update("UPDATE appointment_slots SET starts_at=starts_at-interval '2 days',ends_at=ends_at-interval '2 days' WHERE id=?",a.slotId());
  var noShow=visitService.noShow(actor(Role.RECEPTIONIST),a.id().toString(),new VisitRequests.Revision(0L));assertEquals("NO_SHOW",noShow.status().name());assertFalse(noShow.canCancel());assertEquals(noShow,visitService.noShow(actor(Role.ADMIN),a.id().toString(),new VisitRequests.Revision(0L)));
  assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM test_orders WHERE id=?",String.class,o.id()));assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM visits",Integer.class));
  assertThrows(LaboratoryException.class,()->arrive(o,a.id()));
 }
 @Test void arrivalAndOrderCancellationSerializeWithoutPartialEvents() throws Exception {
  var o=create(own,first);
  try(var pool=Executors.newFixedThreadPool(2)){
   var gate=new CountDownLatch(1);var a=pool.submit(()->{gate.await();try{arrive(o,null);return "ARRIVED";}catch(LaboratoryException e){return e.getCode();}});
   var b=pool.submit(()->{gate.await();try{cancellation.cancel(actor(Role.PATIENT),o.id().toString(),new CancelOrderRequest(null));return "CANCELLED";}catch(com.smartlims.orders.exception.OrderException e){return e.getCode();}});gate.countDown();var x=a.get(15,TimeUnit.SECONDS);var y=b.get(15,TimeUnit.SECONDS);
   assertTrue((x.equals("ARRIVED")&&y.equals("ORDER_NOT_CANCELLABLE"))||(x.equals("ORDER_NOT_PROCESSABLE")&&y.equals("CANCELLED")));
  }
  String state=jdbc.queryForObject("SELECT status FROM test_orders WHERE id=?",String.class,o.id());assertEquals(state.equals("IN_PROGRESS")?1:0,jdbc.queryForObject("SELECT count(*) FROM visits",Integer.class));
 }
 @Test void rollbackRestoresOrderAppointmentVisitAndEventsTogether() {
  var o=create(own,first);var a=appointment(o,0,1);
  assertThrows(IllegalStateException.class,()->new TransactionTemplate(transactionManager).execute(tx->{arrive(o,a.id());throw new IllegalStateException("Synthetic rollback");}));
  assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM test_orders WHERE id=?",String.class,o.id()));assertEquals("CONFIRMED",jdbc.queryForObject("SELECT status FROM appointments WHERE id=?",String.class,a.id()));assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM visits",Integer.class));assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM laboratory_events",Integer.class));
 }
}
