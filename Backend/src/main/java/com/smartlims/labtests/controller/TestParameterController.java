package com.smartlims.labtests.controller;

import com.smartlims.labtests.dto.TestParameterRequest;
import com.smartlims.labtests.service.TestParameterService;
import com.smartlims.laboratory.dto.LaboratoryQuery;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping(path="/api/lab-tests/{testId}/parameters",produces=MediaType.APPLICATION_JSON_VALUE)
public class TestParameterController {
 private final TestParameterService parameters;public TestParameterController(TestParameterService parameters){this.parameters=parameters;}
 @GetMapping public ResponseEntity<?> list(@PathVariable String testId,@RequestParam MultiValueMap<String,String> query,JwtAuthenticationToken actor){return ResponseEntity.ok().header("Cache-Control","no-store").body(parameters.list(actor,testId,LaboratoryQuery.of(query,"includeInactive")));}
 @PostMapping(consumes=MediaType.APPLICATION_JSON_VALUE) public ResponseEntity<?> create(@PathVariable String testId,@Valid @RequestBody TestParameterRequest body,JwtAuthenticationToken actor){return ResponseEntity.status(201).header("Cache-Control","no-store").body(parameters.save(actor,testId,null,body));}
 @PutMapping(path="/{id}",consumes=MediaType.APPLICATION_JSON_VALUE) public ResponseEntity<?> update(@PathVariable String testId,@PathVariable String id,@Valid @RequestBody TestParameterRequest body,JwtAuthenticationToken actor){return ResponseEntity.ok().header("Cache-Control","no-store").body(parameters.save(actor,testId,id,body));}
}
