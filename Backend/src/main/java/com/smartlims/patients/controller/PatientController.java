package com.smartlims.patients.controller;

import com.smartlims.patients.dto.*;
import com.smartlims.patients.service.PatientService;
import jakarta.validation.Valid;

import java.net.URI;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(path = "/api/patients", produces = MediaType.APPLICATION_JSON_VALUE)
public class PatientController {
    private final PatientService patients;

    public PatientController(PatientService patients) {
        this.patients = patients;
    }

    @GetMapping("/me/profile")
    public ResponseEntity<PatientSelfProfileResponse> getMyProfile(@RequestParam MultiValueMap<String, String> query,
                                                                   JwtAuthenticationToken authentication) {
        rejectProfileQuery(query);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(patients.getMyProfile(authentication));
    }

    @PutMapping(path = "/me/profile", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<PatientSelfProfileResponse> updateMyProfile(@RequestParam MultiValueMap<String, String> query,
                                                                      @Valid @RequestBody UpdatePatientRequest request, JwtAuthenticationToken authentication) {
        rejectProfileQuery(query);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(patients.updateMyProfile(authentication, request));
    }

    private void rejectProfileQuery(MultiValueMap<String, String> query) {
        if (!query.isEmpty())
            throw new com.smartlims.patients.exception.PatientValidationException(query.keySet().iterator().next());
    }

    @GetMapping("/me")
    public PatientResponse getMe(JwtAuthenticationToken authentication) {
        return patients.getMe(authentication);
    }

    @PostMapping(path = "/me", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<PatientResponse> createMe(@Valid @RequestBody CreatePatientRequest request,
                                                    JwtAuthenticationToken authentication) {
        PatientResponse patient = patients.createMe(authentication, request);
        return ResponseEntity.created(URI.create("/api/patients/" + patient.id())).body(patient);
    }

    @PostMapping("/{id}/link-tokens")
    public ResponseEntity<PatientLinkTokenResponse> issueLinkToken(@PathVariable String id,
                                                                   JwtAuthenticationToken authentication) {
        return ResponseEntity.status(201).header("Cache-Control", "no-store").header("Pragma", "no-cache")
                .body(patients.issueLinkToken(authentication, id));
    }

    @PostMapping(path = "/me/link", consumes = MediaType.APPLICATION_JSON_VALUE)
    public PatientResponse linkMe(@Valid @RequestBody LinkPatientRequest request, JwtAuthenticationToken authentication) {
        return patients.linkMe(authentication, request);
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<PatientResponse> create(@Valid @RequestBody CreatePatientRequest request, JwtAuthenticationToken authentication) {
        PatientResponse patient = patients.create(authentication, request);
        return ResponseEntity.created(URI.create("/api/patients/" + patient.id())).body(patient);
    }

    @GetMapping
    public PatientPageResponse list(@RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken authentication) {
        return patients.list(authentication, PatientQueryRequest.fromQueryParameters(query));
    }

    @GetMapping("/{id}")
    public PatientResponse get(@PathVariable String id, JwtAuthenticationToken authentication) {
        return patients.get(authentication, id);
    }

    @PutMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public PatientResponse update(@PathVariable String id, @Valid @RequestBody UpdatePatientRequest request, JwtAuthenticationToken authentication) {
        return patients.update(authentication, id, request);
    }
}
