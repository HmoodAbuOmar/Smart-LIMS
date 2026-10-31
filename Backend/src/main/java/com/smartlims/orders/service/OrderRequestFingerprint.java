package com.smartlims.orders.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

final class OrderRequestFingerprint {
    private OrderRequestFingerprint() {
    }

    static String hash(boolean self, UUID patientId, List<UUID> testIds) {
        String selection = testIds.stream().map(UUID::toString).sorted()
                .map(id -> "\"" + id + "\"").collect(Collectors.joining(","));
        String canonical = "{\"operation\":\"" + (self ? "SELF" : "STAFF")
                + "\",\"patientId\":\"" + patientId + "\",\"testIds\":[" + selection + "]}";
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is unavailable.", error);
        }
    }
}
