package com.smartlims.samples.dto;

import com.smartlims.laboratory.dto.LaboratoryInput;
import jakarta.validation.constraints.*;
import tools.jackson.databind.annotation.JsonDeserialize;

public final class SampleRequests {
 private SampleRequests(){}
 public record Create(
  @JsonDeserialize(using=LaboratoryInput.Text.class) @NotNull @Pattern(regexp=LaboratoryInput.UUID_PATTERN) String visitId,
  @JsonDeserialize(using=LaboratoryInput.Text.class) @NotBlank @Size(max=40) String sampleType,
  @JsonDeserialize(using=LaboratoryInput.Text.class) @Size(max=60) String containerType,
  @JsonDeserialize(using=LaboratoryInput.Text.class) String collectedAt,
  @JsonDeserialize(using=LaboratoryInput.Text.class) @Pattern(regexp=LaboratoryInput.UUID_PATTERN) String replacesSampleId){public Create{sampleType=sampleType==null?null:sampleType.strip();containerType=LaboratoryInput.optional(containerType);}}
 public record Revision(@JsonDeserialize(using=LaboratoryInput.LongValue.class) @NotNull @PositiveOrZero Long expectedVersion){}
 public record Reject(@JsonDeserialize(using=LaboratoryInput.LongValue.class) @NotNull @PositiveOrZero Long expectedVersion,@JsonDeserialize(using=LaboratoryInput.Text.class) @NotBlank @Size(max=1000) String reason){public Reject{reason=LaboratoryInput.optional(reason);}}
 public record Attest(@JsonDeserialize(using=LaboratoryInput.Text.class) @NotNull @Pattern(regexp=LaboratoryInput.UUID_PATTERN) String orderItemId){}
}
