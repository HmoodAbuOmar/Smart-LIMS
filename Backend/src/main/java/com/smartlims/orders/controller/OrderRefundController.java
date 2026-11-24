package com.smartlims.orders.controller;

import com.smartlims.laboratory.dto.LaboratoryQuery;
import com.smartlims.payments.ReceptionistPaymentReadService;
import com.smartlims.payments.ReceptionistPaymentResponses;
import com.smartlims.payments.RecordRefundRequest;
import com.smartlims.payments.RefundRecordingService;
import jakarta.validation.Valid;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(path = "/api/orders/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
public class OrderRefundController {
    private final RefundRecordingService refunds;
    private final ReceptionistPaymentReadService reads;

    public OrderRefundController(RefundRecordingService refunds, ReceptionistPaymentReadService reads) {
        this.refunds = refunds;
        this.reads = reads;
    }

    @GetMapping("/payment-transactions")
    public ResponseEntity<ReceptionistPaymentResponses.Page> transactions(
            @PathVariable String id, @RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(reads.forRefundReview(actor, id, LaboratoryQuery.of(query)));
    }

    @PostMapping(path = "/refunds", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ReceptionistPaymentResponses.RecordedRefund> record(
            @PathVariable String id, @Valid @RequestBody RecordRefundRequest body, @RequestHeader HttpHeaders headers,
            JwtAuthenticationToken actor) {
        var result = refunds.record(actor, id, body, headers.get("Idempotency-Key"));
        return ResponseEntity.status(result.created() ? 201 : 200).header("Cache-Control", "no-store").body(result.data());
    }
}
