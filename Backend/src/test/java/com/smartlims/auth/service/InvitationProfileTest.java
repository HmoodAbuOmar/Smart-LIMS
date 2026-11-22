package com.smartlims.auth.service;

import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class InvitationProfileTest {
    @Test
    void derivesProfileFromTheMailboxAndKeepsGeneratedUserNamesUnique() {
        assertEquals("invitee", InvitationProfile.fullName("invitee@example.invalid"));
        assertEquals("abb", InvitationProfile.fullName("ab@example.invalid"));
        assertEquals("aaa", InvitationProfile.fullName("a@example.invalid"));
        assertEquals("a.b+tag", InvitationProfile.fullName("a.b+tag@example.invalid"));
        assertEquals("a".repeat(80), InvitationProfile.fullName("a".repeat(90) + "@example.invalid"));
        assertEquals("!!!", InvitationProfile.fullName("!!@example.invalid"));

        assertEquals("abtag", InvitationProfile.uniqueUserName("a.b+tag@example.invalid", name -> false));
        assertEquals("aaa", InvitationProfile.uniqueUserName("a@example.invalid", name -> false));
        assertEquals("000", InvitationProfile.uniqueUserName("!!!@example.invalid", name -> false));
        assertEquals("a".repeat(30), InvitationProfile.uniqueUserName("a".repeat(40) + "@example.invalid", name -> false));

        Set<String> taken = new HashSet<>(Set.of("abb", "abb2"));
        assertEquals("abb3", InvitationProfile.uniqueUserName("ab@example.invalid", taken::contains));
        String longBase = "b".repeat(30);
        taken.add(longBase);
        taken.add("b".repeat(29) + "2");
        assertEquals("b".repeat(29) + "3", InvitationProfile.uniqueUserName(longBase + "@example.invalid", taken::contains));
    }

    @Test
    void exhaustedNumericSuffixesReportTheUsernameConflict() {
        AuthRequestException failure = assertThrows(AuthRequestException.class,
                () -> InvitationProfile.uniqueUserName("ab@example.invalid", name -> true));
        assertEquals("USERNAME_IN_USE", failure.getCode());
        assertEquals("userName", failure.getField());
    }
}
