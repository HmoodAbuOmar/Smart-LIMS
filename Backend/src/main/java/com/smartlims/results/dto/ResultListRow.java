package com.smartlims.results.dto;

import com.smartlims.labtests.entity.LabTestCategory;
import java.time.*;
import java.util.*;

public record ResultListRow(UUID orderItemId,UUID orderId,String orderNumber,String testCode,String testName,UUID currentResultId,LocalDate reportDate,Instant publishedAt,String status,List<LabTestCategory> categories,boolean canViewResult,boolean canDownloadReport,boolean visitDetailsAvailable,List<UUID> visitIds){}
