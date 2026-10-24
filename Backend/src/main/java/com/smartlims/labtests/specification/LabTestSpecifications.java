package com.smartlims.labtests.specification;

import com.smartlims.labtests.entity.LabTest;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;

public final class LabTestSpecifications {
    private LabTestSpecifications() {}

    public static Specification<LabTest> filter(String search, Boolean active) {
        return (root, query, builder) -> {
            var available = active == null ? builder.conjunction() : builder.equal(root.get("active"), active);
            if (search == null || search.isEmpty()) return available;
            String pattern = "%" + search.toLowerCase(Locale.ROOT).replace("\\", "\\\\")
                    .replace("%", "\\%").replace("_", "\\_") + "%";
            return builder.and(available, builder.or(
                    builder.like(builder.lower(root.get("code")), pattern, '\\'),
                    builder.like(builder.lower(root.get("name")), pattern, '\\')));
        };
    }
}
