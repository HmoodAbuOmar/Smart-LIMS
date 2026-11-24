package com.smartlims.orders.dto;

import com.smartlims.appointments.entity.AppointmentStatus;
import com.smartlims.laboratory.dto.FinancialSummary;
import com.smartlims.orders.entity.OrderStatus;
import com.smartlims.patients.entity.PatientGender;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ReceptionistOrderResponse {
    private ReceptionistOrderResponse() {}

    public record Row(UUID id, String orderNumber, UUID patientId, String patientName, String patientNumber,
                      Instant createdAt, OrderStatus status, int testCount, BigDecimal totalAmount, String currency) {}

    public record Detail(Row order, List<OrderItemResponse> items, List<Appointment> appointments,
                         PatientContext patient, FinancialSummary financial, BigDecimal outstanding) {}

    public record PatientContext(LocalDate dateOfBirth, PatientGender gender, String phoneNumber) {}

    public record Appointment(UUID id, Instant startsAt, Instant endsAt, AppointmentStatus status) {}
}
