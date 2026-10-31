package com.smartlims.notifications.controller;

import com.smartlims.laboratory.dto.LaboratoryQuery;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.notifications.dto.NotificationResponse;
import com.smartlims.notifications.service.NotificationService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(path = "/api/notifications/me", produces = MediaType.APPLICATION_JSON_VALUE)
public class NotificationController {
    private final NotificationService notifications;
    public NotificationController(NotificationService notifications) { this.notifications = notifications; }
    @GetMapping
    public ResponseEntity<?> list(@RequestParam MultiValueMap<String,String> query, JwtAuthenticationToken actor) {
        return ok(notifications.listMe(actor, LaboratoryQuery.of(query, "category", "unread")));
    }
    @GetMapping("/unread-count")
    public ResponseEntity<?> count(@RequestParam MultiValueMap<String,String> query, JwtAuthenticationToken actor) {
        noQuery(query); return ok(new NotificationResponse.UnreadCount(notifications.unreadCount(actor)));
    }
    @PostMapping(path = "/{id}/read", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> read(@PathVariable String id, @RequestParam MultiValueMap<String,String> query,
            @Valid @RequestBody NotificationResponse.MarkRead body, JwtAuthenticationToken actor) {
        noQuery(query); return ok(notifications.markRead(actor, id));
    }
    @PostMapping(path = "/read-all", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> readAll(@RequestParam MultiValueMap<String,String> query,
            @Valid @RequestBody NotificationResponse.MarkRead body, JwtAuthenticationToken actor) {
        noQuery(query); return ok(notifications.markAllRead(actor));
    }
    private void noQuery(MultiValueMap<String,String> query) {
        if (!query.isEmpty()) throw LaboratoryException.invalid(query.keySet().iterator().next());
    }
    private ResponseEntity<?> ok(Object body) { return ResponseEntity.ok().header("Cache-Control", "no-store").body(body); }
}
