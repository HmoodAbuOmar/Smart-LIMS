package com.smartlims.results.entity;

import com.smartlims.auth.entity.UserAccount;
import com.smartlims.orders.entity.OrderItem;
import com.smartlims.patients.entity.Patient;
import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;

@Entity @Table(name="test_results") @Getter @NoArgsConstructor(access=AccessLevel.PROTECTED)
public class TestResult {
    @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="order_item_id",nullable=false,updatable=false) private OrderItem item;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=15) private ResultStatus status=ResultStatus.DRAFT;
    @Version @Column(nullable=false) private long version;
    @Column(name="version_number",nullable=false,updatable=false) private int versionNumber;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="previous_result_id",updatable=false) private TestResult previous;
    @Column(name="is_current",nullable=false) private boolean current;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="entered_by",nullable=false,updatable=false) private UserAccount enteredBy;
    @Setter @Column(name="measured_at") private Instant measuredAt;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="approved_by") private UserAccount approvedBy;
    @Column(name="approved_at") private Instant approvedAt;
    @Column(name="approver_name_snapshot",length=120) private String approverName;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="published_by") private UserAccount publishedBy;
    @Column(name="published_at") private Instant publishedAt;
    @Column(name="publisher_name_snapshot",length=120) private String publisherName;
    @Column(name="correction_reason",length=1000,updatable=false) private String correctionReason;
    @Column(name="patient_name_snapshot",length=120) private String patientName;
    @Column(name="patient_number_snapshot",length=30) private String patientNumber;
    @Column(name="birth_date_snapshot") private LocalDate birthDate;
    @Setter @Column(columnDefinition="text") private String explanation;
    @Setter @Column(name="specimen_snapshots",nullable=false,columnDefinition="text") private String specimenSnapshots="[]";
    @Column(name="idempotency_key",nullable=false,updatable=false) private UUID idempotencyKey;
    @JdbcTypeCode(java.sql.Types.CHAR) @Column(name="request_hash",nullable=false,length=64,columnDefinition="char(64)",updatable=false) private String requestHash;
    @ElementCollection @CollectionTable(name="result_specimens",joinColumns=@JoinColumn(name="result_id")) @Column(name="sample_id",nullable=false) private Set<UUID> specimenIds=new HashSet<>();
    @OneToMany(mappedBy="result",cascade=CascadeType.PERSIST) private List<ResultValue> values=new ArrayList<>();
    @CreationTimestamp @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
    @UpdateTimestamp @Column(name="updated_at",nullable=false) private Instant updatedAt;
    public TestResult(OrderItem item,int number,TestResult previous,String reason,UserAccount actor,UUID key,String hash){this.item=item;versionNumber=number;this.previous=previous;correctionReason=reason;enteredBy=actor;idempotencyKey=key;requestHash=hash;}
    public void invalidateApproval(){status=ResultStatus.DRAFT;approvedBy=null;approvedAt=null;approverName=null;specimenSnapshots="[]";}
    public void approve(UserAccount actor,Instant at,Patient patient,String snapshots){status=ResultStatus.APPROVED;approvedBy=actor;approvedAt=at;approverName=actor.getFullName();patientName=patient.getFullName();patientNumber=patient.getPatientNumber();birthDate=patient.getDateOfBirth();specimenSnapshots=snapshots;}
    public void publish(UserAccount actor,Instant at){status=ResultStatus.PUBLISHED;publishedBy=actor;publishedAt=at;publisherName=actor.getFullName();current=true;}
    public void supersede(){current=false;}
    public void touch(Instant at){updatedAt=updatedAt!=null&&!at.isAfter(updatedAt)?updatedAt.plusNanos(1000):at;}
}
