package com.smartlims.labtests.dto;

import com.smartlims.laboratory.dto.LaboratoryInput;
import jakarta.validation.constraints.*;
import java.util.Locale;
import tools.jackson.databind.annotation.JsonDeserialize;

public record TestParameterRequest(
 @JsonDeserialize(using=LaboratoryInput.Text.class) @NotBlank @Pattern(regexp="[A-Z0-9][A-Z0-9_-]{0,29}") String code,
 @JsonDeserialize(using=LaboratoryInput.Text.class) @NotBlank @Size(max=150) String name,
 @JsonDeserialize(using=LaboratoryInput.Text.class) @NotNull @Pattern(regexp="NUMERIC|TEXT") String resultType,
 @JsonDeserialize(using=LaboratoryInput.Text.class) @Size(max=40) String unit,
 @JsonDeserialize(using=LaboratoryInput.Text.class) @Size(max=100) String method,
 @JsonDeserialize(using=LaboratoryInput.IntegerValue.class) @NotNull @PositiveOrZero Integer displayOrder,
 @JsonDeserialize(using=LaboratoryInput.BooleanValue.class) @NotNull Boolean required,
 @JsonDeserialize(using=LaboratoryInput.BooleanValue.class) @NotNull Boolean active,
 @JsonDeserialize(using=LaboratoryInput.LongValue.class) @PositiveOrZero Long expectedVersion){
 public TestParameterRequest{code=code==null?null:code.strip().toUpperCase(Locale.ROOT);name=name==null?null:name.strip();unit=LaboratoryInput.optional(unit);method=LaboratoryInput.optional(method);}
}
