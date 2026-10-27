package com.smartlims.patients.entity;

import com.smartlims.auth.entity.UserAccount;
import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "patients")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Patient {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "patient_number", nullable = false, unique = true, length = 30, updatable = false)
    private String patientNumber;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", unique = true)
    private UserAccount user;

    @Column(name = "full_name", nullable = false, length = 120)
    @Setter
    private String fullName;

    @Column(name = "date_of_birth", nullable = false)
    @Setter
    private LocalDate dateOfBirth;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @Setter
    private PatientGender gender;

    @Column(name = "phone_number", nullable = false, length = 20)
    @Setter
    private String phoneNumber;

    @Column(columnDefinition = "text")
    @Setter
    private String address;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false, updatable = false)
    private UserAccount createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    @Setter
    private Instant updatedAt;

    public Patient(String patientNumber, UserAccount createdBy, String fullName, LocalDate dateOfBirth, PatientGender gender, String phoneNumber, String address) {
        this.patientNumber = patientNumber;
        this.createdBy = createdBy;
        this.fullName = fullName;
        this.dateOfBirth = dateOfBirth;
        this.gender = gender;
        this.phoneNumber = phoneNumber;
        this.address = address;
    }

    // Only the verified creation/linking service calls this after locking and checking both sides.
    public void linkAccount(UserAccount account) {
        if (user != null) throw new IllegalStateException("Patient profile is already linked.");
        this.user = java.util.Objects.requireNonNull(account);
    }
}
