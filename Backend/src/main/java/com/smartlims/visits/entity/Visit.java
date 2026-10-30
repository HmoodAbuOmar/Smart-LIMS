package com.smartlims.visits.entity;

import com.smartlims.auth.entity.UserAccount;
import com.smartlims.appointments.entity.Appointment;
import com.smartlims.orders.entity.TestOrder;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;

@Entity @Table(name="visits") @Getter @NoArgsConstructor(access=AccessLevel.PROTECTED)
public class Visit {
    public enum Status {OPEN,COMPLETED}
    @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
    @Column(name="visit_number",nullable=false,length=30,updatable=false) private String visitNumber;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="order_id",nullable=false,updatable=false) private TestOrder order;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="appointment_id",updatable=false) private Appointment appointment;
    @Enumerated(EnumType.STRING) @Column(nullable=false,length=15) private Status status=Status.OPEN;
    @Version @Column(nullable=false) private long version;
    @Column(name="arrived_at",nullable=false,updatable=false) private Instant arrivedAt;
    @Column(name="completed_at") private Instant completedAt;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="created_by",nullable=false,updatable=false) private UserAccount createdBy;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="completed_by") private UserAccount completedBy;
    @Column(name="idempotency_key",nullable=false,updatable=false) private UUID idempotencyKey;
    @JdbcTypeCode(java.sql.Types.CHAR) @Column(name="request_hash",nullable=false,columnDefinition="char(64)",length=64,updatable=false) private String requestHash;
    @ElementCollection @CollectionTable(name="visit_items",joinColumns=@JoinColumn(name="visit_id")) @Column(name="order_item_id",nullable=false) private Set<UUID> itemIds=new HashSet<>();
    @CreationTimestamp @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
    @UpdateTimestamp @Column(name="updated_at",nullable=false) private Instant updatedAt;
    public Visit(String number,TestOrder order,Appointment appointment,Instant at,UserAccount actor,UUID key,String hash,Collection<UUID> items){visitNumber=number;this.order=order;this.appointment=appointment;arrivedAt=at;createdBy=actor;idempotencyKey=key;requestHash=hash;itemIds.addAll(items);}
    public void complete(UserAccount actor,Instant at){status=Status.COMPLETED;completedBy=actor;completedAt=at;}
}
