package com.smartlims.labtests;

import com.smartlims.labtests.entity.LabTest;
import com.smartlims.labtests.entity.TestParameter;
import com.smartlims.labtests.repository.LabTestRepository;
import com.smartlims.labtests.repository.TestParameterRepository;
import com.smartlims.labtests.service.TestParameterService;
import com.smartlims.laboratory.dto.LaboratoryQuery;
import com.smartlims.laboratory.service.LaboratoryAccess;
import com.smartlims.results.repository.ResultValueRepository;
import jakarta.persistence.EntityManager;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class TestParameterServiceTest {
    private final LaboratoryAccess access = mock(LaboratoryAccess.class);
    private final LabTestRepository tests = mock(LabTestRepository.class);
    private final TestParameterRepository parameters = mock(TestParameterRepository.class);
    private final ResultValueRepository values = mock(ResultValueRepository.class);
    private final TestParameterService service = new TestParameterService(access, tests, parameters, values, mock(EntityManager.class));
    private final Authentication actor = mock(Authentication.class);
    private final UUID testId = UUID.randomUUID();

    @Test
    void resolvesUsageOnceForOnlyTheReturnedPageAndPreservesPageMetadata() {
        var used = parameter("USED");
        var unused = parameter("UNUSED");
        UUID usedId = used.getId();
        var pageIds = List.of(usedId, unused.getId());
        when(tests.existsById(testId)).thenReturn(true);
        when(parameters.findAll(ArgumentMatchers.<Specification<TestParameter>>any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(used, unused), PageRequest.of(1, 2), 6));
        when(values.findUsedParameterIds(pageIds)).thenReturn(Set.of(usedId));

        var result = service.list(actor, testId.toString(), LaboratoryQuery.of(Map.of(
                "page", List.of("1"), "size", List.of("2"))));

        assertTrue(result.content().get(0).inUse());
        assertFalse(result.content().get(1).inUse());
        assertEquals(List.of("USED", "UNUSED"), result.content().stream().map(p -> p.code()).toList());
        assertEquals(1, result.page());
        assertEquals(2, result.size());
        assertEquals(6, result.totalElements());
        assertEquals(3, result.totalPages());
        assertFalse(result.first());
        assertFalse(result.last());
        verify(values).findUsedParameterIds(pageIds);
        verifyNoMoreInteractions(values);
    }

    @Test
    void emptyPageDoesNotQueryUsage() {
        when(tests.existsById(testId)).thenReturn(true);
        when(parameters.findAll(ArgumentMatchers.<Specification<TestParameter>>any(), any(Pageable.class)))
                .thenReturn(Page.empty(PageRequest.of(0, 20)));

        var result = service.list(actor, testId.toString(), LaboratoryQuery.of(Map.of()));

        assertTrue(result.content().isEmpty());
        assertEquals(0, result.totalElements());
        verifyNoInteractions(values);
    }

    private TestParameter parameter(String code) {
        var test = mock(LabTest.class);
        when(test.getId()).thenReturn(testId);
        var p = mock(TestParameter.class);
        when(p.getId()).thenReturn(UUID.randomUUID());
        when(p.getLabTest()).thenReturn(test);
        when(p.getCode()).thenReturn(code);
        when(p.getName()).thenReturn("Synthetic " + code);
        when(p.getResultType()).thenReturn(TestParameter.ValueType.NUMERIC);
        return p;
    }
}
