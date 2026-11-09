package com.smartlims.auth.repository;

import com.smartlims.auth.dto.UserPageResponse;
import com.smartlims.auth.dto.UserQueryRequest;
import com.smartlims.auth.dto.UserListRow;
import com.smartlims.auth.entity.AccountOrigin;
import com.smartlims.auth.entity.UserAccount;
import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Repository;

@Repository
public class UserAccountQueries {
    private final EntityManager entityManager;

    public UserAccountQueries(EntityManager entityManager) { this.entityManager = entityManager; }

    public UserPageResponse page(UserQueryRequest request) {
        var builder = entityManager.getCriteriaBuilder();
        var countQuery = builder.createQuery(Long.class);
        var countRoot = countQuery.from(UserAccount.class);
        countQuery.select(builder.count(countRoot)).where(filters(request, countRoot, builder));
        long total = entityManager.createQuery(countQuery).getSingleResult();
        int pages = (int) Math.min(Integer.MAX_VALUE, (total + request.size() - 1) / request.size());
        long offset = (long) request.page() * request.size();
        List<UserListRow> content = List.of();
        if (offset < total && offset <= Integer.MAX_VALUE) {
            var query = builder.createQuery(UserAccount.class);
            var root = query.from(UserAccount.class);
            var field = request.sort().split(",")[0];
            Expression<?> key = switch (field) {
                case "fullName" -> builder.lower(root.get("fullName"));
                case "status" -> status(root, builder);
                default -> root.get(field);
            };
            var nullsLast = builder.<Integer>selectCase().when(builder.isNull(key), 1).otherwise(0);
            query.select(root).where(filters(request, root, builder)).orderBy(builder.asc(nullsLast),
                    request.sort().endsWith(",desc") ? builder.desc(key) : builder.asc(key), builder.asc(root.get("id")));
            content = entityManager.createQuery(query).setFirstResult((int) offset).setMaxResults(request.size())
                    .getResultList().stream().map(UserListRow::from).toList();
        }
        return new UserPageResponse(content, request.page(), request.size(), total, pages,
                request.page() == 0, (long) request.page() + 1 >= pages);
    }

    private Predicate[] filters(UserQueryRequest request, Root<UserAccount> root, CriteriaBuilder builder) {
        var predicates = new ArrayList<Predicate>();
        if (!request.search().isEmpty()) {
            String literal = request.search().toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
            predicates.add(builder.or(builder.like(builder.lower(root.get("fullName")), "%" + literal + "%", '\\'),
                    builder.like(builder.lower(root.get("email")), "%" + literal + "%", '\\')));
        }
        if (request.role() != null) predicates.add(builder.equal(root.get("role"), request.role()));
        if (request.status() != null) predicates.add(builder.equal(status(root, builder), request.status().name()));
        if (request.createdFrom() != null) predicates.add(builder.greaterThanOrEqualTo(root.get("createdAt"), request.createdFrom()));
        if (request.createdTo() != null) predicates.add(builder.lessThan(root.get("createdAt"), request.createdTo()));
        return predicates.toArray(Predicate[]::new);
    }

    private Expression<String> status(Root<UserAccount> root, CriteriaBuilder builder) {
        return builder.<String>selectCase().when(builder.isFalse(root.get("enabled")), "BLOCKED")
                .when(builder.and(builder.notEqual(root.get("origin"), AccountOrigin.PUBLIC_REGISTRATION),
                        builder.isNull(root.get("invitationAcceptedAt"))), "INVITED")
                .when(builder.isNull(root.get("emailVerifiedAt")), "PENDING_VERIFICATION").otherwise("ACTIVE");
    }
}
