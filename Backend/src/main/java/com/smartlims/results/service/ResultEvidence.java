package com.smartlims.results.service;

import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.orders.entity.OrderItem;
import com.smartlims.results.dto.ResultResponse;
import com.smartlims.samples.entity.Sample;
import com.smartlims.samples.repository.*;

import java.time.Instant;
import java.util.*;

import org.springframework.stereotype.Component;

@Component
public class ResultEvidence {
    private final SampleRepository samples;
    private final SpecimenAttestationRepository attestations;

    public ResultEvidence(SampleRepository samples, SpecimenAttestationRepository attestations) {
        this.samples = samples;
        this.attestations = attestations;
    }

    public void draftLinks(OrderItem item, Collection<UUID> ids) {
        for (var id : ids) {
            var s = samples.findById(id).orElseThrow(() -> LaboratoryException.conflict("RESULT_SPECIMEN_UNAVAILABLE"));
            if (!s.getVisit().getOrder().getId().equals(item.getOrder().getId()) || !s.getVisit().getItemIds().contains(item.getId()) || s.getStatus() == Sample.Status.REJECTED)
                throw LaboratoryException.conflict("RESULT_SPECIMEN_UNAVAILABLE");
        }
    }

    public List<ResultResponse.Specimen> describe(OrderItem item, Collection<UUID> ids, boolean requireEligible, Instant measuredAt) {
        List<ResultResponse.Specimen> result = new ArrayList<>();
        for (var id : ids.stream().sorted(Comparator.comparing(UUID::toString)).toList()) {
            var s = samples.findById(id).orElseThrow(() -> LaboratoryException.conflict("RESULT_SPECIMEN_UNAVAILABLE"));
            var a = attestations.findBySample_IdAndItem_Id(id, item.getId());
            if (requireEligible && (s.getStatus() != Sample.Status.RECEIVED || a.isEmpty() || !s.getVisit().getOrder().getId().equals(item.getOrder().getId()) || !s.getVisit().getItemIds().contains(item.getId()) || (s.getCollectedAt() != null && measuredAt.isBefore(s.getCollectedAt()))))
                throw LaboratoryException.conflict("RESULT_SPECIMEN_UNAVAILABLE");
            result.add(new ResultResponse.Specimen(s.getId(), s.getBarcode(), s.getSampleType(), s.getContainerType(), s.getStatus().name(), s.getCollectedAt(), s.getReceivedAt(), s.getReceivedBy() == null ? null : new ResultResponse.Actor(s.getReceivedBy().getId(), s.getReceivedBy().getFullName()), s.getVisit().getId(), s.getVisit().getVisitNumber(), s.getVisit().getArrivedAt(), s.getVisit().getAppointment() == null ? null : s.getVisit().getAppointment().getId(), a.map(t -> new ResultResponse.Actor(t.getAttestedBy().getId(), t.getAttestedBy().getFullName())).orElse(null), a.map(t -> t.getAttestedAt()).orElse(null), s.getReplaces() == null ? null : s.getReplaces().getId(), s.getReplaces() == null ? null : s.getReplaces().getBarcode()));
        }
        return result;
    }
}
