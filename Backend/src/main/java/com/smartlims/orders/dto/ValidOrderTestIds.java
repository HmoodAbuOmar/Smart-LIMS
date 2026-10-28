package com.smartlims.orders.dto;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import static java.lang.annotation.ElementType.*;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

@Target({FIELD, METHOD, PARAMETER, ANNOTATION_TYPE})
@Retention(RUNTIME)
@Constraint(validatedBy = ValidOrderTestIds.Validator.class)
public @interface ValidOrderTestIds {
    String message() default "Invalid value.";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<ValidOrderTestIds, List<String>> {
        @Override public boolean isValid(List<String> values, ConstraintValidatorContext context) {
            if (values == null || values.isEmpty() || values.size() > 100) return false;
            var seen = new HashSet<UUID>();
            for (String value : values) {
                if (value == null || !value.matches(CreateStaffOrderRequest.UUID_PATTERN)) return false;
                if (!seen.add(UUID.fromString(value))) return false;
            }
            return true;
        }
    }
}
