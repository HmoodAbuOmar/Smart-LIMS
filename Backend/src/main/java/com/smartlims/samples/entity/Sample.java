package com.smartlims.samples.entity;

import com.smartlims.auth.entity.UserAccount;
import com.smartlims.visits.entity.Visit;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;

@Entity @Table(name="samples") @Getter @NoArgsConstructor(access=AccessLevel.PROTECTED)
public class Sample {
    public enum Status {REGISTERED,RECEIVED,REJECTED}
    @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
    @Column(nullable=false,length=30,updatable=false) private String barcode;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="visit_id",nullable=false,updatable=false) private Visit visit;
    @Column(name="sample_type",nullable=false,length=40,updatable=false) private String sampleType;
    @Column(name="container_type",length=60,updatable=false) private String containerType;
    @Column(name="collected_at",updatable=false) private Instant collectedAt;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=15) private Status status=Status.REGISTERED;
    @Version @Column(nullable=false) private long version;
    @Column(name="received_at") private Instant receivedAt;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="received_by") private UserAccount receivedBy;
    @Column(name="rejected_at") private Instant rejectedAt;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="rejected_by") private UserAccount rejectedBy;
    @Column(name="rejection_reason",length=1000) private String rejectionReason;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="replaces_sample_id",updatable=false) private Sample replaces;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="created_by",nullable=false,updatable=false) private UserAccount createdBy;
    @Column(name="idempotency_key",nullable=false,updatable=false) private UUID idempotencyKey;
    @JdbcTypeCode(java.sql.Types.CHAR) @Column(name="request_hash",nullable=false,length=64,columnDefinition="char(64)",updatable=false) private String requestHash;
    @CreationTimestamp @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
    @UpdateTimestamp @Column(name="updated_at",nullable=false) private Instant updatedAt;
    public Sample(String barcode,Visit visit,String type,String container,Instant collected,Sample replaces,UserAccount actor,UUID key,String hash){this.barcode=barcode;this.visit=visit;sampleType=type;containerType=container;collectedAt=collected;this.replaces=replaces;createdBy=actor;idempotencyKey=key;requestHash=hash;}
    public void receive(UserAccount actor,Instant at){status=Status.RECEIVED;receivedBy=actor;receivedAt=at;}
    public void reject(UserAccount actor,Instant at,String reason){status=Status.REJECTED;rejectedBy=actor;rejectedAt=at;rejectionReason=reason;}
}
