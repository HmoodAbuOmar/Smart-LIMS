package com.smartlims.laboratory.service;

import com.smartlims.auth.entity.*;
import com.smartlims.laboratory.dto.*;
import com.smartlims.laboratory.repository.AuditLogWriter;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class AuditPublisher {
    private final AuditLogWriter writer;
    public AuditPublisher(AuditLogWriter writer) { this.writer = writer; }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(UserAccount actor, AuditOperation operation, UUID entityId) {
        if (actor.getRole() == Role.ADMIN || actor.getRole() == Role.RECEPTIONIST)
            writer.append(actor, operation, entityId, LaboratoryInput.now());
    }
}
