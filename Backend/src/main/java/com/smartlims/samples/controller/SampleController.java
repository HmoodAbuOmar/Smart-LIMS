package com.smartlims.samples.controller;

import com.smartlims.laboratory.dto.LaboratoryQuery;
import com.smartlims.samples.dto.SampleRequests;
import com.smartlims.samples.service.SampleService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping(path="/api/samples",produces=MediaType.APPLICATION_JSON_VALUE)
public class SampleController {
 private final SampleService samples;public SampleController(SampleService samples){this.samples=samples;}
 @PostMapping(consumes=MediaType.APPLICATION_JSON_VALUE) public ResponseEntity<?> create(@Valid @RequestBody SampleRequests.Create body,@RequestHeader HttpHeaders headers,JwtAuthenticationToken actor){var r=samples.create(actor,body,headers.get("Idempotency-Key"));return ResponseEntity.status(r.created()?201:200).header("Cache-Control","no-store").body(r.sample());}
 @GetMapping public ResponseEntity<?> list(@RequestParam MultiValueMap<String,String> query,JwtAuthenticationToken actor){return ok(samples.list(actor,LaboratoryQuery.of(query,"orderId")));}
 @GetMapping("/{id}") public ResponseEntity<?> get(@PathVariable String id,JwtAuthenticationToken actor){return ok(samples.get(actor,id));}
 @PostMapping(path="/{id}/receive",consumes=MediaType.APPLICATION_JSON_VALUE) public ResponseEntity<?> receive(@PathVariable String id,@Valid @RequestBody SampleRequests.Revision body,JwtAuthenticationToken actor){return ok(samples.receive(actor,id,body));}
 @PostMapping(path="/{id}/attestations",consumes=MediaType.APPLICATION_JSON_VALUE) public ResponseEntity<?> attest(@PathVariable String id,@Valid @RequestBody SampleRequests.Attest body,JwtAuthenticationToken actor){return ok(samples.attest(actor,id,body));}
 @PostMapping(path="/{id}/reject",consumes=MediaType.APPLICATION_JSON_VALUE) public ResponseEntity<?> reject(@PathVariable String id,@Valid @RequestBody SampleRequests.Reject body,JwtAuthenticationToken actor){return ok(samples.reject(actor,id,body));}
 private ResponseEntity<?> ok(Object body){return ResponseEntity.ok().header("Cache-Control","no-store").body(body);}
}
