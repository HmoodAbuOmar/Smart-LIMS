package com.smartlims.results.report;

import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.results.dto.ResultResponse;
import com.smartlims.results.entity.ResultStatus;

import java.awt.image.BufferedImage;
import java.io.*;
import java.math.BigDecimal;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import javax.imageio.ImageIO;
import javax.xml.XMLConstants;
import javax.xml.transform.*;
import javax.xml.transform.sax.SAXResult;
import javax.xml.transform.stream.StreamSource;

import org.apache.fop.apps.*;
import org.apache.xmlgraphics.io.Resource;
import org.apache.xmlgraphics.io.ResourceResolver;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Renders only an already-authorized immutable publication; never resolves patient-supplied URIs.
 */
@Component
public class ResultReportRenderer {
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(ResultReportRenderer.class);
    private static final ZoneId ZONE = ZoneId.of("Asia/Jerusalem");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss XXX", Locale.ROOT).withZone(ZONE);
    private final FopFactory factory;
    private final String laboratoryIdentity;
    private final byte[] logo;

    public ResultReportRenderer(ResourceLoader resources,
                                @Value("${smartlims.laboratory.report.identity:}") String identity,
                                @Value("${smartlims.laboratory.report.logo-path:}") String logoPath) {
        laboratoryIdentity = identity.strip();
        try {
            byte[] regular, bold;
            try (var stream = resources.getResource("classpath:reports/fonts/DejaVuSans.ttf").getInputStream()) {
                regular = stream.readAllBytes();
            }
            try (var stream = resources.getResource("classpath:reports/fonts/DejaVuSans-Bold.ttf").getInputStream()) {
                bold = stream.readAllBytes();
            }
            if (!logoPath.isBlank()) {
                if (!logoPath.startsWith("file:") && !logoPath.startsWith("classpath:"))
                    throw new IOException("Logo must be a supplied local or classpath image.");
                byte[] input;
                try (var stream = resources.getResource(logoPath).getInputStream()) {
                    input = stream.readNBytes(2 * 1024 * 1024 + 1);
                }
                if (input.length > 2 * 1024 * 1024)
                    throw new IOException("Logo is too large.");
                BufferedImage image;
                try (var images = ImageIO.createImageInputStream(new ByteArrayInputStream(input))) {
                    var readers = ImageIO.getImageReaders(images);
                    if (!readers.hasNext())
                        throw new IOException("Invalid supplied logo.");
                    var reader = readers.next();
                    try {
                        reader.setInput(images);
                        String format = reader.getFormatName();
                        if (!(format.equalsIgnoreCase("PNG") || format.equalsIgnoreCase("JPEG")) || reader.getWidth(0) > 4096 || reader.getHeight(0) > 4096)
                            throw new IOException("Invalid supplied logo.");
                        image = reader.read(0);
                    } finally {
                        reader.dispose();
                    }
                }
                var png = new ByteArrayOutputStream();
                ImageIO.write(image, "png", png);
                logo = png.toByteArray();
            } else
                logo = null;
            ResourceResolver resolver = new ResourceResolver() {
                @Override
                public Resource getResource(URI uri) throws IOException {
                    return switch (uri.toString()) {
                        case "font:regular" -> new Resource(new ByteArrayInputStream(regular));
                        case "font:bold" -> new Resource(new ByteArrayInputStream(bold));
                        case "supplied:logo" -> {
                            if (logo == null)
                                throw new IOException("No supplied logo.");
                            yield new Resource("image/png", new ByteArrayInputStream(logo));
                        }
                        default -> throw new IOException("External report resources are disabled.");
                    };
                }

                @Override
                public OutputStream getOutputStream(URI uri) throws IOException {
                    throw new IOException("Report resource writes are disabled.");
                }
            };
            String configuration = """
                    <fop version="1.0"><strict-configuration>true</strict-configuration><complex-scripts disabled="false"/>
                    <renderers><renderer mime="application/pdf"><fonts>
                    <font embed-url="font:regular" embedding-mode="subset" kerning="yes" advanced="true"><font-triplet name="ReportSans" style="normal" weight="normal"/></font>
                    <font embed-url="font:bold" embedding-mode="subset" kerning="yes" advanced="true"><font-triplet name="ReportSans" style="normal" weight="bold"/></font>
                    </fonts></renderer></renderers></fop>
                    """;
            var builder = new FopConfParser(new ByteArrayInputStream(configuration.getBytes(StandardCharsets.UTF_8)), URI.create("memory:/"), resolver).getFopFactoryBuilder();
            builder.setComplexScriptFeatures(true);
            builder.getFontManager().disableFontCache();
            factory = builder.build();
        } catch (Exception e) {
            throw new IllegalStateException("Report fonts or supplied identity/logo configuration is invalid.", e);
        }
    }

