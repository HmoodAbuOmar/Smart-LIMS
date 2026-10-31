package com.smartlims.labtests.dto;

import com.smartlims.labtests.entity.LabTestCategory;
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.Retention;
import java.lang.annotation.Target;
import java.util.EnumSet;
import java.util.List;

import static java.lang.annotation.ElementType.*;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

@Target({FIELD, METHOD, PARAMETER, ANNOTATION_TYPE})
@Retention(RUNTIME)
@Constraint(validatedBy = ValidLabTestCategories.Validator.class)
public @interface ValidLabTestCategories {
    String message() default "Invalid value.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<ValidLabTestCategories, List<String>> {
        @Override
        public boolean isValid(List<String> values, ConstraintValidatorContext context) {
            if (values == null)
                return true;
            if (values.size() > LabTestCategory.values().length)
                return false;
            var seen = EnumSet.noneOf(LabTestCategory.class);
            for (String value : values) {
                if (value == null)
                    return false;
                try {
                    if (!seen.add(LabTestCategory.valueOf(value)))
                        return false;
                } catch (IllegalArgumentException error) {
                    return false;
                }
            }
            return true;
        }
    }
}
