package com.smartlims.samples.dto;

import com.smartlims.samples.entity.Sample;
import java.time.Instant;
import java.util.*;

public record SampleResponse(UUID id,String barcode,UUID visitId,String visitNumber,UUID orderId,Sample.Status status,long version,String sampleType,String containerType,Instant collectedAt,Instant receivedAt,UUID receivedBy,Instant rejectedAt,UUID rejectedBy,String rejectionReason,UUID replacesSampleId,Instant createdAt,UUID createdBy,List<Attestation> attestations,List<Event> events){
 public record Attestation(UUID orderItemId,UUID attestedBy,Instant attestedAt){}
 public record Event(String kind,UUID actorId,String actorName,Instant occurredAt,Instant recordedAt,String reason){}
}
