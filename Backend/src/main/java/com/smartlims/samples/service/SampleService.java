package com.smartlims.samples.service;

import com.smartlims.auth.entity.UserAccount;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.entity.LaboratoryEvent;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.repository.*;
import com.smartlims.laboratory.service.LaboratoryAccess;
import com.smartlims.orders.entity.*;
import com.smartlims.orders.repository.*;
import com.smartlims.results.repository.TestResultRepository;
import com.smartlims.samples.dto.*;
import com.smartlims.samples.entity.*;
import com.smartlims.samples.repository.*;
import com.smartlims.visits.repository.VisitRepository;
import jakarta.persistence.EntityManager;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.*;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class SampleService {
    private final LaboratoryAccess access;
    private final LaboratoryLocks locks;
    private final VisitRepository visits;
    private final SampleRepository samples;
    private final SpecimenAttestationRepository attestations;
    private final TestOrderRepository orders;
    private final OrderItemRepository items;
    private final TestResultRepository results;
    private final LaboratoryEventRepository events;
    private final EntityManager entities;

    public SampleService(LaboratoryAccess access, LaboratoryLocks locks, VisitRepository visits, SampleRepository samples, SpecimenAttestationRepository attestations, TestOrderRepository orders, OrderItemRepository items, TestResultRepository results, LaboratoryEventRepository events, EntityManager entities) {
        this.access = access;
        this.locks = locks;
        this.visits = visits;
        this.samples = samples;
        this.attestations = attestations;
        this.orders = orders;
        this.items = items;
        this.results = results;
        this.events = events;
        this.entities = entities;
    }

    public record Created(SampleResponse sample, boolean created) {
    }

    @Transactional
    public Created create(Authentication actor, @NotNull @Valid SampleRequests.Create body, List<String> keys) {
        var user = access.clinical(actor);
        var key = LaboratoryInput.key(keys);
        var visitId = LaboratoryInput.uuid(body.visitId(), "visitId");
        var replacedId = body.replacesSampleId() == null ? null : LaboratoryInput.uuid(body.replacesSampleId(), "replacesSampleId");
        var collected = body.collectedAt() == null ? null : LaboratoryInput.time(body.collectedAt(), "collectedAt");
        if (collected != null && collected.isAfter(LaboratoryInput.now()))
            throw LaboratoryException.invalid("collectedAt");
        var type = LaboratoryInput.text(body.sampleType(), "sampleType", 40, true);
        var container = LaboratoryInput.text(body.containerType(), "containerType", 60, false);
        var hash = LaboratoryInput.hash(visitId, type, container, collected, replacedId);
        locks.retry("sample", user.getId(), key);
        var order = orders.findForUpdate(visits.orderId(visitId).orElseThrow(() -> LaboratoryException.missing("VISIT"))).orElseThrow();
        var visit = visits.findById(visitId).orElseThrow();
        var prior = samples.findByCreatedBy_IdAndIdempotencyKey(user.getId(), key);
        if (prior.isPresent()) {
            if (!prior.get().getRequestHash().equals(hash))
                throw LaboratoryException.conflict("IDEMPOTENCY_KEY_REUSED");
            return new Created(map(prior.get()), false);
        }
        if (order.getStatus() == OrderStatus.CANCELLED || order.getStatus() == OrderStatus.PENDING)
            throw LaboratoryException.conflict("SAMPLE_STATE_CONFLICT");
        Sample replaces = null;
        if (replacedId != null) {
            replaces = samples.findById(replacedId).orElseThrow(() -> LaboratoryException.missing("SAMPLE"));
            if (!replaces.getVisit().getOrder().getId().equals(order.getId()) || replaces.getStatus() != Sample.Status.REJECTED)
                throw LaboratoryException.conflict("SAMPLE_RELATIONSHIP_CONFLICT");
        }
        var s = samples.saveAndFlush(new Sample("SMP-%08d".formatted(samples.nextBarcode()), visit, type, container, collected, replaces, user, key, hash));
        events.saveAndFlush(new LaboratoryEvent("sample", s.getId(), "REGISTER", user, LaboratoryInput.now(), null));
        entities.refresh(s);
        return new Created(map(s), true);
    }

    @Transactional
    public SampleResponse receive(Authentication actor, String id, @NotNull @Valid SampleRequests.Revision body) {
        var user = access.clinical(actor);
        var s = locked(id);
        if (s.getStatus() == Sample.Status.RECEIVED) return map(s);
        if (s.getVersion() != body.expectedVersion()) throw LaboratoryException.conflict("SAMPLE_CHANGED");
        if (s.getStatus() != Sample.Status.REGISTERED) throw LaboratoryException.conflict("SAMPLE_STATE_CONFLICT");
        var now = LaboratoryInput.now();
        if (s.getCollectedAt() != null && s.getCollectedAt().isAfter(now))
            throw LaboratoryException.conflict("SAMPLE_STATE_CONFLICT");
        s.receive(user, now);
        events.save(new LaboratoryEvent("sample", s.getId(), "RECEIVE", user, now, null));
        samples.flush();
        entities.refresh(s);
        return map(s);
    }

    @Transactional
    public SampleResponse attest(Authentication actor, String id, @NotNull @Valid SampleRequests.Attest body) {
        var user = access.clinical(actor);
        var itemId = LaboratoryInput.uuid(body.orderItemId(), "orderItemId");
        var s = locked(id);
        var item = items.findById(itemId).orElseThrow(() -> LaboratoryException.missing("ORDER_ITEM"));
        if (s.getStatus() != Sample.Status.RECEIVED || !s.getVisit().getItemIds().contains(itemId) || !item.getOrder().getId().equals(s.getVisit().getOrder().getId()))
            throw LaboratoryException.conflict("SAMPLE_RELATIONSHIP_CONFLICT");
        if (attestations.findBySample_IdAndItem_Id(s.getId(), itemId).isEmpty()) {
            var now = LaboratoryInput.now();
            attestations.saveAndFlush(new SpecimenAttestation(s, item, user, now));
            events.saveAndFlush(new LaboratoryEvent("sample", s.getId(), "ATTEST", user, now, itemId.toString()));
        }
        return map(s);
    }

    @Transactional
    public SampleResponse reject(Authentication actor, String id, @NotNull @Valid SampleRequests.Reject body) {
        var user = access.clinical(actor);
        var reason = LaboratoryInput.text(body.reason(), "reason", 1000, true);
        var s = locked(id);
        if (s.getStatus() == Sample.Status.REJECTED) return map(s);
        if (s.getVersion() != body.expectedVersion()) throw LaboratoryException.conflict("SAMPLE_CHANGED");
        if (results.protectsSample(s.getId())) throw LaboratoryException.conflict("SAMPLE_IN_USE");
        var now = LaboratoryInput.now();
        s.reject(user, now, reason);
        events.save(new LaboratoryEvent("sample", s.getId(), "REJECT", user, now, reason));
        samples.flush();
        entities.refresh(s);
        return map(s);
    }

    @Transactional(readOnly = true)
    public SampleResponse get(Authentication actor, String id) {
        access.clinical(actor);
        return map(samples.findById(LaboratoryInput.uuid(id, "id")).orElseThrow(() -> LaboratoryException.missing("SAMPLE")));
    }

    @Transactional(readOnly = true)
    public LaboratoryQuery.PageBody<SampleResponse> list(Authentication actor, LaboratoryQuery query) {
        access.clinical(actor);
        var id = LaboratoryInput.uuid(query.get("orderId", null), "orderId");
        if (!orders.existsById(id)) throw LaboratoryException.missing("ORDER");
        Specification<Sample> spec = (r, q, c) -> c.equal(r.get("visit").get("order").get("id"), id);
        var page = query.find(samples, spec, Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by("id")));
        return LaboratoryQuery.page(page, page.getContent().stream().map(this::map).toList());
    }

    private Sample locked(String id) {
        var key = LaboratoryInput.uuid(id, "id");
        orders.findForUpdate(samples.orderId(key).orElseThrow(() -> LaboratoryException.missing("SAMPLE"))).orElseThrow();
        return samples.findById(key).orElseThrow();
    }

    private SampleResponse map(Sample s) {
        var links = attestations.findBySample_IdOrderByAttestedAtAscIdAsc(s.getId()).stream().map(a -> new SampleResponse.Attestation(a.getItem().getId(), a.getAttestedBy().getId(), a.getAttestedAt())).toList();
        var history = events.findBySampleIdOrderByRecordedAtAscIdAsc(s.getId()).stream().map(e -> new SampleResponse.Event(e.getKind(), e.getActorId(), e.getActorNameSnapshot(), e.getOccurredAt(), e.getRecordedAt(), e.getReason())).toList();
        return new SampleResponse(s.getId(), s.getBarcode(), s.getVisit().getId(), s.getVisit().getVisitNumber(), s.getVisit().getOrder().getId(), s.getStatus(), s.getVersion(), s.getSampleType(), s.getContainerType(), s.getCollectedAt(), s.getReceivedAt(), s.getReceivedBy() == null ? null : s.getReceivedBy().getId(), s.getRejectedAt(), s.getRejectedBy() == null ? null : s.getRejectedBy().getId(), s.getRejectionReason(), s.getReplaces() == null ? null : s.getReplaces().getId(), s.getCreatedAt(), s.getCreatedBy().getId(), links, history);
    }
}
