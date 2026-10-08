package com.smartlims.patients.entity;

import com.smartlims.auth.entity.UserAccount;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
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
    @JoinColumn(name = "user_id", unique = true, updatable = false)
    private UserAccount user;

    @Column(name = "full_name", nullable = false, length = 120)
    private String fullName;

    @Column(name = "date_of_birth", nullable = false)
    private LocalDate dateOfBirth;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private PatientGender gender;

    @Column(name = "phone_number", nullable = false, length = 20)
    private String phoneNumber;

    @Column(columnDefinition = "text")
    private String address;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false, updatable = false)
    private UserAccount createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public static Patient create(String patientNumber, UserAccount creator, String fullName,
            LocalDate dateOfBirth, PatientGender gender, String phoneNumber, String address) {
        Patient patient = new Patient();
        patient.patientNumber = patientNumber;
        patient.createdBy = creator;
        patient.replaceProfile(fullName, dateOfBirth, gender, phoneNumber, address);
        return patient;
    }

    public void replaceProfile(String fullName, LocalDate dateOfBirth, PatientGender gender,
            String phoneNumber, String address) {
        this.fullName = fullName;
        this.dateOfBirth = dateOfBirth;
        this.gender = gender;
        this.phoneNumber = phoneNumber;
        this.address = address;
        // Ensure even an otherwise identical successful PUT updates its timestamp.
        this.updatedAt = Instant.now();
    }
}
