package com.smartlims.orders.controller;

import com.smartlims.laboratory.dto.LaboratoryQuery;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.payments.ReceptionistPaymentReadService;
import com.smartlims.payments.ReceptionistPaymentRecordingService;
import com.smartlims.payments.ReceptionistPaymentResponses;
import com.smartlims.payments.RecordPaymentRequest;
import jakarta.validation.Valid;

import java.net.URI;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(path = "/api/receptionist/payments", produces = MediaType.APPLICATION_JSON_VALUE)
public class ReceptionistPaymentController {
    private final ReceptionistPaymentReadService reads;
    private final ReceptionistPaymentRecordingService recordings;

    public ReceptionistPaymentController(ReceptionistPaymentReadService reads,
                                         ReceptionistPaymentRecordingService recordings) {
        this.reads = reads;
        this.recordings = recordings;
    }

    @GetMapping("/eligible-orders")
    public ResponseEntity<LaboratoryQuery.PageBody<ReceptionistPaymentResponses.EligibleOrder>> eligibleOrders(
            @RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(reads.eligibleOrders(actor, LaboratoryQuery.of(query)));
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ReceptionistPaymentResponses.Recorded> record(
            @Valid @RequestBody RecordPaymentRequest body, @RequestHeader HttpHeaders headers,
            JwtAuthenticationToken actor) {
        var result = recordings.record(actor, body, headers.get("Idempotency-Key"));
        var response = result.created()
                ? ResponseEntity.created(URI.create("/api/receptionist/payments/" + result.data().transaction().id()))
                : ResponseEntity.ok();
        return response.header("Cache-Control", "no-store").body(result.data());
    }

    @GetMapping
    public ResponseEntity<ReceptionistPaymentResponses.Page> list(
            @RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(reads.list(actor,
                LaboratoryQuery.of(query, "search", "fromDate", "toDate", "type", "status", "orderId")));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ReceptionistPaymentResponses.Transaction> receipt(
            @PathVariable String id, @RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        if (!query.isEmpty())
            throw LaboratoryException.invalid(query.keySet().iterator().next());
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(reads.receipt(actor, id));
    }
}
