package com.smartlims.labtests.controller;

import com.smartlims.labtests.dto.ReferenceRangeRequest;
import com.smartlims.labtests.service.ReferenceRangeService;
import com.smartlims.laboratory.dto.LaboratoryQuery;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(path = "/api/lab-tests/{testId}/parameters/{parameterId}/reference-ranges", produces = MediaType.APPLICATION_JSON_VALUE)
public class ReferenceRangeController {
    private final ReferenceRangeService ranges;

    public ReferenceRangeController(ReferenceRangeService ranges) {
        this.ranges = ranges;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> create(@PathVariable String testId, @PathVariable String parameterId,
                                    @Valid @RequestBody ReferenceRangeRequest body, JwtAuthenticationToken actor) {
        return ResponseEntity.status(201).header("Cache-Control", "no-store").body(ranges.create(actor, testId, parameterId, body));
    }

    @GetMapping
    public ResponseEntity<?> list(@PathVariable String testId, @PathVariable String parameterId,
                                  @RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(
                ranges.list(actor, testId, parameterId, LaboratoryQuery.of(query, "includeExpired")));
    }
}
