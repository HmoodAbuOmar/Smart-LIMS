package com.smartlims.appointments.controller;

import com.smartlims.appointments.dto.*;
import com.smartlims.appointments.service.AppointmentBookingService;
import com.smartlims.appointments.service.AppointmentReadService;
import com.smartlims.appointments.service.AppointmentActionService;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping(produces=MediaType.APPLICATION_JSON_VALUE)
public class AppointmentController {
    private final AppointmentBookingService bookings;
    private final AppointmentReadService reads;
    private final AppointmentActionService actions;
    public AppointmentController(AppointmentBookingService bookings,AppointmentReadService reads,AppointmentActionService actions) { this.bookings=bookings; this.reads=reads; this.actions=actions; }
    @GetMapping("/api/appointments/{id}/alternatives")
    public ResponseEntity<?> alternatives(@PathVariable String id,@RequestParam MultiValueMap<String,String> query,JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(actions.alternatives(actor,id,AppointmentQuery.of(query,"from","to")));
    }
    @PostMapping(path="/api/appointments/{id}/cancel",consumes=MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> cancel(@PathVariable String id,@Valid @RequestBody AppointmentRequests.Cancel body,JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(actions.cancel(actor,id,body));
    }
    @PostMapping(path="/api/appointments/{id}/reschedule",consumes=MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> move(@PathVariable String id,@Valid @RequestBody AppointmentRequests.Move body,JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(actions.move(actor,id,body));
    }
    @GetMapping("/api/appointments/me")
    public ResponseEntity<?> listMe(@RequestParam MultiValueMap<String,String> query,JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(reads.listMe(actor,AppointmentQuery.of(query,"tab")));
    }
    @GetMapping("/api/appointments/me/{id}")
    public ResponseEntity<?> getMe(@PathVariable String id,JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(reads.getMe(actor,id));
    }
    @PostMapping(path="/api/appointments",consumes=MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> book(@Valid @RequestBody AppointmentRequests.Book body,@RequestHeader HttpHeaders headers,JwtAuthenticationToken actor) {
        var result=bookings.book(actor,body,headers.get("Idempotency-Key"));
        var response=ResponseEntity.status(result.created()?201:200).header("Cache-Control","no-store");
        if(actor.getAuthorities().stream().anyMatch(a->a.getAuthority().equals("ROLE_PATIENT")))response.header("Location","/api/appointments/me/"+result.appointment().id());
        return response.body(result.appointment());
    }
    @GetMapping("/api/appointment-slots")
    public ResponseEntity<?> slots(@RequestParam MultiValueMap<String,String> query,JwtAuthenticationToken actor) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(bookings.slots(actor,AppointmentQuery.of(query,"orderId","typeId","from","to")));
    }
}
