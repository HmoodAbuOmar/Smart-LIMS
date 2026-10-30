package com.smartlims.visits.dto;

import com.smartlims.laboratory.dto.LaboratoryInput;
import jakarta.validation.constraints.*;
import java.util.List;
import tools.jackson.databind.annotation.JsonDeserialize;

public final class VisitRequests {
 private VisitRequests(){}
 public record Arrival(
  @JsonDeserialize(using=LaboratoryInput.Text.class) @NotNull @Pattern(regexp=LaboratoryInput.UUID_PATTERN) String orderId,
  @JsonDeserialize(using=LaboratoryInput.Text.class) @Pattern(regexp=LaboratoryInput.UUID_PATTERN) String appointmentId,
  @JsonDeserialize(using=LaboratoryInput.Ids.class) @NotNull @Size(min=1,max=100) List<String> orderItemIds,
  @JsonDeserialize(using=LaboratoryInput.Text.class) @NotNull String arrivedAt){}
 public record Completion(
  @JsonDeserialize(using=LaboratoryInput.LongValue.class) @NotNull @PositiveOrZero Long expectedVersion,
  @JsonDeserialize(using=LaboratoryInput.Text.class) @NotNull String completedAt){}
 public record Revision(@JsonDeserialize(using=LaboratoryInput.LongValue.class) @NotNull @PositiveOrZero Long expectedVersion){}
}
