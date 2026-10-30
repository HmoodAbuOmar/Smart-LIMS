package com.smartlims.appointments.repository;

import com.smartlims.appointments.entity.*;
import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface AppointmentRepository extends JpaRepository<Appointment, UUID>, JpaSpecificationExecutor<Appointment> {
    Optional<Appointment> findByCreatedBy_IdAndIdempotencyKey(UUID actor, UUID key);
    Optional<Appointment> findByIdAndOrder_Patient_User_Id(UUID id, UUID actor);
    Optional<Appointment> findByOrder_IdAndStatus(UUID order, AppointmentStatus status);
    boolean existsByOrder_IdAndStatus(UUID order, AppointmentStatus status);
    long countBySlot_IdAndStatus(UUID slot, AppointmentStatus status);
    @Query("select count(a)>0 from Appointment a where a.order.id=:order and a.status in (com.smartlims.appointments.entity.AppointmentStatus.CONFIRMED,com.smartlims.appointments.entity.AppointmentStatus.CHECKED_IN)")
    boolean existsActiveOrder(@Param("order") UUID order);
    @Query("select count(a) from Appointment a where a.slot.id=:slot and a.status in (com.smartlims.appointments.entity.AppointmentStatus.CONFIRMED,com.smartlims.appointments.entity.AppointmentStatus.CHECKED_IN)")
    long countActiveBySlot(@Param("slot") UUID slot);
    @Query("select count(a)>0 from Appointment a where a.order.patient.id=:patient and a.slot.id=:slot and a.status in (com.smartlims.appointments.entity.AppointmentStatus.CONFIRMED,com.smartlims.appointments.entity.AppointmentStatus.CHECKED_IN) and (:exclude is null or a.id<>:exclude)")
    boolean patientConflict(@Param("patient") UUID patient, @Param("slot") UUID slot, @Param("exclude") UUID exclude);
    @Query("select a.order.id from Appointment a where a.id=:id")
    Optional<UUID> orderId(@Param("id") UUID id);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select a from Appointment a where a.id=:id")
    Optional<Appointment> findForUpdate(@Param("id") UUID id);
}
