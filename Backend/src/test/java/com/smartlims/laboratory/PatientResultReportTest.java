package com.smartlims.laboratory;

import com.smartlims.auth.entity.Role;
import com.smartlims.results.dto.*;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.labtests.dto.TestParameterRequest;

import java.math.BigDecimal;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PatientResultReportTest extends LaboratoryTestSupport {
    @Test
    void authorizedPublishedDetailsAndPdfContainCompleteSnapshotsAndArabicGlyphs() throws Exception {
        var p = prepared(create(own, first));
        jdbc.update("UPDATE patients SET full_name=? WHERE id=?", "مريض تجريبي / Synthetic patient", own.getId());
        jdbc.update("UPDATE users SET full_name=? WHERE id=?", "مراجع المختبر", reviewerId);
        var b = contents(p.result(), p.sample().id());
        var values = b.values().stream().map(v -> new ResultRequests.Value(v.parameterId(), v.numericValue(), v.numericComparator(), v.textValue() == null ? null : "نص تجريبي معتمد", "مرجع معتمد من المختبر", v.referenceMin(), v.referenceMax(), v.flag(), "Approved <value> & not markup")).toList();
        var r = publish(draftService.edit(actor(Role.LAB_TECHNICIAN), p.result().id().toString(), new ResultRequests.Edit(p.result().version(), b.measuredAt(), b.specimenIds(), "شرح تجريبي معتمد", values)));
        mvc.perform(bearer(get("/api/results/me/" + r.id()), Role.PATIENT)).andExpect(status().isOk()).andExpect(jsonPath("$.patient.name").value("مريض تجريبي / Synthetic patient")).andExpect(jsonPath("$.specimens[0].visitId").value(p.visit().id().toString())).andExpect(jsonPath("$.events").isEmpty());
        var response = mvc.perform(bearer(get("/api/results/me/" + r.id() + "/report"), Role.PATIENT)).andExpect(status().isOk()).andExpect(content().contentType("application/pdf")).andExpect(header().string("Cache-Control", "private, no-store")).andReturn().getResponse();
        byte[] bytes = response.getContentAsByteArray();
        assertTrue(new String(bytes, 0, 5, java.nio.charset.StandardCharsets.US_ASCII).startsWith("%PDF-"));
        assertTrue(response.getHeader("Content-Disposition").contains(r.id().toString()));
        assertFalse(response.getHeader("Content-Disposition").contains("patient"));
        try (var pdf = Loader.loadPDF(bytes)) {
            String text = new PDFTextStripper().getText(pdf);
            for (String expected : List.of(r.testName(), r.patient().number(), r.orderNumber(), p.visit().visitNumber(), p.sample().barcode(), "1.25", "NOT_EVALUATED", "Approved <value> & not markup", "CURRENT PUBLISHED VERSION", "Measured at", "Approved at", "Published at"))
                assertTrue(text.contains(expected), expected);
            assertTrue(text.codePoints().anyMatch(c -> Character.UnicodeScript.of(c) == Character.UnicodeScript.ARABIC));
            for (var page : pdf.getPages())
                for (var font : page.getResources().getFontNames())
                    assertTrue(page.getResources().getFont(font).isEmbedded());
            String qa = System.getProperty("smartlims.report.qa-dir");
            if (qa != null) {
                Path dir = Path.of(qa).toAbsolutePath().normalize();
                assertTrue(dir.startsWith(Path.of("").toAbsolutePath().normalize()));
                Files.createDirectories(dir);
                Files.write(dir.resolve("qa-current.pdf"), bytes);
                var renderer = new PDFRenderer(pdf);
                for (int i = 0; i < pdf.getNumberOfPages(); i++)
                    ImageIO.write(renderer.renderImageWithDPI(i, 120), "png", dir.resolve("qa-current-" + (i + 1) + ".png").toFile());
                System.out.println("Synthetic report QA pages: " + pdf.getNumberOfPages());
            }
        }
    }

    @Test
    void unpublishedAndForeignDetailReportAndHistoryReturnIdenticalNotFoundEvenWithPdfAccept() throws Exception {
        var p = prepared(create(own, first));
        var draft = p.result();
        for (String suffix : List.of("", "/report", "/history"))
            error(mvc.perform(bearer(get("/api/results/me/" + draft.id() + suffix), Role.PATIENT)), 404, "RESULT_NOT_FOUND", null);
        var approved = publicationService.approve(actor(reviewerId, Role.ADMIN), draft.id().toString(), new ResultRequests.Revision(draft.version()));
        error(mvc.perform(bearer(get("/api/results/me/" + draft.id() + "/report").accept("application/pdf"), Role.PATIENT)), 404, "RESULT_NOT_FOUND", null);
        var published = publicationService.publish(actor(reviewerId, Role.ADMIN), approved.id().toString(), new ResultRequests.Revision(approved.version()));
        for (String suffix : List.of("", "/report", "/history"))
            error(mvc.perform(get("/api/results/me/" + published.id() + suffix).header("Authorization", "Bearer " + strangerToken)), 404, "RESULT_NOT_FOUND", null);
        error(mvc.perform(bearer(get("/api/results/me/00000000-0000-0000-0000-000000000000/report").accept("application/pdf"), Role.PATIENT)), 404, "RESULT_NOT_FOUND", null);
    }

    @Test
    void supersededPublishedVersionsRemainOwnedDownloadableAndHistoryNeverShowsWorkingDraft() throws Exception {
        var p = prepared(create(own, first));
        var original = publish(p.result());
        var correction = publicationService.correct(actor(Role.LAB_TECHNICIAN), original.id().toString(), new ResultRequests.Correction("Synthetic correction reason"), List.of(UUID.randomUUID().toString())).result();
        mvc.perform(bearer(get("/api/results/me/" + original.id() + "/history"), Role.PATIENT)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        var next = publish(correction);
        mvc.perform(bearer(get("/api/results/me/" + original.id()), Role.PATIENT)).andExpect(jsonPath("$.superseded").value(true)).andExpect(jsonPath("$.isCurrent").value(false));
        mvc.perform(bearer(get("/api/results/me/" + next.id() + "/history"), Role.PATIENT)).andExpect(jsonPath("$.totalElements").value(2));
        byte[] oldPdf = mvc.perform(bearer(get("/api/results/me/" + original.id() + "/report"), Role.PATIENT)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        try (var doc = Loader.loadPDF(oldPdf)) {
            assertTrue(new PDFTextStripper().getText(doc).contains("SUPERSEDED"));
        }
        byte[] newPdf = mvc.perform(bearer(get("/api/results/me/" + next.id() + "/report"), Role.PATIENT)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        try (var doc = Loader.loadPDF(newPdf)) {
            String text = new PDFTextStripper().getText(doc);
            assertTrue(text.contains("Synthetic correction reason"));
            assertTrue(text.contains(original.id().toString()));
        }
    }

    @Test
    void multiPagePanelReportRetainsLastParameterAndLongSuppliedContent() throws Exception {
        for (int i = 0; i < 12; i++)
            parameterService.save(actor(Role.ADMIN), first.getId().toString(), null, new TestParameterRequest("P%02d".formatted(i), "Synthetic panel parameter " + i, "TEXT", null, null, i, true, true, null));
        var o = create(own, first);
        var v = arrive(o, null);
        var sample = received(v, o.items().getFirst().id());
        var r = draftService.create(actor(Role.LAB_TECHNICIAN), new ResultRequests.Create(o.items().getFirst().id().toString()), List.of(UUID.randomUUID().toString())).result();
        var values = r.values().stream().map(p -> new ResultRequests.Value(p.parameterId().toString(), null, null, "Synthetic text value " + "LongToken".repeat(35), "Supplied reference text. ".repeat(20), null, null, "NOT_EVALUATED", "Last content for " + p.code())).toList();
        r = publish(draftService.edit(actor(Role.LAB_TECHNICIAN), r.id().toString(), new ResultRequests.Edit(r.version(), LaboratoryInput.now().toString(), List.of(sample.id().toString()), null, values)));
        byte[] bytes = mvc.perform(bearer(get("/api/results/me/" + r.id() + "/report"), Role.PATIENT)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        try (var pdf = Loader.loadPDF(bytes)) {
            assertTrue(pdf.getNumberOfPages() > 1);
            String text = new PDFTextStripper().getText(pdf);
            assertTrue(text.contains("Synthetic panel parameter 11"));
            assertTrue(text.contains("Last content for P11"));
            assertTrue(text.contains("Published at"));
        }
    }
}
