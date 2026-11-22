package com.smartlims.auth.service;

import java.util.function.Predicate;

final class InvitationProfile {
    /** Stored when an invitation does not collect a phone number. Matches the account phone pattern. */
    static final String UNCOLLECTED_PHONE = "0000000000";

    private InvitationProfile() {
    }

    static String fullName(String canonicalEmail) {
        String local = localPart(canonicalEmail);
        if (local.length() > 80)
            local = local.substring(0, 80);
        return pad(local, 3, local.isEmpty() ? 'x' : local.charAt(local.length() - 1));
    }

    static String uniqueUserName(String canonicalEmail, Predicate<String> taken) {
        String base = userNameBase(canonicalEmail);
        if (!taken.test(base))
            return base;
        for (int suffix = 2; suffix <= 10000; suffix++) {
            String tail = Integer.toString(suffix);
            String stem = base.length() + tail.length() <= 30 ? base : base.substring(0, 30 - tail.length());
            String candidate = stem + tail;
            if (!taken.test(candidate))
                return candidate;
        }
        throw UserNames.conflict();
    }

    private static String userNameBase(String canonicalEmail) {
        String local = localPart(canonicalEmail);
        StringBuilder kept = new StringBuilder();
        for (int index = 0; index < local.length() && kept.length() < 30; index++) {
            char character = local.charAt(index);
            if (character >= 'A' && character <= 'Z')
                kept.append((char) (character - 'A' + 'a'));
            else if ((character >= 'a' && character <= 'z') || (character >= '0' && character <= '9'))
                kept.append(character);
        }
        char fill = kept.isEmpty() ? '0' : kept.charAt(kept.length() - 1);
        return pad(kept.toString(), 3, fill);
    }

    private static String localPart(String canonicalEmail) {
        int at = canonicalEmail.indexOf('@');
        return at < 0 ? canonicalEmail : canonicalEmail.substring(0, at);
    }

    private static String pad(String value, int minimum, char fill) {
        if (value.length() >= minimum)
            return value;
        return value + String.valueOf(fill).repeat(minimum - value.length());
    }
}
