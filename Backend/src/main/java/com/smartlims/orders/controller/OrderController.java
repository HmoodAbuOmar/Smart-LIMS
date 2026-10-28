package com.smartlims.orders.controller;

import com.smartlims.orders.dto.CreateSelfOrderRequest;
import com.smartlims.orders.dto.CreateStaffOrderRequest;
import com.smartlims.orders.dto.OrderDetailResponse;
import com.smartlims.orders.dto.OrderPageResponse;
import com.smartlims.orders.dto.OrderQueryRequest;
import com.smartlims.orders.dto.CancelOrderRequest;
import com.smartlims.orders.service.OrderReadService;
import com.smartlims.orders.service.OrderCancellationService;
import com.smartlims.orders.service.OrderCreationResult;
import com.smartlims.orders.service.OrderService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(path = "/api/orders", produces = MediaType.APPLICATION_JSON_VALUE)
public class OrderController {
    private final OrderService orders;
    private final OrderReadService reads;
    private final OrderCancellationService cancellations;

    public OrderController(OrderService orders, OrderReadService reads, OrderCancellationService cancellations) {
        this.orders = orders;
        this.reads = reads;
        this.cancellations = cancellations;
    }

    @PostMapping(path = "/{id}/cancel", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<OrderDetailResponse> cancel(@PathVariable String id, @Valid @RequestBody CancelOrderRequest request,
            JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(cancellations.cancel(actor, id, request));
    }

    @GetMapping("/me")
    public ResponseEntity<OrderPageResponse> listMe(@RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(reads.listMe(actor, OrderQueryRequest.fromQueryParameters(query)));
    }

    @GetMapping("/me/{id}")
    public ResponseEntity<OrderDetailResponse> getMe(@PathVariable String id, JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(reads.getMe(actor, id));
    }

    @PostMapping(path = "/me", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<OrderDetailResponse> createMe(@Valid @RequestBody CreateSelfOrderRequest request,
            @RequestHeader HttpHeaders headers, JwtAuthenticationToken actor) {
        return response(orders.createMe(actor, request, headers.get("Idempotency-Key")), true);
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<OrderDetailResponse> create(@Valid @RequestBody CreateStaffOrderRequest request,
            @RequestHeader HttpHeaders headers, JwtAuthenticationToken actor) {
        return response(orders.create(actor, request, headers.get("Idempotency-Key")), false);
    }

    private ResponseEntity<OrderDetailResponse> response(OrderCreationResult result, boolean self) {
        var response = ResponseEntity.status(result.created() ? 201 : 200).header("Cache-Control", "no-store");
        if (self) response.header("Location", "/api/orders/me/" + result.order().id());
        return response.body(result.order());
    }
}
