package com.smartlims.results.dto;

import com.smartlims.laboratory.dto.LaboratoryInput;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;
import tools.jackson.databind.annotation.JsonDeserialize;

public final class ResultRequests {
 private ResultRequests(){}
 public record Create(@JsonDeserialize(using=LaboratoryInput.Text.class) @NotNull @Pattern(regexp=LaboratoryInput.UUID_PATTERN) String orderItemId){}
 public record Revision(@JsonDeserialize(using=LaboratoryInput.LongValue.class) @NotNull @PositiveOrZero Long expectedVersion){}
 public record Correction(@JsonDeserialize(using=LaboratoryInput.Text.class) @NotBlank @Size(max=1000) String reason){public Correction{reason=LaboratoryInput.optional(reason);}}
 public record Edit(
  @JsonDeserialize(using=LaboratoryInput.LongValue.class) @NotNull @PositiveOrZero Long expectedVersion,
  @JsonDeserialize(using=LaboratoryInput.Text.class) String measuredAt,
  @JsonDeserialize(using=LaboratoryInput.Ids.class) @NotNull @Size(max=100) List<String> specimenIds,
  @JsonDeserialize(using=LaboratoryInput.Text.class) @Size(max=10000) String explanation,
  @NotNull @Size(min=1,max=200) List<@NotNull @Valid Value> values){}
 public record Value(
  @JsonDeserialize(using=LaboratoryInput.Text.class) @NotNull @Pattern(regexp=LaboratoryInput.UUID_PATTERN) String parameterId,
  @JsonDeserialize(using=LaboratoryInput.Decimal.class) @Digits(integer=26,fraction=12) BigDecimal numericValue,
  @JsonDeserialize(using=LaboratoryInput.Text.class) @Pattern(regexp="<|<=|>|>=") String numericComparator,
  @JsonDeserialize(using=LaboratoryInput.Text.class) @Size(max=10000) String textValue,
  @JsonDeserialize(using=LaboratoryInput.Text.class) @Size(max=2000) String referenceText,
  @JsonDeserialize(using=LaboratoryInput.Decimal.class) @Digits(integer=26,fraction=12) BigDecimal referenceMin,
  @JsonDeserialize(using=LaboratoryInput.Decimal.class) @Digits(integer=26,fraction=12) BigDecimal referenceMax,
  @JsonDeserialize(using=LaboratoryInput.Text.class) @NotNull @Pattern(regexp="NORMAL|HIGH|LOW|ABNORMAL|NOT_EVALUATED") String flag,
  @JsonDeserialize(using=LaboratoryInput.Text.class) @Size(max=2000) String notes){}
}
