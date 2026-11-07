package com.smartlims.auth.dto;

import java.util.List;

public record UserPageResponse(List<UserListRow> content, int page, int size, long totalElements,
                               int totalPages, boolean first, boolean last) {
}
