package com.smartlims.labtests.repository;

import com.smartlims.labtests.entity.ReferenceRange;
import java.util.UUID;
import org.springframework.data.jpa.repository.*;

public interface ReferenceRangeRepository extends JpaRepository<ReferenceRange, UUID>, JpaSpecificationExecutor<ReferenceRange> {
    boolean existsByParameter_Id(UUID parameterId);
}
