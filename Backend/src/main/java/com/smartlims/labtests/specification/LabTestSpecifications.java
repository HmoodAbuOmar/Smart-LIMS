package com.smartlims.labtests.specification;

import com.smartlims.labtests.entity.LabTest;
import com.smartlims.labtests.entity.LabTestCategory;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;

public final class LabTestSpecifications {
    private LabTestSpecifications() {}

    public static Specification<LabTest> filter(String search, Boolean active, LabTestCategory category) {
        return (root, query, builder) -> {
            var available = active == null ? builder.conjunction() : builder.equal(root.get("active"), active);
            var membership = builder.conjunction();
            if (category != null) {
                // Keep assignment rows out of the outer query so content and counts remain per test.
                var assignments = query.subquery(Integer.class);
                var assignedCategory = assignments.correlate(root).join("categories");
                assignments.select(builder.literal(1)).where(builder.equal(assignedCategory, category));
                membership = builder.exists(assignments);
            }
            var visible = builder.and(available, membership);
            if (search == null || search.isEmpty()) return visible;
            String pattern = "%" + search.toLowerCase(Locale.ROOT).replace("\\", "\\\\")
                    .replace("%", "\\%").replace("_", "\\_") + "%";
            return builder.and(visible, builder.or(
                    builder.like(builder.lower(root.get("code")), pattern, '\\'),
                    builder.like(builder.lower(root.get("name")), pattern, '\\')));
        };
    }
}