    public byte[] render(ResultResponse result) {
        if (result.status() != ResultStatus.PUBLISHED || result.publishedAt() == null)
            throw LaboratoryException.missing("RESULT");
        var diagnostic = new java.util.concurrent.atomic.AtomicReference<>("renderer");
        try {
            var bytes = new ByteArrayOutputStream();
            var agent = factory.newFOUserAgent();
            agent.setTitle("Laboratory result report");
            agent.setCreationDate(Date.from(result.publishedAt()));
            // A custom event listener suppresses default messages that can contain patient text.
            agent.getEventBroadcaster().addEventListener(event -> {
                String id = event.getEventID().toLowerCase(Locale.ROOT), severity = event.getSeverity().toString();
                if (severity.equals("ERROR") || severity.equals("FATAL") || id.contains("overflow") || id.contains("glyphnotavailable") || id.contains("fontsubstituted")) {
                    diagnostic.set(event.getEventID());
                    throw new IllegalStateException("Report layout or glyph validation failed.");
                }
            });
            var fop = factory.newFop(MimeConstants.MIME_PDF, agent, bytes);
            var transforms = TransformerFactory.newInstance();
            transforms.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            transforms.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            transforms.setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "");
            transforms.newTransformer().transform(new StreamSource(new StringReader(document(result))), new SAXResult(fop.getDefaultHandler()));
            return bytes.toByteArray();
        } catch (Exception e) {
            LOG.warn("Report generation failed; diagnostic={}, exceptionType={}", diagnostic.get(), e.getClass().getSimpleName());
            throw new LaboratoryException(HttpStatus.SERVICE_UNAVAILABLE, "REPORT_UNAVAILABLE", "The report could not be generated.", null);
        }
    }

    private String document(ResultResponse r) {
        var b = new StringBuilder("""
                <fo:root xmlns:fo="http://www.w3.org/1999/XSL/Format" font-family="ReportSans" font-size="9pt" line-height="1.35">
                <fo:layout-master-set><fo:simple-page-master master-name="report" page-height="297mm" page-width="210mm" margin="15mm">
                <fo:region-body margin-top="13mm" margin-bottom="12mm"/><fo:region-before extent="10mm"/><fo:region-after extent="9mm"/>
                </fo:simple-page-master></fo:layout-master-set><fo:page-sequence master-reference="report" language="en">
                <fo:static-content flow-name="xsl-region-before"><fo:block font-size="8pt" color="#555555" border-bottom="0.5pt solid #bbbbbb" padding-bottom="4pt">Published laboratory result</fo:block></fo:static-content>
                <fo:static-content flow-name="xsl-region-after"><fo:block font-size="8pt" color="#555555" text-align="end" border-top="0.5pt solid #bbbbbb" padding-top="4pt">Page <fo:page-number/></fo:block></fo:static-content>
                <fo:flow flow-name="xsl-region-body">
                """);
        if (!laboratoryIdentity.isBlank())
            block(b, laboratoryIdentity, "font-size=\"14pt\" font-weight=\"bold\" space-after=\"5pt\"");
        if (logo != null)
            b.append("<fo:block space-after=\"6pt\"><fo:external-graphic src=\"url('supplied:logo')\" content-width=\"40mm\" content-height=\"18mm\" scaling=\"uniform\"/></fo:block>");
        block(b, "Laboratory result report", "font-size=\"19pt\" font-weight=\"bold\" space-after=\"6pt\"");
        block(b, r.testName(), "font-size=\"13pt\" font-weight=\"bold\" space-after=\"5pt\"");
        block(b, r.superseded() ? "SUPERSEDED - historical published version" : "CURRENT PUBLISHED VERSION", "font-weight=\"bold\" background-color=\"#eeeeee\" padding=\"5pt\" space-after=\"8pt\"");
        field(b, "Patient name", r.patient().name());
        field(b, "Patient number", r.patient().number());
        field(b, "Date of birth", String.valueOf(r.patient().dateOfBirth()));
        field(b, "Order", r.orderNumber());
        field(b, "Ordered test code", r.testCode());
        field(b, "Result / version", r.id() + " / " + r.versionNumber());
        field(b, "Report date", r.publishedAt().atZone(ZONE).toLocalDate().toString() + " (Asia/Jerusalem)");
        if (r.previousResultId() != null) {
            field(b, "Corrects published result", r.previousResultId().toString());
            field(b, "Correction reason", r.correctionReason());
        }
        section(b, "Measurements");
        field(b, "Measured at", time(r.measuredAt()));
        for (var v : r.values()) {
            block(b, v.name() + " (" + v.code() + ")", "font-weight=\"bold\" space-before=\"8pt\" keep-with-next.within-page=\"always\" border-bottom=\"0.5pt solid #dddddd\" padding-bottom=\"3pt\"");
            String value = v.numericValue() != null ? (v.numericComparator() == null ? "" : v.numericComparator() + " ") + number(v.numericValue()) : v.textValue() != null ? v.textValue() : "Not reported";
            field(b, "Value", value + (v.unit() == null ? "" : " " + v.unit()));
            if (v.method() != null)
                field(b, "Method", v.method());
            if (v.referenceText() != null)
                field(b, "Supplied reference", v.referenceText());
            if (v.referenceMin() != null || v.referenceMax() != null)
                field(b, "Supplied reference bounds", (v.referenceMin() == null ? "Not supplied" : number(v.referenceMin())) + " to " + (v.referenceMax() == null ? "Not supplied" : number(v.referenceMax())));
            field(b, "Supplied interpretation flag", v.flag().name());
            if (v.notes() != null)
                field(b, "Approved notes", v.notes());
        }
        if (r.explanation() != null) {
            section(b, "Approved explanation");
            block(b, r.explanation(), "space-after=\"5pt\"");
        }
        section(b, "Specimens and actual visits");
        for (var s : r.specimens()) {
            block(b, s.barcode(), "font-weight=\"bold\" space-before=\"7pt\" keep-with-next.within-page=\"always\"");
            field(b, "Specimen ID", s.id().toString());
            field(b, "Specimen type", s.sampleType());
            if (s.containerType() != null)
                field(b, "Container", s.containerType());
            field(b, "Collected at", time(s.collectedAt()));
            field(b, "Received at", time(s.receivedAt()));
            if (s.receivedBy() != null)
                field(b, "Receipt recorded by", s.receivedBy().name());
            field(b, "Actual visit", s.visitNumber() + " / " + s.visitId());
            field(b, "Visit arrival", time(s.arrivedAt()));
            if (s.appointmentId() != null)
                field(b, "Linked appointment", s.appointmentId().toString());
            if (s.attestedBy() != null) {
                field(b, "Suitability attested by", s.attestedBy().name());
                field(b, "Attested at", time(s.attestedAt()));
            }
            if (s.replacesSampleId() != null)
                field(b, "Replacement for", s.replacesBarcode() + " / " + s.replacesSampleId());
        }
        section(b, "Approval and publication");
        field(b, "Approved by", r.approvedBy().name());
        field(b, "Approved at", time(r.approvedAt()));
        field(b, "Published by", r.publishedBy().name());
        field(b, "Published at", time(r.publishedAt()));
        b.append("</fo:flow></fo:page-sequence></fo:root>");
        return b.toString();
    }

    private static void section(StringBuilder b, String title) {
        block(b, title, "font-size=\"11pt\" font-weight=\"bold\" space-before=\"12pt\" space-after=\"5pt\" keep-with-next.within-page=\"always\"");
    }

    private static void field(StringBuilder b, String label, String value) {
        b.append("<fo:block space-after=\"4pt\"><fo:block font-size=\"8pt\" color=\"#555555\" keep-with-next.within-page=\"always\">").append(xml(label)).append("</fo:block>");
        block(b, value == null ? "Not recorded" : value, "");
        b.append("</fo:block>");
    }

    private static void block(StringBuilder b, String text, String style) {
        boolean rtl = firstStrongRtl(text), arabic = hasArabic(text);
        if (rtl)
            b.append("<fo:block-container writing-mode=\"rl-tb\">");
        // The pinned font's default Arabic GSUB table shares its offset with KUR.
        // FOP exposes that alias rather than dflt. Select the exact default table,
        // not Urdu/Sindhi variants. This is an OpenType selector, not content language.
        b.append("<fo:block ").append(style).append(" wrap-option=\"wrap\" white-space-collapse=\"false\" linefeed-treatment=\"preserve\" language=\"").append(arabic ? "KUR" : "en").append("\" script=\"").append(arabic ? "arab" : "latn").append("\" text-align=\"").append(rtl ? "right" : "left").append("\">").append(xml(wrapLongTokens(text))).append("</fo:block>");
        if (rtl)
            b.append("</fo:block-container>");
    }

    private static boolean firstStrongRtl(String text) {
        for (int c : text.codePoints().toArray()) {
            byte d = Character.getDirectionality(c);
            if (d == Character.DIRECTIONALITY_RIGHT_TO_LEFT || d == Character.DIRECTIONALITY_RIGHT_TO_LEFT_ARABIC)
                return true;
            if (d == Character.DIRECTIONALITY_LEFT_TO_RIGHT)
                return false;
        }
        return false;
    }

    private static boolean hasArabic(String text) {
        return text.codePoints().anyMatch(c -> Character.UnicodeScript.of(c) == Character.UnicodeScript.ARABIC);
    }

    private static String wrapLongTokens(String text) {
        var b = new StringBuilder();
        int length = 0;
        for (int c : text.codePoints().toArray()) {
            if (Character.isWhitespace(c) || c == '-')
                length = 0;
            else if (++length > 48) {
                b.append('\u200b');
                length = 1;
            }
            b.appendCodePoint(c);
        }
        return b.toString();
    }

    private static String xml(String text) {
        var b = new StringBuilder();
        text.codePoints().forEach(c -> {
            switch (c) {
                case '&' -> b.append("&amp;");
                case '<' -> b.append("&lt;");
                case '>' -> b.append("&gt;");
                case '"' -> b.append("&quot;");
                default -> {
                    if (c < 32 && c != '\n' && c != '\r' && c != '\t')
                        b.append(String.format(Locale.ROOT, "\\u%04x", c));
                    else
                        b.appendCodePoint(c);
                }
            }
        });
        return b.toString();
    }

    private static String number(BigDecimal n) {
        return n.stripTrailingZeros().toPlainString();
    }

    private static String time(Instant time) {
        return time == null ? "Not recorded" : TIME.format(time) + " (Asia/Jerusalem)";
    }
}
