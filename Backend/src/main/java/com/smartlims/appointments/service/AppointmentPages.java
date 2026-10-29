package com.smartlims.appointments.service;

import com.smartlims.appointments.dto.AppointmentQuery;
import java.util.List;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

final class AppointmentPages {
    private AppointmentPages() {}
    static <T> Page<T> find(JpaSpecificationExecutor<T> repository, Specification<T> filter, AppointmentQuery query, Sort sort) {
        var page=PageRequest.of(query.page(),query.size(),sort);
        if (page.getOffset()>Integer.MAX_VALUE) return new PageImpl<>(List.of(),page,repository.count(filter));
        return repository.findAll(filter,page);
    }
}
