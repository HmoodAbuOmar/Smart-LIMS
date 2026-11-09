package com.smartlims.results.controller;

import com.smartlims.laboratory.dto.LaboratoryQuery;
import com.smartlims.results.dto.ResultRequests;
import com.smartlims.results.service.ResultDraftService;
import com.smartlims.results.service.ResultPublicationService;
import com.smartlims.results.service.ResultListService;
import com.smartlims.results.service.PatientResultReadService;
import com.smartlims.results.service.HealthTrendService;
import com.smartlims.results.report.ResultReportRenderer;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(path = "/api/results", produces = MediaType.APPLICATION_JSON_VALUE)
public class ResultController {
    private final ResultDraftService drafts;
    private final ResultPublicationService publications;
    private final ResultListService lists;
    private final PatientResultReadService reads;
    private final ResultReportRenderer reports;
    private final HealthTrendService trends;

    public ResultController(ResultDraftService drafts, ResultPublicationService publications, ResultListService lists, PatientResultReadService reads, ResultReportRenderer reports, HealthTrendService trends) {
        this.drafts = drafts;
        this.publications = publications;
        this.lists = lists;
        this.reads = reads;
        this.reports = reports;
        this.trends = trends;
    }

    @GetMapping("/me/trends/biomarkers")
    public ResponseEntity<?> biomarkers(@RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return ok(trends.biomarkers(actor, LaboratoryQuery.of(query, "search")));
    }

    @GetMapping("/me/trends")
    public ResponseEntity<?> trend(@RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return ok(trends.trend(actor, LaboratoryQuery.of(query, "seriesId", "period", "fromDate", "toDate")));
    }

    @GetMapping(path = "/me/{id}/report", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> report(@PathVariable String id, JwtAuthenticationToken actor) {
        var r = reads.get(actor, id);
        byte[] pdf = reports.render(r);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).header("Cache-Control", "private, no-store").header("Content-Disposition", ContentDisposition.attachment().filename("result-" + r.id() + "-v" + r.versionNumber() + ".pdf").build().toString()).contentLength(pdf.length).body(pdf);
    }

    @GetMapping("/me/{id}")
    public ResponseEntity<?> getMe(@PathVariable String id, JwtAuthenticationToken actor) {
        return ok(reads.get(actor, id));
    }

    @GetMapping("/me/{id}/history")
    public ResponseEntity<?> history(@PathVariable String id, @RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return ok(reads.history(actor, id, LaboratoryQuery.of(query)));
    }

    @GetMapping("/me")
    public ResponseEntity<?> listMe(@RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return ok(lists.listMe(actor, LaboratoryQuery.of(query, "tab", "search", "category")));
    }

    @GetMapping("/work-items")
    public ResponseEntity<?> work(@RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return ok(lists.work(actor, LaboratoryQuery.of(query, "orderId")));
    }

    @PostMapping(path = "/{id}/approve", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> approve(@PathVariable String id, @Valid @RequestBody ResultRequests.Revision body, JwtAuthenticationToken actor) {
        return ok(publications.approve(actor, id, body));
    }

    @PostMapping(path = "/{id}/publish", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> publish(@PathVariable String id, @Valid @RequestBody ResultRequests.Revision body, JwtAuthenticationToken actor) {
        return ok(publications.publish(actor, id, body));
    }

    @PostMapping(path = "/{id}/corrections", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> correct(@PathVariable String id, @Valid @RequestBody ResultRequests.Correction body, @RequestHeader HttpHeaders headers, JwtAuthenticationToken actor) {
        var r = publications.correct(actor, id, body, headers.get("Idempotency-Key"));
        return ResponseEntity.status(r.created() ? 201 : 200).header("Cache-Control", "no-store").body(r.result());
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> create(@Valid @RequestBody ResultRequests.Create body, @RequestHeader HttpHeaders headers, JwtAuthenticationToken actor) {
        var r = drafts.create(actor, body, headers.get("Idempotency-Key"));
        return ResponseEntity.status(r.created() ? 201 : 200).header("Cache-Control", "no-store").body(r.result());
    }

    @PutMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> edit(@PathVariable String id, @Valid @RequestBody ResultRequests.Edit body, JwtAuthenticationToken actor) {
        return ok(drafts.edit(actor, id, body));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable String id, JwtAuthenticationToken actor) {
        return ok(drafts.get(actor, id));
    }

    @GetMapping("/versions")
    public ResponseEntity<?> versions(@RequestParam MultiValueMap<String, String> query, JwtAuthenticationToken actor) {
        return ok(drafts.versions(actor, LaboratoryQuery.of(query, "orderItemId")));
    }

    private ResponseEntity<?> ok(Object body) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(body);
    }
}
