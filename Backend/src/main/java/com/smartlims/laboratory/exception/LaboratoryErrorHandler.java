package com.smartlims.laboratory.exception;

import com.smartlims.auth.controller.AuthErrorHandler.ApiError;
import com.smartlims.labtests.controller.TestParameterController;
import com.smartlims.visits.controller.VisitController;
import com.smartlims.samples.controller.SampleController;
import com.smartlims.results.controller.ResultController;
import com.smartlims.patients.controller.PatientDashboardController;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.ConstraintViolationException;
import java.util.*;
import org.springframework.core.annotation.Order;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

@Order(-1) @RestControllerAdvice(assignableTypes={TestParameterController.class,VisitController.class,SampleController.class,ResultController.class,PatientDashboardController.class})
public class LaboratoryErrorHandler {
 @ExceptionHandler(LaboratoryException.class) ResponseEntity<ApiError> request(LaboratoryException e,HttpServletResponse r){return respond(e.getStatus(),e.getCode(),e.getMessage(),e.getField()==null?Map.of():Map.of(e.getField(),e.getMessage()),r);}
 @ExceptionHandler(MethodArgumentNotValidException.class) ResponseEntity<ApiError> validation(MethodArgumentNotValidException e,HttpServletResponse r){Map<String,String> f=new LinkedHashMap<>();e.getBindingResult().getFieldErrors().forEach(v->f.putIfAbsent(v.getField(),"Invalid value."));return respond(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR","Please correct the request fields.",f,r);}
 @ExceptionHandler(ConstraintViolationException.class) ResponseEntity<ApiError> constraint(ConstraintViolationException e,HttpServletResponse r){Map<String,String> f=new LinkedHashMap<>();e.getConstraintViolations().forEach(v->{var p=v.getPropertyPath().toString();f.putIfAbsent(p.substring(p.lastIndexOf('.')+1),"Invalid value.");});return respond(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR","Please correct the request fields.",f,r);}
 @ExceptionHandler(HttpMessageNotReadableException.class) ResponseEntity<ApiError> json(HttpServletResponse r){return respond(HttpStatus.BAD_REQUEST,"INVALID_JSON","Invalid request body.",Map.of(),r);}
 @ExceptionHandler(Exception.class) ResponseEntity<ApiError> unexpected(Exception e,HttpServletResponse r){var s=e instanceof ErrorResponse h?HttpStatus.valueOf(h.getStatusCode().value()):HttpStatus.INTERNAL_SERVER_ERROR;return respond(s,s.is5xxServerError()?"INTERNAL_SERVER_ERROR":"INVALID_REQUEST",s.is5xxServerError()?"An unexpected error occurred.":"Invalid request.",Map.of(),r);}
 private ResponseEntity<ApiError> respond(HttpStatus s,String code,String message,Map<String,String> fields,HttpServletResponse r){var id=UUID.randomUUID().toString();r.setHeader("X-Request-Id",id);return ResponseEntity.status(s).contentType(MediaType.APPLICATION_JSON).header("Cache-Control","no-store").body(new ApiError(code,message,fields,id));}
}
