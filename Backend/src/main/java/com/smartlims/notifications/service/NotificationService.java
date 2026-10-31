package com.smartlims.notifications.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.service.LaboratoryAccess;
import com.smartlims.notifications.dto.NotificationResponse;
import com.smartlims.notifications.entity.PatientNotification;
import com.smartlims.notifications.repository.PatientNotificationRepository;
import com.smartlims.patients.repository.PatientRepository;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class NotificationService {
    private final LaboratoryAccess access;
    private final PatientRepository patients;
    private final PatientNotificationRepository notifications;

    public NotificationService(LaboratoryAccess access, PatientRepository patients, PatientNotificationRepository notifications) {
        this.access = access; this.patients = patients; this.notifications = notifications;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public LaboratoryQuery.PageBody<NotificationResponse> listMe(Authentication actor, LaboratoryQuery query) {
        String category = query.get("category", null);
        if (category != null && !Set.of("ORDERS", "RESULTS", "APPOINTMENTS", "SYSTEM").contains(category))
            throw LaboratoryException.invalid("category");
        Boolean unread = query.values().containsKey("unread") ? query.bool("unread") : null;
        var user = linkedUser(actor);
        var paging = PageRequest.of(query.page(), query.size());
        var page = paging.getOffset() > Integer.MAX_VALUE
                ? new PageImpl<PatientNotification>(List.of(), paging, notifications.countVisible(user, category, unread))
                : notifications.page(user, category, unread, paging);
        return LaboratoryQuery.page(page, page.getContent().stream().map(this::response).toList());
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public long unreadCount(Authentication actor) { return notifications.countVisible(linkedUser(actor), null, true); }

    @Transactional
    public NotificationResponse markRead(Authentication actor, String id) {
        var user = linkedUser(actor);
        var key = LaboratoryInput.uuid(id, "id");
        notifications.owned(user, key).orElseThrow(() -> LaboratoryException.missing("NOTIFICATION"));
        notifications.markRead(user, key);
        return response(notifications.owned(user, key).orElseThrow(() -> LaboratoryException.missing("NOTIFICATION")));
    }

    @Transactional
    public NotificationResponse.MarkAllResult markAllRead(Authentication actor) {
        return new NotificationResponse.MarkAllResult(notifications.markAllRead(linkedUser(actor)));
    }

    private UUID linkedUser(Authentication actor) {
        var user = access.current(actor, Role.PATIENT);
        if (!patients.existsByUser_Id(user.getId())) throw LaboratoryException.notLinked();
        return user.getId();
    }

    private NotificationResponse response(PatientNotification n) {
        var a = n.getAppointment(); var r = n.getResult();
        String url = r != null ? "/api/results/me/" + r.getId()
                : a != null ? "/api/appointments/me/" + a.getId() : "/api/orders/me/" + n.getOrder().getId();
        return new NotificationResponse(n.getId(), n.getCategory(), n.getEventType(), n.getTitle(), n.getMessage(),
                n.getCreatedAt(), n.getReadAt() != null, n.getReadAt(), n.getOrder().getId(), a == null ? null : a.getId(),
                r == null ? null : r.getId(), r == null ? null : r.getItem().getId(), url);
    }
}
