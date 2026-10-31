package com.smartlims.laboratory.dto;

import com.smartlims.laboratory.exception.LaboratoryException;

import java.util.*;

import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public record LaboratoryQuery(Map<String, List<String>> values, int page, int size) {
    public static LaboratoryQuery of(Map<String, List<String>> values, String... allowed) {
        var names = new HashSet<>(List.of(allowed));
        names.addAll(List.of("page", "size"));
        values.forEach((k, v) -> {
            if (!names.contains(k) || v == null || v.size() != 1 || v.getFirst() == null)
                throw LaboratoryException.invalid(k);
        });
        int p = integer(single(values, "page", "0"), "page"), s = integer(single(values, "size", "20"), "size");
        if (s < 1 || s > 100)
            throw LaboratoryException.invalid("size");
        return new LaboratoryQuery(values, p, s);
    }

    public String get(String name, String fallback) {
        return single(values, name, fallback);
    }

    public UUID optionalId(String name) {
        return values.containsKey(name) ? LaboratoryInput.uuid(get(name, null), name) : null;
    }

    public boolean bool(String name) {
        var s = get(name, "false");
        if (!s.equals("true") && !s.equals("false"))
            throw LaboratoryException.invalid(name);
        return Boolean.parseBoolean(s);
    }

    public <T> Page<T> find(JpaSpecificationExecutor<T> repository, Specification<T> spec, Sort sort) {
        var paging = PageRequest.of(page, size, sort);
        return paging.getOffset() > Integer.MAX_VALUE ? new PageImpl<>(List.of(), paging, repository.count(spec)) : repository.findAll(spec, paging);
    }

    public static <T> PageBody<T> page(Page<?> source, List<T> content) {
        return new PageBody<>(content, source.getNumber(), source.getSize(), source.getTotalElements(), source.getTotalPages(), source.isFirst(), (long) source.getNumber() + 1 >= source.getTotalPages());
    }

    public record PageBody<T>(List<T> content, int page, int size, long totalElements, int totalPages, boolean first,
                              boolean last) {
    }

    private static String single(Map<String, List<String>> v, String k, String fallback) {
        return v.containsKey(k) ? v.get(k).getFirst() : fallback;
    }

    private static int integer(String s, String field) {
        if (!s.matches("[0-9]+"))
            throw LaboratoryException.invalid(field);
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            throw LaboratoryException.invalid(field);
        }
    }
}
