package com.smartlims.labtests;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.labtests.dto.LabTestRequest;
import com.smartlims.labtests.dto.LabTestStatusRequest;
import com.smartlims.labtests.entity.LabTest;
import com.smartlims.labtests.entity.LabTestCategory;
import com.smartlims.labtests.repository.LabTestRepository;
import com.smartlims.labtests.service.LabTestService;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import static com.smartlims.labtests.entity.LabTestCategory.*;
import static org.junit.jupiter.api.Assertions.*;

@Transactional
class LabTestCategoryPersistenceTest extends IsolatedPostgresTest {
    @Autowired LabTestRepository tests;
    @Autowired EntityManager entities;
    @Autowired LabTestService service;
    @MockitoBean VerificationEmailSender email;

    private LabTest syntheticTest() {
        return new LabTest("CAT_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20).toUpperCase(Locale.ROOT),
                "Synthetic category test", null, new BigDecimal("1.00"), "SYNTHETIC", null);
    }

    private LabTest reload(UUID id) {
        entities.flush();
        entities.clear();
        return tests.findById(id).orElseThrow();
    }

    @Test
    void savesAndLoadsZeroOneAndMultipleCategoriesSharedByTests() {
        LabTest empty = tests.saveAndFlush(syntheticTest());
        LabTest single = syntheticTest();
        single.getCategories().add(BLOOD_TESTS);
        tests.saveAndFlush(single);
        LabTest multiple = syntheticTest();
        multiple.getCategories().addAll(Set.of(BLOOD_TESTS, THYROID));
        tests.saveAndFlush(multiple);

        assertTrue(reload(empty.getId()).getCategories().isEmpty());
        assertEquals(Set.of(BLOOD_TESTS), reload(single.getId()).getCategories());
        assertEquals(Set.of(BLOOD_TESTS, THYROID), reload(multiple.getId()).getCategories());
    }

    @Test
    void persistsEveryStableIdentifierAndRemovesAssignmentsWithoutRemovingTheTest() {
        LabTest test = syntheticTest();
        test.getCategories().addAll(EnumSet.allOf(LabTestCategory.class));
        tests.saveAndFlush(test);
        LabTest loaded = reload(test.getId());
        assertEquals(EnumSet.allOf(LabTestCategory.class), loaded.getCategories());

        loaded.getCategories().remove(THYROID);
        Set<LabTestCategory> expected = EnumSet.allOf(LabTestCategory.class);
        expected.remove(THYROID);
        loaded = reload(test.getId());
        assertEquals(expected, loaded.getCategories());

        loaded.getCategories().clear();
        loaded = reload(test.getId());
        assertTrue(loaded.getCategories().isEmpty());
        assertEquals(test.getCode(), loaded.getCode());
        assertTrue(loaded.isActive());
    }

    @Test
    void catalogReplacementReplacesAssignmentsAndStatusPreservesThem() {
        LabTest test = syntheticTest();
        test.getCategories().addAll(Set.of(BLOOD_TESTS, THYROID));
        tests.saveAndFlush(test);
        var admin = UsernamePasswordAuthenticationToken.authenticated("synthetic-admin", null,
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        var request = new LabTestRequest(test.getCode(), "Replaced synthetic catalog test", null,
                new BigDecimal("2.00"), "ILS", "SYNTHETIC", null, List.of("KIDNEY", "LIVER"));

        service.update(admin, test.getId().toString(), request);
        LabTest loaded = reload(test.getId());
        assertEquals(Set.of(LIVER, KIDNEY), loaded.getCategories());
        assertEquals("Replaced synthetic catalog test", loaded.getName());

        service.changeStatus(admin, test.getId().toString(), new LabTestStatusRequest(false));
        loaded = reload(test.getId());
        assertEquals(Set.of(LIVER, KIDNEY), loaded.getCategories());
        assertFalse(loaded.isActive());
    }
}
