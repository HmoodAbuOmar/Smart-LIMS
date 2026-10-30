package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.results.dto.*;
import com.smartlims.samples.dto.SampleRequests;
import com.smartlims.visits.dto.VisitRequests;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

class ResultPublicationTest extends LaboratoryTestSupport {
 @Test void onlyIndependentExplicitlyAuthorizedReviewersApproveAndPublish() throws Exception {
  var p=prepared(create(own,first));var r=p.result();
  assertThrows(LaboratoryException.class,()->publicationService.approve(actor(Role.ADMIN),r.id().toString(),new ResultRequests.Revision(r.version())));
  error(mvc.perform(bearer(post("/api/results/"+r.id()+"/approve"),Role.LAB_TECHNICIAN).contentType("application/json").content("{\"expectedVersion\":"+r.version()+"}")),403,"FORBIDDEN",null);
  var a=publicationService.approve(actor(reviewerId,Role.ADMIN),r.id().toString(),new ResultRequests.Revision(r.version()));assertEquals("APPROVED",a.status().name());assertNotNull(a.approvedAt());assertEquals(reviewerId,a.approvedBy().id());
  var published=publicationService.publish(actor(reviewerId,Role.ADMIN),r.id().toString(),new ResultRequests.Revision(a.version()));assertTrue(published.isCurrent());assertEquals("PUBLISHED",published.status().name());assertEquals(reviewerId,published.publishedBy().id());assertNotNull(published.publishedAt());
  assertEquals(published,publicationService.publish(actor(otherReviewerId,Role.ADMIN),r.id().toString(),new ResultRequests.Revision(published.version())));
 }
 @Test void authorCannotSelfApproveEvenAfterRoleBecomesAuthorizedAdmin() {
  define(first.getId());var o=create(own,first);var v=arrive(o,null);var s=received(v,o.items().getFirst().id());jdbc.update("UPDATE users SET role='LAB_TECHNICIAN' WHERE id=?",reviewerId);
  var r=draftService.create(actor(reviewerId,Role.LAB_TECHNICIAN),new ResultRequests.Create(o.items().getFirst().id().toString()),List.of(UUID.randomUUID().toString())).result();r=draftService.edit(actor(reviewerId,Role.LAB_TECHNICIAN),r.id().toString(),contents(r,s.id()));var ready=r;jdbc.update("UPDATE users SET role='ADMIN' WHERE id=?",reviewerId);
  assertEquals("FORBIDDEN",assertThrows(LaboratoryException.class,()->publicationService.approve(actor(reviewerId,Role.ADMIN),ready.id().toString(),new ResultRequests.Revision(ready.version()))).getCode());
  assertEquals(otherReviewerId,publicationService.approve(actor(otherReviewerId,Role.ADMIN),ready.id().toString(),new ResultRequests.Revision(ready.version())).approvedBy().id());
 }
 @Test void requiredMeasurementsAndReceivedSuitableSameOrderSpecimensAreRechecked() {
  define(first.getId());var o=create(own,first);var v=arrive(o,null);var r=draftService.create(actor(Role.LAB_TECHNICIAN),new ResultRequests.Create(o.items().getFirst().id().toString()),List.of(UUID.randomUUID().toString())).result();
  assertEquals("RESULT_INCOMPLETE",assertThrows(LaboratoryException.class,()->publicationService.approve(actor(reviewerId,Role.ADMIN),r.id().toString(),new ResultRequests.Revision(r.version()))).getCode());
  var s=sampleService.create(actor(Role.LAB_TECHNICIAN),new SampleRequests.Create(v.id().toString(),"SYNTHETIC",null,null,null),List.of(UUID.randomUUID().toString())).sample();var edited=draftService.edit(actor(Role.LAB_TECHNICIAN),r.id().toString(),contents(r,s.id()));
  assertEquals("RESULT_SPECIMEN_UNAVAILABLE",assertThrows(LaboratoryException.class,()->publicationService.approve(actor(reviewerId,Role.ADMIN),edited.id().toString(),new ResultRequests.Revision(edited.version()))).getCode());
  sampleService.receive(actor(Role.LAB_TECHNICIAN),s.id().toString(),new SampleRequests.Revision(0L));
  assertThrows(LaboratoryException.class,()->publicationService.approve(actor(reviewerId,Role.ADMIN),edited.id().toString(),new ResultRequests.Revision(edited.version())));
  sampleService.attest(actor(Role.LAB_TECHNICIAN),s.id().toString(),new SampleRequests.Attest(o.items().getFirst().id().toString()));assertNotNull(publicationService.approve(actor(reviewerId,Role.ADMIN),edited.id().toString(),new ResultRequests.Revision(edited.version())));
 }
 @Test void editingApprovedContentInvalidatesApprovalAndUnlocksRemovedUnpublishedEvidence() {
  var p=prepared(create(own,first));var r=publicationService.approve(actor(reviewerId,Role.ADMIN),p.result().id().toString(),new ResultRequests.Revision(p.result().version()));
  assertEquals("SAMPLE_IN_USE",assertThrows(LaboratoryException.class,()->sampleService.reject(actor(Role.LAB_TECHNICIAN),p.sample().id().toString(),new SampleRequests.Reject(p.sample().version(),"Synthetic reason"))).getCode());
  var b=contents(r,p.sample().id());var edited=draftService.edit(actor(Role.LAB_TECHNICIAN),r.id().toString(),new ResultRequests.Edit(r.version(),b.measuredAt(),List.of(),b.explanation(),b.values()));assertEquals("DRAFT",edited.status().name());assertNull(edited.approvedBy());assertNull(edited.approvedAt());assertTrue(edited.events().stream().anyMatch(e->e.kind().equals("APPROVAL_INVALIDATED")));
  assertEquals("REJECTED",sampleService.reject(actor(Role.LAB_TECHNICIAN),p.sample().id().toString(),new SampleRequests.Reject(p.sample().version(),"Synthetic reason")).status().name());
 }
 @Test void publishedSnapshotsAndDatabaseChildrenAreImmutable() {
  var p=prepared(create(own,first));var r=publish(p.result());jdbc.update("UPDATE patients SET full_name='Changed synthetic profile' WHERE id=?",own.getId());jdbc.update("UPDATE users SET full_name='Changed reviewer label' WHERE id=?",reviewerId);
  var stored=draftService.get(actor(Role.LAB_TECHNICIAN),r.id().toString());assertEquals(r.patient(),stored.patient());assertEquals(r.approvedBy(),stored.approvedBy());assertEquals(r.specimens(),stored.specimens());
  assertEquals("RESULT_STATE_CONFLICT",assertThrows(LaboratoryException.class,()->draftService.edit(actor(Role.LAB_TECHNICIAN),r.id().toString(),contents(r,p.sample().id()))).getCode());
  assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->jdbc.update("UPDATE test_results SET explanation='Tampered' WHERE id=?",r.id()));
  assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->jdbc.update("UPDATE result_values SET numeric_value=99 WHERE result_id=? AND numeric_value IS NOT NULL",r.id()));
  assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->jdbc.update("DELETE FROM laboratory_events WHERE result_id=?",r.id()));
 }
 @Test void correctionsRetainCurrentPublicationUntilAtomicReplacementAndPreserveDefinitionSnapshots() {
  var p=prepared(create(own,first));var published=publish(p.result());var key=List.of(UUID.randomUUID().toString());var body=new ResultRequests.Correction("Synthetic correction");var correction=publicationService.correct(actor(Role.LAB_TECHNICIAN),published.id().toString(),body,key).result();
  assertEquals(2,correction.versionNumber());assertEquals(published.id(),correction.previousResultId());assertEquals(published.values(),correction.values());assertTrue(draftService.get(actor(Role.LAB_TECHNICIAN),published.id().toString()).isCurrent());
  assertEquals(correction,publicationService.correct(actor(Role.LAB_TECHNICIAN),published.id().toString(),body,key).result());
  var next=publish(correction);assertTrue(next.isCurrent());var old=draftService.get(actor(Role.LAB_TECHNICIAN),published.id().toString());assertFalse(old.isCurrent());assertTrue(old.superseded());assertEquals(published.values(),old.values());assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM test_results WHERE is_current",Integer.class));
 }
 @Test void orderCompletesOnlyAfterAllItemsPublishedAndAllVisitsClosed() {
  define(first.getId());define(free.getId());var o=create(own,first,free);var v=arrive(o,null);
  for(var item:o.items()){
   var s=received(v,item.id());var r=draftService.create(actor(Role.LAB_TECHNICIAN),new ResultRequests.Create(item.id().toString()),List.of(UUID.randomUUID().toString())).result();publish(draftService.edit(actor(Role.LAB_TECHNICIAN),r.id().toString(),contents(r,s.id())));
   assertEquals("IN_PROGRESS",jdbc.queryForObject("SELECT status FROM test_orders WHERE id=?",String.class,o.id()));
  }
  visitService.complete(actor(Role.RECEPTIONIST),v.id().toString(),new VisitRequests.Completion(0L,LaboratoryInput.now().toString()));assertEquals("COMPLETED",jdbc.queryForObject("SELECT status FROM test_orders WHERE id=?",String.class,o.id()));
 }
 @Test void publicationAndVisitCompletionRaceStillCompleteOrder() throws Exception {
  var o=create(own,first);var p=prepared(o);var approved=publicationService.approve(actor(reviewerId,Role.ADMIN),p.result().id().toString(),new ResultRequests.Revision(p.result().version()));
  try(var pool=Executors.newFixedThreadPool(2)){var gate=new CountDownLatch(1);var a=pool.submit(()->{gate.await();return publicationService.publish(actor(reviewerId,Role.ADMIN),approved.id().toString(),new ResultRequests.Revision(approved.version()));});var b=pool.submit(()->{gate.await();return visitService.complete(actor(Role.RECEPTIONIST),p.visit().id().toString(),new VisitRequests.Completion(0L,LaboratoryInput.now().toString()));});gate.countDown();a.get(15,TimeUnit.SECONDS);b.get(15,TimeUnit.SECONDS);}
  assertEquals("COMPLETED",jdbc.queryForObject("SELECT status FROM test_orders WHERE id=?",String.class,o.id()));
 }
 @Test void approveVersusRejectionNeverApprovesRejectedEvidence() throws Exception {
  var p=prepared(create(own,first));
  try(var pool=Executors.newFixedThreadPool(2)){var gate=new CountDownLatch(1);var a=pool.submit(()->{gate.await();try{publicationService.approve(actor(reviewerId,Role.ADMIN),p.result().id().toString(),new ResultRequests.Revision(p.result().version()));return "APPROVED";}catch(LaboratoryException e){return e.getCode();}});var b=pool.submit(()->{gate.await();try{sampleService.reject(actor(Role.LAB_TECHNICIAN),p.sample().id().toString(),new SampleRequests.Reject(p.sample().version(),"Synthetic race"));return "REJECTED";}catch(LaboratoryException e){return e.getCode();}});gate.countDown();String x=a.get(15,TimeUnit.SECONDS),y=b.get(15,TimeUnit.SECONDS);assertTrue((x.equals("APPROVED")&&y.equals("SAMPLE_IN_USE"))||(x.equals("RESULT_SPECIMEN_UNAVAILABLE")&&y.equals("REJECTED")));}
 }
 @Test void failedReplacementPublicationRollsBackCurrentMarkersAndLifecycleEvents() {
  var p=prepared(create(own,first));var original=publish(p.result());var next=publicationService.correct(actor(Role.LAB_TECHNICIAN),original.id().toString(),new ResultRequests.Correction("Synthetic correction"),List.of(UUID.randomUUID().toString())).result();var approved=publicationService.approve(actor(reviewerId,Role.ADMIN),next.id().toString(),new ResultRequests.Revision(next.version()));
  assertThrows(IllegalStateException.class,()->new TransactionTemplate(transactionManager).execute(tx->{publicationService.publish(actor(reviewerId,Role.ADMIN),approved.id().toString(),new ResultRequests.Revision(approved.version()));throw new IllegalStateException("Synthetic rollback");}));
  assertTrue(draftService.get(actor(Role.LAB_TECHNICIAN),original.id().toString()).isCurrent());assertEquals("APPROVED",draftService.get(actor(Role.LAB_TECHNICIAN),next.id().toString()).status().name());assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM laboratory_events WHERE kind='PUBLISH'",Integer.class));
 }
}
