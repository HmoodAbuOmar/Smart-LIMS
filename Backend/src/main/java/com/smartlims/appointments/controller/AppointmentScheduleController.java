package com.smartlims.appointments.controller;

import com.smartlims.appointments.dto.*;
import com.smartlims.appointments.service.AppointmentScheduleService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(produces = MediaType.APPLICATION_JSON_VALUE)
public class AppointmentScheduleController {
    private final AppointmentScheduleService schedule;

    public AppointmentScheduleController(AppointmentScheduleService schedule) {
        this.schedule = schedule;
    }

    @PostMapping(path = "/api/appointment-slots", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> createSlot(@Valid @RequestBody AppointmentRequests.SlotCreate body, JwtAuthenticationToken actor) {
        return response(schedule.createSlot(actor, body), 201);
    }

    @PutMapping(path = "/api/appointment-slots/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> updateSlot(@PathVariable String id, @Valid @RequestBody AppointmentRequests.SlotUpdate body, JwtAuthenticationToken actor) {
        return response(schedule.updateSlot(actor, id, body), 200);
    }

    @GetMapping("/api/appointment-slots/schedule")
    public ResponseEntity<?> slots(@RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return response(schedule.schedule(actor, AppointmentQuery.of(query, "from", "to", "active")), 200);
    }

    private ResponseEntity<?> response(Object body, int status) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(body);
    }
}
