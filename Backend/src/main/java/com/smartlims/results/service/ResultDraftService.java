package com.smartlims.results.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.labtests.entity.TestParameter;
import com.smartlims.labtests.repository.*;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.entity.LaboratoryEvent;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.repository.*;
import com.smartlims.laboratory.service.LaboratoryAccess;
import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.orders.repository.*;
import com.smartlims.results.dto.*;
import com.smartlims.results.entity.*;
import com.smartlims.results.repository.TestResultRepository;
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
public class ResultDraftService {
 private final LaboratoryAccess access;private final LaboratoryLocks locks;private final TestOrderRepository orders;private final OrderItemRepository items;private final TestResultRepository results;private final LabTestRepository tests;private final TestParameterRepository parameters;private final VisitRepository visits;private final LaboratoryEventRepository events;private final ResultMapping mapping;private final ResultEvidence evidence;private final EntityManager entities;
 public ResultDraftService(LaboratoryAccess access,LaboratoryLocks locks,TestOrderRepository orders,OrderItemRepository items,TestResultRepository results,LabTestRepository tests,TestParameterRepository parameters,VisitRepository visits,LaboratoryEventRepository events,ResultMapping mapping,ResultEvidence evidence,EntityManager entities){this.access=access;this.locks=locks;this.orders=orders;this.items=items;this.results=results;this.tests=tests;this.parameters=parameters;this.visits=visits;this.events=events;this.mapping=mapping;this.evidence=evidence;this.entities=entities;}
 public record Created(ResultResponse result,boolean created){}
 @Transactional public Created create(Authentication actor,@NotNull @Valid ResultRequests.Create body,List<String> keys){
  var user=access.current(actor,Role.LAB_TECHNICIAN);var key=LaboratoryInput.key(keys);var itemId=LaboratoryInput.uuid(body.orderItemId(),"orderItemId");var hash=LaboratoryInput.hash("CREATE",itemId);locks.retry("result",user.getId(),key);
  var item=items.findById(itemId).orElseThrow(()->LaboratoryException.missing("ORDER_ITEM"));var order=orders.findForUpdate(item.getOrder().getId()).orElseThrow();
  var prior=results.findByEnteredBy_IdAndIdempotencyKey(user.getId(),key);if(prior.isPresent()){if(!prior.get().getRequestHash().equals(hash))throw LaboratoryException.conflict("IDEMPOTENCY_KEY_REUSED");return new Created(mapping.detail(prior.get(),false),false);}
  if(order.getStatus()!=OrderStatus.IN_PROGRESS||!visits.hasItem(itemId))throw LaboratoryException.conflict("RESULT_STATE_CONFLICT");
  if(results.existsByItem_IdAndStatusIn(itemId,List.of(ResultStatus.DRAFT,ResultStatus.APPROVED)))throw LaboratoryException.conflict("RESULT_WORKING_VERSION_EXISTS");if(results.findByItem_IdAndCurrentTrue(itemId).isPresent())throw LaboratoryException.conflict("RESULT_STATE_CONFLICT");
  tests.findForSnapshot(item.getLabTest().getId()).orElseThrow();var definitions=parameters.findByLabTest_IdAndActiveTrueOrderByDisplayOrderAscCodeAscIdAsc(item.getLabTest().getId());if(definitions.isEmpty()||definitions.size()>200)throw LaboratoryException.conflict("RESULT_DEFINITIONS_UNAVAILABLE");
  var r=new TestResult(item,results.lastNumber(itemId)+1,null,null,user,key,hash);definitions.forEach(p->r.getValues().add(new ResultValue(r,p)));results.saveAndFlush(r);events.saveAndFlush(new LaboratoryEvent("result",r.getId(),"CREATE",user,LaboratoryInput.now(),null));entities.refresh(r);return new Created(mapping.detail(r,false),true);
 }
 @Transactional public ResultResponse edit(Authentication actor,String id,@NotNull @Valid ResultRequests.Edit body){
  var user=access.current(actor,Role.LAB_TECHNICIAN);var r=locked(id);if(r.getVersion()!=body.expectedVersion())throw LaboratoryException.conflict("RESULT_CHANGED");if(r.getStatus()==ResultStatus.PUBLISHED)throw LaboratoryException.conflict("RESULT_STATE_CONFLICT");
  var measured=body.measuredAt()==null?null:LaboratoryInput.time(body.measuredAt(),"measuredAt");if(measured!=null&&measured.isAfter(LaboratoryInput.now()))throw LaboratoryException.invalid("measuredAt");var specimenIds=LaboratoryInput.ids(body.specimenIds(),"specimenIds",0,100);evidence.draftLinks(r.getItem(),specimenIds);
  Map<UUID,ResultRequests.Value> supplied=new HashMap<>();for(var v:body.values()){var parameter=LaboratoryInput.uuid(v.parameterId(),"values");if(supplied.put(parameter,v)!=null)throw LaboratoryException.invalid("values");}
  if(supplied.size()!=r.getValues().size()||r.getValues().stream().anyMatch(v->!supplied.containsKey(v.getParameter().getId())))throw LaboratoryException.invalid("values");
  var now=LaboratoryInput.now();if(r.getStatus()==ResultStatus.APPROVED){r.invalidateApproval();events.save(new LaboratoryEvent("result",r.getId(),"APPROVAL_INVALIDATED",user,now,null));}
  for(var v:r.getValues()){
   var s=supplied.get(v.getParameter().getId());var text=LaboratoryInput.text(s.textValue(),"values",10000,false);var flag=ResultValue.Flag.valueOf(s.flag());
   if((s.numericValue()!=null&&text!=null)||(s.numericValue()!=null&&v.getType()!=TestParameter.ValueType.NUMERIC)||(text!=null&&v.getType()!=TestParameter.ValueType.TEXT)||(s.numericComparator()!=null&&s.numericValue()==null)||(s.referenceMin()!=null&&s.referenceMax()!=null&&s.referenceMin().compareTo(s.referenceMax())>0)||(text==null&&s.numericValue()==null&&flag!=ResultValue.Flag.NOT_EVALUATED))throw LaboratoryException.invalid("values");
   v.setNumericValue(s.numericValue());v.setNumericComparator(s.numericComparator());v.setTextValue(text);v.setReferenceText(LaboratoryInput.text(s.referenceText(),"values",2000,false));v.setReferenceMin(s.referenceMin());v.setReferenceMax(s.referenceMax());v.setFlag(flag);v.setNotes(LaboratoryInput.text(s.notes(),"values",2000,false));
  }
  r.setMeasuredAt(measured);r.setExplanation(LaboratoryInput.text(body.explanation(),"explanation",10000,false));r.getSpecimenIds().clear();r.getSpecimenIds().addAll(specimenIds);r.touch(now);events.save(new LaboratoryEvent("result",r.getId(),"EDIT",user,now,null));results.flush();entities.refresh(r);return mapping.detail(r,false);
 }
 @Transactional(readOnly=true) public ResultResponse get(Authentication actor,String id){access.clinical(actor);return mapping.detail(results.findById(LaboratoryInput.uuid(id,"id")).orElseThrow(()->LaboratoryException.missing("RESULT")),false);}
 @Transactional(readOnly=true) public LaboratoryQuery.PageBody<ResultResponse> versions(Authentication actor,LaboratoryQuery query){access.clinical(actor);var itemId=LaboratoryInput.uuid(query.get("orderItemId",null),"orderItemId");if(!items.existsById(itemId))throw LaboratoryException.missing("ORDER_ITEM");Specification<TestResult> spec=(r,q,c)->c.equal(r.get("item").get("id"),itemId);var page=query.find(results,spec,Sort.by(Sort.Direction.DESC,"versionNumber"));return LaboratoryQuery.page(page,page.getContent().stream().map(r->mapping.detail(r,false)).toList());}
 TestResult locked(String id){var key=LaboratoryInput.uuid(id,"id");orders.findForUpdate(results.orderId(key).orElseThrow(()->LaboratoryException.missing("RESULT"))).orElseThrow();return results.findById(key).orElseThrow();}
}
