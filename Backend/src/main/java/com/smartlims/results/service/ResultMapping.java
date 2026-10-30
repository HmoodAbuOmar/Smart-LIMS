package com.smartlims.results.service;

import com.smartlims.laboratory.repository.LaboratoryEventRepository;
import com.smartlims.results.dto.ResultResponse;
import com.smartlims.results.entity.*;
import java.util.*;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Component
public class ResultMapping {
 private final JsonMapper json;private final LaboratoryEventRepository events;private final ResultEvidence evidence;
 public ResultMapping(JsonMapper json,LaboratoryEventRepository events,ResultEvidence evidence){this.json=json;this.events=events;this.evidence=evidence;}
 public String snapshots(List<ResultResponse.Specimen> specimens){return json.writeValueAsString(specimens);}
 public ResultResponse detail(TestResult r,boolean patient){
  var item=r.getItem();var p=item.getOrder().getPatient();boolean snapshot=r.getStatus()!=ResultStatus.DRAFT;
  List<ResultResponse.Specimen> specimens=snapshot?json.readValue(r.getSpecimenSnapshots(),new TypeReference<List<ResultResponse.Specimen>>(){}):evidence.describe(item,r.getSpecimenIds(),false,r.getMeasuredAt());
  var values=r.getValues().stream().sorted(Comparator.comparingInt(ResultValue::getDisplayOrder).thenComparing(ResultValue::getCode).thenComparing(v->v.getParameter().getId().toString())).map(v->new ResultResponse.Value(v.getParameter().getId(),v.getCode(),v.getName(),v.getType(),v.getUnit(),v.getMethod(),v.getDisplayOrder(),v.isRequired(),v.getNumericValue(),v.getNumericComparator(),v.getTextValue(),v.getReferenceText(),v.getReferenceMin(),v.getReferenceMax(),v.getFlag(),v.getNotes())).toList();
  var history=patient?List.<ResultResponse.Event>of():events.findByResultIdOrderByRecordedAtAscIdAsc(r.getId()).stream().map(e->new ResultResponse.Event(e.getKind(),new ResultResponse.Actor(e.getActorId(),e.getActorNameSnapshot()),e.getOccurredAt(),e.getRecordedAt(),e.getReason())).toList();
  return new ResultResponse(r.getId(),item.getId(),item.getOrder().getId(),item.getOrder().getOrderNumber(),item.getTestCodeSnapshot(),item.getTestNameSnapshot(),r.getVersionNumber(),r.getVersion(),r.getStatus(),r.isCurrent(),r.getStatus()==ResultStatus.PUBLISHED&&!r.isCurrent(),r.getPrevious()==null?null:r.getPrevious().getId(),r.getCorrectionReason(),new ResultResponse.Patient(snapshot?r.getPatientName():p.getFullName(),snapshot?r.getPatientNumber():p.getPatientNumber(),snapshot?r.getBirthDate():p.getDateOfBirth()),r.getMeasuredAt(),r.getApprovedBy()==null?null:new ResultResponse.Actor(r.getApprovedBy().getId(),r.getApproverName()),r.getApprovedAt(),r.getPublishedBy()==null?null:new ResultResponse.Actor(r.getPublishedBy().getId(),r.getPublisherName()),r.getPublishedAt(),r.getExplanation(),values,specimens,specimens.stream().map(ResultResponse.Specimen::visitId).distinct().toList(),r.getCreatedAt(),r.getUpdatedAt(),history);
 }
}
