package com.smartlims.auth.dto;

import com.smartlims.auth.entity.Role;
import jakarta.validation.constraints.NotNull;

public record ChangeRoleRequest(@NotNull Role role) {}
