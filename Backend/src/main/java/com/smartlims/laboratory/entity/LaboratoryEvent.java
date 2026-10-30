package com.smartlims.laboratory.entity;

import com.smartlims.auth.entity.UserAccount;
import com.smartlims.laboratory.dto.LaboratoryInput;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.*;

@Entity @Table(name="laboratory_events") @Getter @NoArgsConstructor(access=AccessLevel.PROTECTED)
public class LaboratoryEvent {
    @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
    @Column(name="result_id",updatable=false) private UUID resultId;
    @Column(name="sample_id",updatable=false) private UUID sampleId;
    @Column(name="visit_id",updatable=false) private UUID visitId;
    @Column(name="appointment_id",updatable=false) private UUID appointmentId;
    @Column(nullable=false,length=40,updatable=false) private String kind;
    @Column(name="actor_id",nullable=false,updatable=false) private UUID actorId;
    @Column(name="actor_name_snapshot",nullable=false,length=120,updatable=false) private String actorNameSnapshot;
    @Column(name="occurred_at",nullable=false,updatable=false) private Instant occurredAt;
    @Column(name="recorded_at",nullable=false,updatable=false) private Instant recordedAt;
    @Column(length=1000,updatable=false) private String reason;
    public LaboratoryEvent(String resource,UUID id,String kind,UserAccount actor,Instant occurredAt,String reason){
        switch(resource){case "result"->resultId=id;case "sample"->sampleId=id;case "visit"->visitId=id;case "appointment"->appointmentId=id;default->throw new IllegalArgumentException("Unknown event resource");}
        this.kind=kind;actorId=actor.getId();actorNameSnapshot=actor.getFullName();this.occurredAt=occurredAt;recordedAt=LaboratoryInput.now();this.reason=reason;
    }
}
