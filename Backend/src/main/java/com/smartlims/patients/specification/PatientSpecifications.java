package com.smartlims.patients.specification;

import com.smartlims.patients.entity.Patient;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;

public final class PatientSpecifications {
    private PatientSpecifications() {}

    public static Specification<Patient> search(String search) {
        return (root, query, builder) -> {
            if (search == null || search.isEmpty()) return builder.conjunction();
            String pattern = "%" + escape(search) + "%";
            String insensitive = pattern.toLowerCase(Locale.ROOT);
            return builder.or(
                    builder.like(builder.lower(root.get("fullName")), insensitive, '\\'),
                    builder.like(builder.lower(root.get("patientNumber")), insensitive, '\\'),
                    builder.like(root.get("phoneNumber"), pattern, '\\'));
        };
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
