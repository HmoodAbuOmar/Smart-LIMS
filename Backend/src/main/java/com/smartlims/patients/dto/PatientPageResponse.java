package com.smartlims.patients.dto;

import java.util.List;
import org.springframework.data.domain.Page;

public record PatientPageResponse(List<PatientResponse> content, int page, int size,
        long totalElements, int totalPages, boolean first, boolean last) {
    public static PatientPageResponse from(Page<PatientResponse> page) {
        return new PatientPageResponse(page.getContent(), page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages(), page.isFirst(), page.isLast());
    }
}
