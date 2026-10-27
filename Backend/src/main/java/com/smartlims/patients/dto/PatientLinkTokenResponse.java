package com.smartlims.patients.dto;

import java.time.Instant;

public record PatientLinkTokenResponse(String token, Instant expiresAt) {
    @Override
    public String toString() { return "PatientLinkTokenResponse[token=REDACTED, expiresAt=" + expiresAt + "]"; }
}
