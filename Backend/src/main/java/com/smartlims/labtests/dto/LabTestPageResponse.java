package com.smartlims.labtests.dto;

import java.util.List;

public record LabTestPageResponse(List<LabTestResponse> content, int page, int size,
        long totalElements, int totalPages, boolean first, boolean last) {}
