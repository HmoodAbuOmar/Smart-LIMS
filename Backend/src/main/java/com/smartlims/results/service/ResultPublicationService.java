package com.smartlims.results.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.laboratory.entity.LaboratoryEvent;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.repository.*;
import com.smartlims.laboratory.service.*;
import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.orders.repository.TestOrderRepository;
import com.smartlims.results.dto.*;
import com.smartlims.results.entity.*;
import com.smartlims.results.repository.TestResultRepository;
import jakarta.persistence.EntityManager;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.*;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class ResultPublicationService {
    private final LaboratoryAccess access;
    private final LaboratoryLocks locks;
    private final TestOrderRepository orders;
    private final TestResultRepository results;
    private final ResultDraftService drafts;
    private final LaboratoryEventRepository events;
    private final ResultEvidence evidence;
    private final ResultMapping mapping;
    private final OrderCompletion completion;
    private final EntityManager entities;
    private final com.smartlims.notifications.service.NotificationPublisher notifications;

    public ResultPublicationService(LaboratoryAccess access, LaboratoryLocks locks, TestOrderRepository orders, TestResultRepository results, ResultDraftService drafts, LaboratoryEventRepository events, ResultEvidence evidence, ResultMapping mapping, OrderCompletion completion, EntityManager entities,
                                    com.smartlims.notifications.service.NotificationPublisher notifications) {
        this.access = access;
        this.locks = locks;
        this.orders = orders;
        this.results = results;
        this.drafts = drafts;
        this.events = events;
        this.evidence = evidence;
        this.mapping = mapping;
        this.completion = completion;
        this.entities = entities;
        this.notifications = notifications;
    }

    @Transactional
    public ResultResponse approve(Authentication actor, String id, @NotNull @Valid ResultRequests.Revision body) {
        var user = access.reviewer(actor);
        var r = drafts.locked(id);
        if (r.getVersion() != body.expectedVersion())
            throw LaboratoryException.conflict("RESULT_CHANGED");
        if (r.getEnteredBy().getId().equals(user.getId()) || events.existsByResultIdAndActorIdAndKindIn(r.getId(), user.getId(), List.of("CREATE", "EDIT", "CORRECTION")))
            throw LaboratoryException.forbidden();
        if (r.getStatus() == ResultStatus.APPROVED)
            return mapping.detail(r, false);
        if (r.getStatus() != ResultStatus.DRAFT)
            throw LaboratoryException.conflict("RESULT_STATE_CONFLICT");
        complete(r);
        var specimens = evidence.describe(r.getItem(), r.getSpecimenIds(), true, r.getMeasuredAt());
        var now = LaboratoryInput.now();
        r.approve(user, now, r.getItem().getOrder().getPatient(), mapping.snapshots(specimens));
        events.save(new LaboratoryEvent("result", r.getId(), "APPROVE", user, now, null));
        results.flush();
        entities.refresh(r);
        return mapping.detail(r, false);
    }

    @Transactional
    public ResultResponse publish(Authentication actor, String id, @NotNull @Valid ResultRequests.Revision body) {
        var user = access.reviewer(actor);
        var r = drafts.locked(id);
        if (r.getVersion() != body.expectedVersion())
            throw LaboratoryException.conflict("RESULT_CHANGED");
        if (r.getStatus() == ResultStatus.PUBLISHED)
            return mapping.detail(r, false);
        if (r.getStatus() != ResultStatus.APPROVED)
            throw LaboratoryException.conflict("RESULT_STATE_CONFLICT");
        complete(r);
        evidence.describe(r.getItem(), r.getSpecimenIds(), true, r.getMeasuredAt());
        var old = results.findByItem_IdAndCurrentTrue(r.getItem().getId());
        if ((r.getPrevious() == null && old.isPresent()) || (r.getPrevious() != null && (old.isEmpty() || !old.get().getId().equals(r.getPrevious().getId()))))
            throw LaboratoryException.conflict("RESULT_STATE_CONFLICT");
        old.ifPresent(TestResult::supersede);
        results.flush();
        var now = LaboratoryInput.now();
        r.publish(user, now);
        events.save(new LaboratoryEvent("result", r.getId(), "PUBLISH", user, now, null));
        results.flush();
        completion.reconsider(r.getItem().getOrder());
        orders.flush();
        entities.refresh(r);
        notifications.publication(r);
        return mapping.detail(r, false);
    }

    @Transactional
    public ResultDraftService.Created correct(Authentication actor, String id, @NotNull @Valid ResultRequests.Correction body, List<String> keys) {
        var user = access.current(actor, Role.LAB_TECHNICIAN);
        var key = LaboratoryInput.key(keys);
        var originalId = LaboratoryInput.uuid(id, "id");
        var reason = LaboratoryInput.text(body.reason(), "reason", 1000, true);
        var hash = LaboratoryInput.hash("CORRECTION", originalId, reason);
        locks.retry("result", user.getId(), key);
        var original = drafts.locked(id);
        var prior = results.findByEnteredBy_IdAndIdempotencyKey(user.getId(), key);
        if (prior.isPresent()) {
            if (!prior.get().getRequestHash().equals(hash))
                throw LaboratoryException.conflict("IDEMPOTENCY_KEY_REUSED");
            return new ResultDraftService.Created(mapping.detail(prior.get(), false), false);
        }
        if (original.getStatus() != ResultStatus.PUBLISHED || !original.isCurrent())
            throw LaboratoryException.conflict("RESULT_STATE_CONFLICT");
        if (results.existsByItem_IdAndStatusIn(original.getItem().getId(), List.of(ResultStatus.DRAFT, ResultStatus.APPROVED)))
            throw LaboratoryException.conflict("RESULT_WORKING_VERSION_EXISTS");
        var r = new TestResult(original.getItem(), results.lastNumber(original.getItem().getId()) + 1, original, reason, user, key, hash);
        r.setMeasuredAt(original.getMeasuredAt());
        r.setExplanation(original.getExplanation());
        r.getSpecimenIds().addAll(original.getSpecimenIds());
        original.getValues().forEach(v -> r.getValues().add(new ResultValue(r, v)));
        results.saveAndFlush(r);
        events.saveAndFlush(new LaboratoryEvent("result", r.getId(), "CORRECTION", user, LaboratoryInput.now(), reason));
        entities.refresh(r);
        return new ResultDraftService.Created(mapping.detail(r, false), true);
    }

    private void complete(TestResult r) {
        if (r.getItem().getOrder().getStatus() == OrderStatus.CANCELLED || r.getItem().getOrder().getStatus() == OrderStatus.PENDING || r.getMeasuredAt() == null || r.getMeasuredAt().isAfter(LaboratoryInput.now()) || r.getSpecimenIds().isEmpty() || r.getValues().isEmpty() || r.getValues().stream().anyMatch(v -> v.isRequired() && v.getNumericValue() == null && v.getTextValue() == null))
            throw LaboratoryException.conflict("RESULT_INCOMPLETE");
    }
}
