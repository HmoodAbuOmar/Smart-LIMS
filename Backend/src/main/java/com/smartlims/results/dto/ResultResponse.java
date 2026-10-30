package com.smartlims.results.dto;

import com.smartlims.labtests.entity.TestParameter;
import com.smartlims.results.entity.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

public record ResultResponse(UUID id,UUID orderItemId,UUID orderId,String orderNumber,String testCode,String testName,int versionNumber,long version,ResultStatus status,boolean isCurrent,boolean superseded,UUID previousResultId,String correctionReason,Patient patient,Instant measuredAt,Actor approvedBy,Instant approvedAt,Actor publishedBy,Instant publishedAt,String explanation,List<Value> values,List<Specimen> specimens,List<UUID> visitIds,Instant createdAt,Instant updatedAt,List<Event> events){
 public record Patient(String name,String number,LocalDate dateOfBirth){}
 public record Actor(UUID id,String name){}
 public record Value(UUID parameterId,String code,String name,TestParameter.ValueType resultType,String unit,String method,int displayOrder,boolean required,BigDecimal numericValue,String numericComparator,String textValue,String referenceText,BigDecimal referenceMin,BigDecimal referenceMax,ResultValue.Flag flag,String notes){}
 public record Specimen(UUID id,String barcode,String sampleType,String containerType,String status,Instant collectedAt,Instant receivedAt,Actor receivedBy,UUID visitId,String visitNumber,Instant arrivedAt,UUID appointmentId,Actor attestedBy,Instant attestedAt,UUID replacesSampleId,String replacesBarcode){}
 public record Event(String kind,Actor actor,Instant occurredAt,Instant recordedAt,String reason){}
}
