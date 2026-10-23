package com.smartlims.patients.dto;

import java.util.List;

public record PatientPageResponse(List<PatientResponse> content, int page, int size, long totalElements, int totalPages,
                                  boolean first, boolean last) {
}
