package com.smartlims.labtests.mapper;

import com.smartlims.labtests.dto.*;
import com.smartlims.labtests.entity.LabTest;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Component;

@Component
public class LabTestMapper {
    public LabTestResponse toResponse(LabTest test) {
        return new LabTestResponse(test.getId(), test.getCode(), test.getName(), test.getDescription(),
                test.getPrice(), test.getCurrency(), test.getSampleType(), test.getPreparationInstructions(),
                test.isActive(), test.getCreatedAt(), test.getUpdatedAt(),
                test.getCategories().stream().sorted().toList());
    }

    public LabTestPageResponse toPageResponse(Page<LabTest> page) {
        return new LabTestPageResponse(page.getContent().stream().map(this::toResponse).toList(),
                page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages(),
                page.isFirst(), page.isLast());
    }
}
