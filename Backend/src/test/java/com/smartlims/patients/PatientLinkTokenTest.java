package com.smartlims.patients;

import com.smartlims.patients.dto.LinkPatientRequest;
import com.smartlims.patients.dto.PatientLinkTokenResponse;
import com.smartlims.patients.entity.PatientLinkToken;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PatientLinkTokenTest {
    @Test
    void expiryBoundaryIsExclusiveAndConsumptionIsPermanent() {
        Instant expiry = Instant.parse("2026-10-26T12:00:00Z");
        PatientLinkToken token = new PatientLinkToken("a".repeat(64), null, null, expiry);
        assertTrue(token.usableAt(expiry.minusNanos(1)));
        assertFalse(token.usableAt(expiry));
        assertFalse(token.usableAt(expiry.plusNanos(1)));
        token.consume(expiry.minusSeconds(10));
        assertFalse(token.usableAt(expiry.minusSeconds(1)));
    }

    @Test
    void requestAndResponseToStringNeverExposeToken() {
        String syntheticToken = "synthetic-secret-value";
        assertFalse(new LinkPatientRequest(syntheticToken).toString().contains(syntheticToken));
        assertFalse(new PatientLinkTokenResponse(syntheticToken, Instant.EPOCH).toString().contains(syntheticToken));
    }
}
