package com.smartlims.results.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.service.LaboratoryAccess;
import com.smartlims.results.dto.ResultResponse;
import com.smartlims.results.entity.*;
import com.smartlims.results.repository.TestResultRepository;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class PatientResultReadService {
 private final LaboratoryAccess access;private final TestResultRepository results;private final ResultMapping mapping;
 public PatientResultReadService(LaboratoryAccess access,TestResultRepository results,ResultMapping mapping){this.access=access;this.results=results;this.mapping=mapping;}
 @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ) public ResultResponse get(Authentication actor,String id){return mapping.detail(owned(actor,id),true);}
 @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ) public LaboratoryQuery.PageBody<ResultResponse> history(Authentication actor,String id,LaboratoryQuery query){
  var r=owned(actor,id);Specification<TestResult> spec=(root,q,c)->c.and(c.equal(root.get("item").get("id"),r.getItem().getId()),c.equal(root.get("status"),ResultStatus.PUBLISHED));var page=query.find(results,spec,Sort.by(Sort.Direction.DESC,"versionNumber"));return LaboratoryQuery.page(page,page.getContent().stream().map(p->mapping.detail(p,true)).toList());
 }
 private TestResult owned(Authentication actor,String id){var key=LaboratoryInput.uuid(id,"id");var user=access.current(actor,Role.PATIENT);var r=results.findById(key).orElseThrow(()->LaboratoryException.missing("RESULT"));access.own(user,r.getItem().getOrder(),"RESULT");if(r.getStatus()!=ResultStatus.PUBLISHED)throw LaboratoryException.missing("RESULT");return r;}
}
