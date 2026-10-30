package com.smartlims.results.entity;

import com.smartlims.labtests.entity.TestParameter;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.*;

@Entity @Table(name="result_values") @Getter @NoArgsConstructor(access=AccessLevel.PROTECTED)
public class ResultValue {
    public enum Flag {NORMAL,HIGH,LOW,ABNORMAL,NOT_EVALUATED}
    @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="result_id",nullable=false,updatable=false) private TestResult result;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="parameter_id",nullable=false,updatable=false) private TestParameter parameter;
    @Column(name="parameter_code_snapshot",nullable=false,length=30,updatable=false) private String code;
    @Column(name="parameter_name_snapshot",nullable=false,length=150,updatable=false) private String name;
    @Enumerated(EnumType.STRING) @Column(name="result_type_snapshot",nullable=false,length=10,updatable=false) private TestParameter.ValueType type;
    @Column(name="unit_snapshot",length=40,updatable=false) private String unit;
    @Column(name="method_snapshot",length=100,updatable=false) private String method;
    @Column(name="display_order_snapshot",nullable=false,updatable=false) private int displayOrder;
    @Column(name="is_required_snapshot",nullable=false,updatable=false) private boolean required;
    @Setter @Column(name="numeric_value",precision=38,scale=12) private BigDecimal numericValue;
    @Setter @Column(name="numeric_comparator",length=2) private String numericComparator;
    @Setter @Column(name="text_value",columnDefinition="text") private String textValue;
    @Setter @Column(name="reference_text",length=2000) private String referenceText;
    @Setter @Column(name="reference_min",precision=38,scale=12) private BigDecimal referenceMin;
    @Setter @Column(name="reference_max",precision=38,scale=12) private BigDecimal referenceMax;
    @Setter @Enumerated(EnumType.STRING) @Column(nullable=false,length=20) private Flag flag=Flag.NOT_EVALUATED;
    @Setter @Column(length=2000) private String notes;
    public ResultValue(TestResult result,TestParameter p){this.result=result;parameter=p;code=p.getCode();name=p.getName();type=p.getResultType();unit=p.getUnit();method=p.getMethod();displayOrder=p.getDisplayOrder();required=p.isRequired();}
    public ResultValue(TestResult result,ResultValue p){this.result=result;parameter=p.parameter;code=p.code;name=p.name;type=p.type;unit=p.unit;method=p.method;displayOrder=p.displayOrder;required=p.required;numericValue=p.numericValue;numericComparator=p.numericComparator;textValue=p.textValue;referenceText=p.referenceText;referenceMin=p.referenceMin;referenceMax=p.referenceMax;flag=p.flag;notes=p.notes;}
}
