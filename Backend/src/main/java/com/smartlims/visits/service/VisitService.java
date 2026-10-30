package com.smartlims.visits.service;

import com.smartlims.auth.entity.*;
import com.smartlims.appointments.entity.*;
import com.smartlims.appointments.repository.*;
import com.smartlims.appointments.service.AppointmentMapping;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.entity.LaboratoryEvent;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.repository.*;
import com.smartlims.laboratory.service.*;
import com.smartlims.orders.entity.*;
import com.smartlims.orders.repository.*;
import com.smartlims.patients.repository.PatientRepository;
import com.smartlims.results.repository.TestResultRepository;
import com.smartlims.samples.repository.SampleRepository;
import com.smartlims.visits.dto.*;
import com.smartlims.visits.entity.Visit;
import com.smartlims.visits.repository.VisitRepository;
import jakarta.persistence.EntityManager;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.*;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service @Validated
public class VisitService {
 private final LaboratoryAccess access;private final LaboratoryLocks locks;private final TestOrderRepository orders;private final OrderItemRepository items;private final VisitRepository visits;private final AppointmentRepository appointments;private final AppointmentSlotRepository slots;private final LaboratoryEventRepository events;private final TestResultRepository results;private final SampleRepository samples;private final PatientRepository patients;private final OrderCompletion completion;private final EntityManager entities;
 public VisitService(LaboratoryAccess access,LaboratoryLocks locks,TestOrderRepository orders,OrderItemRepository items,VisitRepository visits,AppointmentRepository appointments,AppointmentSlotRepository slots,LaboratoryEventRepository events,TestResultRepository results,SampleRepository samples,PatientRepository patients,OrderCompletion completion,EntityManager entities){this.access=access;this.locks=locks;this.orders=orders;this.items=items;this.visits=visits;this.appointments=appointments;this.slots=slots;this.events=events;this.results=results;this.samples=samples;this.patients=patients;this.completion=completion;this.entities=entities;}
 public record Created(VisitResponse visit,boolean created){}
 @Transactional public Created arrive(Authentication actor,@NotNull @Valid VisitRequests.Arrival body,List<String> keys){
  var user=access.current(actor,Role.ADMIN,Role.RECEPTIONIST);var key=LaboratoryInput.key(keys);var orderId=LaboratoryInput.uuid(body.orderId(),"orderId");var selected=LaboratoryInput.ids(body.orderItemIds(),"orderItemIds",1,100);var at=LaboratoryInput.time(body.arrivedAt(),"arrivedAt");var appointmentId=body.appointmentId()==null?null:LaboratoryInput.uuid(body.appointmentId(),"appointmentId");
  if(at.isAfter(LaboratoryInput.now()))throw LaboratoryException.invalid("arrivedAt");var hash=LaboratoryInput.hash(orderId,appointmentId,selected.stream().map(UUID::toString).sorted().toList(),at);
  locks.retry("visit",user.getId(),key);var order=orders.findForUpdate(orderId).orElseThrow(()->LaboratoryException.missing("ORDER"));
  var prior=visits.findByCreatedBy_IdAndIdempotencyKey(user.getId(),key);if(prior.isPresent()){if(!prior.get().getRequestHash().equals(hash))throw LaboratoryException.conflict("IDEMPOTENCY_KEY_REUSED");return new Created(map(prior.get()),false);}
  if(order.getStatus()!=OrderStatus.PENDING&&order.getStatus()!=OrderStatus.IN_PROGRESS)throw LaboratoryException.conflict("ORDER_NOT_PROCESSABLE");
  var owned=items.findByOrder_Id(orderId).stream().map(OrderItem::getId).toList();if(!owned.containsAll(selected))throw LaboratoryException.invalid("orderItemIds");
  Appointment appointment=null;if(appointmentId!=null){slots.lockSchedule();appointment=appointments.findForUpdate(appointmentId).orElseThrow(()->LaboratoryException.missing("APPOINTMENT"));
   if(!appointment.getOrder().getId().equals(orderId)||appointment.getStatus()!=AppointmentStatus.CONFIRMED||visits.existsByAppointment_Id(appointmentId))throw LaboratoryException.conflict("APPOINTMENT_STATE_CONFLICT");
   slots.findForUpdate(appointment.getSlot().getId()).orElseThrow();appointment.checkIn(user,at);events.save(new LaboratoryEvent("appointment",appointmentId,"CHECK_IN",user,at,null));}
  order.setStatus(OrderStatus.IN_PROGRESS);var visit=visits.saveAndFlush(new Visit("VIS-%08d".formatted(visits.nextNumber()),order,appointment,at,user,key,hash,selected));events.saveAndFlush(new LaboratoryEvent("visit",visit.getId(),"ARRIVAL",user,at,null));entities.refresh(visit);return new Created(map(visit),true);
 }
 @Transactional public VisitResponse complete(Authentication actor,String id,@NotNull @Valid VisitRequests.Completion body){
  var user=access.current(actor,Role.ADMIN,Role.RECEPTIONIST);var key=LaboratoryInput.uuid(id,"id");var order=orders.findForUpdate(visits.orderId(key).orElseThrow(()->LaboratoryException.missing("VISIT"))).orElseThrow();var visit=visits.findById(key).orElseThrow();var at=LaboratoryInput.time(body.completedAt(),"completedAt");
  if(at.isBefore(visit.getArrivedAt())||at.isAfter(LaboratoryInput.now()))throw LaboratoryException.invalid("completedAt");
  if(visit.getStatus()==Visit.Status.COMPLETED)return map(visit);if(visit.getVersion()!=body.expectedVersion())throw LaboratoryException.conflict("VISIT_CHANGED");
  if(visit.getAppointment()!=null){slots.lockSchedule();var appointment=appointments.findForUpdate(visit.getAppointment().getId()).orElseThrow();slots.findForUpdate(appointment.getSlot().getId()).orElseThrow();if(appointment.getStatus()!=AppointmentStatus.CHECKED_IN)throw LaboratoryException.conflict("APPOINTMENT_STATE_CONFLICT");appointment.completeVisit(user,at);events.save(new LaboratoryEvent("appointment",appointment.getId(),"VISIT_COMPLETE",user,at,null));}
  visit.complete(user,at);events.save(new LaboratoryEvent("visit",key,"COMPLETE",user,at,null));visits.flush();completion.reconsider(order);orders.flush();entities.refresh(visit);return map(visit);
 }
 @Transactional public com.smartlims.appointments.dto.AppointmentResponses.Detail noShow(Authentication actor,String id,@NotNull @Valid VisitRequests.Revision body){
  var user=access.current(actor,Role.ADMIN,Role.RECEPTIONIST);var key=LaboratoryInput.uuid(id,"id");orders.findForUpdate(appointments.orderId(key).orElseThrow(()->LaboratoryException.missing("APPOINTMENT"))).orElseThrow();slots.lockSchedule();var a=appointments.findForUpdate(key).orElseThrow();slots.findForUpdate(a.getSlot().getId()).orElseThrow();var now=LaboratoryInput.now();
  if(a.getStatus()==AppointmentStatus.NO_SHOW)return AppointmentMapping.detail(a,now);if(a.getVersion()!=body.expectedVersion())throw LaboratoryException.conflict("APPOINTMENT_CHANGED");
  if(a.getStatus()!=AppointmentStatus.CONFIRMED||visits.existsByAppointment_Id(key)||a.getSlot().getEndsAt().isAfter(now))throw LaboratoryException.conflict("APPOINTMENT_STATE_CONFLICT");
  a.noShow(user,now);events.save(new LaboratoryEvent("appointment",key,"NO_SHOW",user,now,null));appointments.flush();entities.refresh(a);return AppointmentMapping.detail(a,now);
 }
 @Transactional(readOnly=true) public VisitResponse get(Authentication actor,String id,boolean self){var user=self?access.current(actor,Role.PATIENT):access.current(actor,Role.ADMIN,Role.RECEPTIONIST,Role.LAB_TECHNICIAN);var v=visits.findById(LaboratoryInput.uuid(id,"id")).orElseThrow(()->LaboratoryException.missing("VISIT"));access.own(user,v.getOrder(),"VISIT");return map(v,self);}
 @Transactional(readOnly=true) public LaboratoryQuery.PageBody<VisitResponse> list(Authentication actor,LaboratoryQuery query,boolean self){
  var orderId=query.optionalId("orderId");var user=self?access.current(actor,Role.PATIENT):access.current(actor,Role.ADMIN,Role.RECEPTIONIST,Role.LAB_TECHNICIAN);if(self&&!patients.existsByUser_Id(user.getId()))throw LaboratoryException.notLinked();
  Specification<Visit> spec=(r,q,c)->c.and(orderId==null?c.conjunction():c.equal(r.get("order").get("id"),orderId),self?c.equal(r.get("order").get("patient").get("user").get("id"),user.getId()):c.conjunction());var page=query.find(visits,spec,Sort.by(Sort.Direction.DESC,"arrivedAt").and(Sort.by("id")));return LaboratoryQuery.page(page,page.getContent().stream().map(v->map(v,self)).toList());
 }
 private VisitResponse map(Visit v){return map(v,false);}
 private VisitResponse map(Visit v,boolean self){
  var tests=items.findAllById(v.getItemIds()).stream().sorted(Comparator.comparing(OrderItem::getTestCodeSnapshot).thenComparing(i->i.getId().toString())).map(i->{var current=results.findByItem_IdAndCurrentTrue(i.getId());return new VisitResponse.Item(i.getId(),i.getTestCodeSnapshot(),i.getTestNameSnapshot(),current.isPresent()?"PUBLISHED":"PENDING",current.map(r->r.getId()).orElse(null),self?current.map(r->"/api/results/me/"+r.getId()).orElse(null):null);}).toList();
  var specimens=samples.findByVisit_IdOrderByCreatedAtAscIdAsc(v.getId()).stream().map(s->new VisitResponse.Specimen(s.getId(),s.getBarcode(),s.getSampleType(),s.getStatus().name(),s.getCollectedAt(),s.getReceivedAt())).toList();
  return new VisitResponse(v.getId(),v.getVisitNumber(),v.getOrder().getId(),v.getOrder().getOrderNumber(),v.getOrder().getStatus(),v.getStatus(),v.getVersion(),v.getArrivedAt(),v.getCompletedAt(),v.getAppointment()==null?null:v.getAppointment().getId(),tests,specimens);
 }
}
