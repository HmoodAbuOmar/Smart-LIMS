package com.smartlims.labtests.controller;

import com.smartlims.labtests.dto.*;
import com.smartlims.labtests.service.LabTestService;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(path = "/api/lab-tests", produces = MediaType.APPLICATION_JSON_VALUE)
public class LabTestController {
    private final LabTestService tests;

    public LabTestController(LabTestService tests) { this.tests = tests; }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<LabTestResponse> create(@Valid @RequestBody LabTestRequest request, JwtAuthenticationToken actor) {
        LabTestResponse test = tests.create(actor, request);
        return ResponseEntity.created(URI.create("/api/lab-tests/" + test.id())).body(test);
    }

    @GetMapping
    public LabTestPageResponse list(@RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return tests.list(actor, LabTestQueryRequest.fromQueryParameters(query));
    }

    @GetMapping("/{id}")
    public LabTestResponse get(@PathVariable String id, JwtAuthenticationToken actor) { return tests.get(actor, id); }

    @PutMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public LabTestResponse update(@PathVariable String id, @Valid @RequestBody LabTestRequest request, JwtAuthenticationToken actor) {
        return tests.update(actor, id, request);
    }

    @PatchMapping(path = "/{id}/status", consumes = MediaType.APPLICATION_JSON_VALUE)
    public LabTestResponse status(@PathVariable String id, @Valid @RequestBody LabTestStatusRequest request, JwtAuthenticationToken actor) {
        return tests.changeStatus(actor, id, request);
    }
}
