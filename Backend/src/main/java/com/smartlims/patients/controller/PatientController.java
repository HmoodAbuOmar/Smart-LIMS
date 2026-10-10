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
