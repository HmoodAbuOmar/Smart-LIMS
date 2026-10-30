package com.smartlims.patients.controller;

import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.patients.dto.PatientDashboardResponse;
import com.smartlims.patients.service.PatientDashboardService;
import org.springframework.http.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
public class PatientDashboardController {
    private final PatientDashboardService dashboard;

    public PatientDashboardController(PatientDashboardService dashboard) { this.dashboard = dashboard; }

    @GetMapping(path = "/api/patients/me/dashboard", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<PatientDashboardResponse> getMe(@RequestParam MultiValueMap<String, String> query,
            JwtAuthenticationToken actor) {
        if (!query.isEmpty()) throw LaboratoryException.invalid(query.keySet().iterator().next());
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(dashboard.getMe(actor));
    }
}
