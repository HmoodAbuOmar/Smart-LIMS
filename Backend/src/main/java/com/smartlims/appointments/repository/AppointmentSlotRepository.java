package com.smartlims.appointments.repository;

import com.smartlims.appointments.entity.AppointmentSlot;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface AppointmentSlotRepository extends JpaRepository<AppointmentSlot, UUID>, JpaSpecificationExecutor<AppointmentSlot> {
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select s from AppointmentSlot s where s.id=:id")
    Optional<AppointmentSlot> findForUpdate(@Param("id") UUID id);
    @Query("select count(s)>0 from AppointmentSlot s where s.startsAt < :end and s.endsAt > :start")
    boolean overlaps(@Param("start") Instant start, @Param("end") Instant end);
    @Query(value = "SELECT id FROM appointment_coordination WHERE id=1 FOR UPDATE", nativeQuery = true)
    int lockSchedule();
}
