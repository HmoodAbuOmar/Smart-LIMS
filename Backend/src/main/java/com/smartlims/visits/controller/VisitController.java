package com.smartlims.visits.controller;

import com.smartlims.laboratory.dto.LaboratoryQuery;
import com.smartlims.visits.dto.VisitRequests;
import com.smartlims.visits.service.VisitService;
import com.smartlims.visits.service.VisitArchiveService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping(produces=MediaType.APPLICATION_JSON_VALUE)
public class VisitController {
 private final VisitService visits;private final VisitArchiveService archive;
 public VisitController(VisitService visits,VisitArchiveService archive){this.visits=visits;this.archive=archive;}
 @GetMapping("/api/visits/me/archive") public ResponseEntity<?> archive(@RequestParam MultiValueMap<String,String> query,JwtAuthenticationToken actor){return ok(archive.list(actor,LaboratoryQuery.of(query,"search","fromDate","toDate","testId","resultStatus")));}
 @GetMapping("/api/visits/me/archive/tests") public ResponseEntity<?> archiveTests(@RequestParam MultiValueMap<String,String> query,JwtAuthenticationToken actor){return ok(archive.tests(actor,LaboratoryQuery.of(query,"search")));}
 @GetMapping("/api/visits/me/archive/{id}") public ResponseEntity<?> archiveDetail(@PathVariable String id,@RequestParam MultiValueMap<String,String> query,JwtAuthenticationToken actor){if(!query.isEmpty())throw com.smartlims.laboratory.exception.LaboratoryException.invalid(query.keySet().iterator().next());return ok(archive.get(actor,id));}
 @PostMapping(path="/api/visits",consumes=MediaType.APPLICATION_JSON_VALUE) public ResponseEntity<?> arrive(@Valid @RequestBody VisitRequests.Arrival body,@RequestHeader HttpHeaders headers,JwtAuthenticationToken actor){var result=visits.arrive(actor,body,headers.get("Idempotency-Key"));return ResponseEntity.status(result.created()?201:200).header("Cache-Control","no-store").body(result.visit());}
 @PostMapping(path="/api/visits/{id}/complete",consumes=MediaType.APPLICATION_JSON_VALUE) public ResponseEntity<?> complete(@PathVariable String id,@Valid @RequestBody VisitRequests.Completion body,JwtAuthenticationToken actor){return ok(visits.complete(actor,id,body));}
 @PostMapping(path="/api/appointments/{id}/no-show",consumes=MediaType.APPLICATION_JSON_VALUE) public ResponseEntity<?> noShow(@PathVariable String id,@Valid @RequestBody VisitRequests.Revision body,JwtAuthenticationToken actor){return ok(visits.noShow(actor,id,body));}
 @GetMapping("/api/visits") public ResponseEntity<?> list(@RequestParam MultiValueMap<String,String> query,JwtAuthenticationToken actor){return ok(visits.list(actor,LaboratoryQuery.of(query,"orderId"),false));}
 @GetMapping("/api/visits/me") public ResponseEntity<?> listMe(@RequestParam MultiValueMap<String,String> query,JwtAuthenticationToken actor){return ok(visits.list(actor,LaboratoryQuery.of(query,"orderId"),true));}
 @GetMapping("/api/visits/{id}") public ResponseEntity<?> get(@PathVariable String id,JwtAuthenticationToken actor){return ok(visits.get(actor,id,false));}
 @GetMapping("/api/visits/me/{id}") public ResponseEntity<?> getMe(@PathVariable String id,JwtAuthenticationToken actor){return ok(visits.get(actor,id,true));}
 private ResponseEntity<?> ok(Object body){return ResponseEntity.ok().header("Cache-Control","no-store").body(body);}
}
