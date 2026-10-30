package com.smartlims.laboratory.repository;

import com.smartlims.laboratory.entity.LaboratoryEvent;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LaboratoryEventRepository extends JpaRepository<LaboratoryEvent,UUID>{
    List<LaboratoryEvent> findByResultIdOrderByRecordedAtAscIdAsc(UUID id);
    List<LaboratoryEvent> findBySampleIdOrderByRecordedAtAscIdAsc(UUID id);
    List<LaboratoryEvent> findByVisitIdOrderByRecordedAtAscIdAsc(UUID id);
    boolean existsByResultIdAndActorIdAndKindIn(UUID result,UUID actor,Collection<String> kinds);
}
