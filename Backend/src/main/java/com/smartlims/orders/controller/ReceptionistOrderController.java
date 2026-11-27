package com.smartlims.orders.controller;

import com.smartlims.laboratory.dto.LaboratoryQuery;
import com.smartlims.orders.dto.ReceptionistOrderResponse;
import com.smartlims.orders.exception.OrderException;
import com.smartlims.orders.service.ReceptionistOrderReadService;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(path = "/api/receptionist/orders", produces = MediaType.APPLICATION_JSON_VALUE)
public class ReceptionistOrderController {
    private final ReceptionistOrderReadService reads;

    public ReceptionistOrderController(ReceptionistOrderReadService reads) {
        this.reads = reads;
    }

    @GetMapping
    public ResponseEntity<LaboratoryQuery.PageBody<ReceptionistOrderResponse.Row>> list(
            @RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(reads.list(actor, LaboratoryQuery.of(query, "search", "sort", "bookable")));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ReceptionistOrderResponse.Detail> get(
            @PathVariable String id, @RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        if (!query.isEmpty())
            throw OrderException.invalid(query.keySet().iterator().next());
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(reads.get(actor, id));
    }
}
