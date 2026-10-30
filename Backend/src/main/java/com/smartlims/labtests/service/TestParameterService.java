package com.smartlims.labtests.service;

import com.smartlims.auth.entity.Role;
import com.smartlims.labtests.dto.*;
import com.smartlims.labtests.entity.TestParameter;
import com.smartlims.labtests.repository.*;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.exception.LaboratoryException;
import com.smartlims.laboratory.service.LaboratoryAccess;
import com.smartlims.results.repository.ResultValueRepository;
import jakarta.persistence.EntityManager;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.*;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service @Validated
public class TestParameterService {
 private final LaboratoryAccess access; private final LabTestRepository tests; private final TestParameterRepository parameters; private final ResultValueRepository values; private final EntityManager entities;
 public TestParameterService(LaboratoryAccess access,LabTestRepository tests,TestParameterRepository parameters,ResultValueRepository values,EntityManager entities){this.access=access;this.tests=tests;this.parameters=parameters;this.values=values;this.entities=entities;}
 @Transactional public TestParameterResponse save(Authentication actor,String testId,String id,@NotNull @Valid TestParameterRequest body){
  access.current(actor,Role.ADMIN);var testKey=LaboratoryInput.uuid(testId,"testId");var key=id==null?null:LaboratoryInput.uuid(id,"id");
  if((key==null&&body.expectedVersion()!=null)||(key!=null&&body.expectedVersion()==null))throw LaboratoryException.invalid("expectedVersion");
  LaboratoryInput.text(body.name(),"name",150,true);LaboratoryInput.text(body.unit(),"unit",40,false);LaboratoryInput.text(body.method(),"method",100,false);
  var test=tests.findForUpdate(testKey).orElseThrow(()->LaboratoryException.missing("LAB_TEST"));
  var p=key==null?new TestParameter(test,body.code()):parameters.findByIdAndLabTest_Id(key,testKey).orElseThrow(()->LaboratoryException.missing("PARAMETER"));
  if(key!=null&&p.getVersion()!=body.expectedVersion())throw LaboratoryException.conflict("PARAMETER_CHANGED");
  if(key!=null&&!p.getCode().equals(body.code()))throw LaboratoryException.invalid("code");
  if(parameters.existsByLabTest_IdAndCodeAndIdNot(testKey,body.code(),key==null?new UUID(0,0):key))throw LaboratoryException.conflict("PARAMETER_CODE_CONFLICT");
  var type=TestParameter.ValueType.valueOf(body.resultType());
  if(key!=null&&values.existsByParameter_Id(key)&&(!Objects.equals(p.getName(),body.name())||p.getResultType()!=type||!Objects.equals(p.getUnit(),body.unit())||!Objects.equals(p.getMethod(),body.method())||p.getDisplayOrder()!=body.displayOrder()||p.isRequired()!=body.required()))throw LaboratoryException.conflict("PARAMETER_IN_USE");
  p.setName(body.name());p.setResultType(type);p.setUnit(body.unit());p.setMethod(body.method());p.setDisplayOrder(body.displayOrder());p.setRequired(body.required());p.setActive(body.active());
  parameters.saveAndFlush(p);entities.refresh(p);return TestParameterResponse.from(p);
 }
 @Transactional(readOnly=true) public LaboratoryQuery.PageBody<TestParameterResponse> list(Authentication actor,String testId,LaboratoryQuery query){
  access.current(actor,Role.ADMIN,Role.RECEPTIONIST,Role.LAB_TECHNICIAN);var id=LaboratoryInput.uuid(testId,"testId");boolean all=query.bool("includeInactive");
  if(!tests.existsById(id))throw LaboratoryException.missing("LAB_TEST");
  Specification<TestParameter> spec=(r,q,c)->c.and(c.equal(r.get("labTest").get("id"),id),all?c.conjunction():c.isTrue(r.get("active")));
  var page=query.find(parameters,spec,Sort.by("displayOrder","code","id"));return LaboratoryQuery.page(page,page.getContent().stream().map(TestParameterResponse::from).toList());
 }
}
