package com.smartlims.labtests;

import com.smartlims.labtests.dto.*;
import com.smartlims.labtests.entity.LabTest;
import com.smartlims.labtests.exception.LabTestException;
import com.smartlims.labtests.mapper.LabTestMapper;
import com.smartlims.labtests.repository.LabTestRepository;
import com.smartlims.labtests.service.LabTestService;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class LabTestServiceTest {
    private final LabTestRepository repository = mock(LabTestRepository.class);
    private final LabTestService service = new LabTestService(repository, new LabTestMapper());
    private final LabTestRequest request = new LabTestRequest("cbc", "CBC", null, BigDecimal.TEN, null, "Blood", null, List.of());

    private Authentication actor(String role) {
        return new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }

    @Test
    void restrictsEveryWriteAtServiceBoundary() {
        for (String role : List.of("PATIENT", "RECEPTIONIST", "LAB_TECHNICIAN")) {
            assertEquals(HttpStatus.FORBIDDEN, assertThrows(LabTestException.class,
                    () -> service.create(actor(role), request)).getStatus());
            assertThrows(LabTestException.class, () -> service.update(actor(role), UUID.randomUUID().toString(), request));
            assertThrows(LabTestException.class, () -> service.changeStatus(actor(role), UUID.randomUUID().toString(), new LabTestStatusRequest(false)));
        }
        assertEquals(HttpStatus.UNAUTHORIZED, assertThrows(LabTestException.class,
                () -> service.get(null, UUID.randomUUID().toString())).getStatus());
        verifyNoInteractions(repository);
    }

    @Test
    void mapsConcurrentUniqueConstraintFailureToConflictButPreservesUnknownFailures() {
        var constraint = new ConstraintViolationException("duplicate", null, "lab_tests_code_key");
        when(repository.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("failure", constraint));
        assertEquals(HttpStatus.CONFLICT, assertThrows(LabTestException.class,
                () -> service.create(actor("ADMIN"), request)).getStatus());
        var unexpected = new DataIntegrityViolationException("unknown constraint");
        doThrow(unexpected).when(repository).saveAndFlush(any());
        assertSame(unexpected, assertThrows(DataIntegrityViolationException.class,
                () -> service.create(actor("ADMIN"), request)));
    }

    @Test
    void duplicatePrechecksRejectCreateAndUpdateBeforeSaving() {
        UUID id = UUID.randomUUID();
        when(repository.existsByCode("CBC")).thenReturn(true);
        when(repository.findForUpdate(id)).thenReturn(Optional.of(
                new LabTest("OTHER", "Other", null, BigDecimal.ONE, "Blood", null)));
        when(repository.existsByCodeAndIdNot("CBC", id)).thenReturn(true);
        for (var failure : List.of(
                assertThrows(LabTestException.class, () -> service.create(actor("ADMIN"), request)),
                assertThrows(LabTestException.class, () -> service.update(actor("ADMIN"), id.toString(), request)))) {
            assertEquals(HttpStatus.CONFLICT, failure.getStatus());
            assertEquals("LAB_TEST_CODE_IN_USE", failure.getCode());
            assertEquals("code", failure.getField());
        }
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void updateAlsoTranslatesConcurrentUniqueConstraintFailure() {
        UUID id = UUID.randomUUID();
        when(repository.findForUpdate(id)).thenReturn(Optional.of(
                new LabTest("OTHER", "Other", null, BigDecimal.ONE, "Blood", null)));
        when(repository.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("failure",
                new ConstraintViolationException("duplicate", null, "lab_tests_code_key")));
        assertEquals("LAB_TEST_CODE_IN_USE", assertThrows(LabTestException.class,
                () -> service.update(actor("ADMIN"), id.toString(), request)).getCode());
    }

    @Test
    void putPreservesAvailabilityAndPatchPreservesCatalogData() {
        UUID id = UUID.randomUUID();
        LabTest test = new LabTest("OLD", "Old", "Description", BigDecimal.ONE, "Blood", "Instructions");
        test.setActive(false);
        when(repository.findForUpdate(id)).thenReturn(Optional.of(test));
        when(repository.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        var updated = service.update(actor("ADMIN"), id.toString(), request);
        assertFalse(updated.active());
        assertEquals("CBC", updated.code());
        assertEquals(new BigDecimal("10.00"), updated.price());
        var activated = service.changeStatus(actor("ADMIN"), id.toString(), new LabTestStatusRequest(true));
        assertTrue(activated.active());
        assertEquals(updated.code(), activated.code());
        assertEquals(updated.price(), activated.price());
        assertNotNull(activated.updatedAt());
    }

    @Test
    void distinguishesInvalidIdentifiersFromMissingTests() {
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(LabTestException.class,
                () -> service.get(actor("PATIENT"), "1-1-1-1-1")).getStatus());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(LabTestException.class,
                () -> service.get(actor("PATIENT"), UUID.randomUUID().toString())).getStatus());
    }

    @Test
    void rejectsPatientInactiveListAtServiceBoundaryBeforeQuerying() {
        var query = LabTestQueryRequest.fromQueryParameters(Map.of("active", List.of("false")));
        var error = assertThrows(LabTestException.class, () -> service.list(actor("PATIENT"), query));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        assertEquals("FORBIDDEN", error.getCode());
        assertNull(error.getField());
        assertEquals(HttpStatus.UNAUTHORIZED, assertThrows(LabTestException.class,
                () -> service.list(null, query)).getStatus());
        verifyNoInteractions(repository);
    }

    @Test
    void inactiveDetailUsesMissingErrorBeforeMappingAndStaffRetainAccess() {
        UUID id = UUID.randomUUID();
        LabTest test = new LabTest("DETAIL", "Synthetic detail", "Synthetic description", BigDecimal.ONE,
                "SYNTHETIC", "Synthetic preparation");
        test.setActive(false);
        when(repository.findById(id)).thenReturn(Optional.of(test));
        LabTestMapper protectedMapper = mock(LabTestMapper.class);
        var protectedService = new LabTestService(repository, protectedMapper);
        var hidden = assertThrows(LabTestException.class, () -> protectedService.get(actor("PATIENT"), id.toString()));
        var missing = assertThrows(LabTestException.class, () -> protectedService.get(actor("PATIENT"), UUID.randomUUID().toString()));
        assertEquals(HttpStatus.NOT_FOUND, hidden.getStatus());
        assertEquals(missing.getCode(), hidden.getCode());
        assertEquals(missing.getMessage(), hidden.getMessage());
        assertNull(hidden.getField());
        verifyNoInteractions(protectedMapper);
        for (String role : List.of("ADMIN", "RECEPTIONIST", "LAB_TECHNICIAN")) {
            assertEquals("DETAIL", service.get(actor(role), id.toString()).code());
        }
        test.setActive(true);
        assertEquals("DETAIL", service.get(actor("PATIENT"), id.toString()).code());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(LabTestException.class,
                () -> service.get(actor("UNSUPPORTED"), id.toString())).getStatus());
    }
}
