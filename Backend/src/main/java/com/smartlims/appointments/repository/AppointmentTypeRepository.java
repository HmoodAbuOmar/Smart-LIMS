package com.smartlims.appointments.repository;

import com.smartlims.appointments.entity.AppointmentType;
import java.util.UUID;
import org.springframework.data.jpa.repository.*;

public interface AppointmentTypeRepository extends JpaRepository<AppointmentType, UUID>, JpaSpecificationExecutor<AppointmentType> {
    boolean existsByCodeAndIdNot(String code, UUID id);
}
