package com.smartlims.laboratory.controller;

import com.smartlims.laboratory.dto.LaboratoryQuery;
import com.smartlims.laboratory.service.AdminActivityService;
import org.springframework.http.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(produces = MediaType.APPLICATION_JSON_VALUE)
public class AdminActivityController {
    private final AdminActivityService activity;
    public AdminActivityController(AdminActivityService activity) { this.activity = activity; }

    @GetMapping("/api/admin/dashboard")
    public ResponseEntity<?> dashboard(@RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        query.keySet().forEach(k -> {
            if (!k.equals("days")) throw com.smartlims.laboratory.exception.LaboratoryException.invalid(k);
        });
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(activity.dashboard(actor,
                LaboratoryQuery.of(query, "days")));
    }

    @GetMapping("/api/audit-logs")
    public ResponseEntity<?> audit(@RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(activity.audit(actor,
                LaboratoryQuery.of(query, "fromDate", "toDate", "actorId", "action", "search")));
    }

    @GetMapping("/api/reports/operations")
    public ResponseEntity<?> report(@RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        // Aggregate responses are not pages; reject page/size as well as all other unknown keys.
        query.keySet().forEach(k -> {
            if (!k.equals("fromDate") && !k.equals("toDate"))
                throw com.smartlims.laboratory.exception.LaboratoryException.invalid(k);
        });
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(activity.report(actor,
                LaboratoryQuery.of(query, "fromDate", "toDate")));
    }
}
