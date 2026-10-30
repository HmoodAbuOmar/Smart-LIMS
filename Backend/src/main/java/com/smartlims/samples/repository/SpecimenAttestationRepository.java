package com.smartlims.samples.repository;

import com.smartlims.samples.entity.SpecimenAttestation;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SpecimenAttestationRepository extends JpaRepository<SpecimenAttestation,UUID>{
    Optional<SpecimenAttestation> findBySample_IdAndItem_Id(UUID sample,UUID item);
    List<SpecimenAttestation> findBySample_IdOrderByAttestedAtAscIdAsc(UUID sample);
}
