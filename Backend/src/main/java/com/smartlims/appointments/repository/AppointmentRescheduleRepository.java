package com.smartlims.appointments.repository;

import com.smartlims.appointments.entity.AppointmentReschedule;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppointmentRescheduleRepository extends JpaRepository<AppointmentReschedule, UUID> {
    Optional<AppointmentReschedule> findByAppointment_IdAndFromVersion(UUID id, long version);
}
