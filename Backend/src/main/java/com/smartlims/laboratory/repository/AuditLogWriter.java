package com.smartlims.laboratory.repository;

import com.smartlims.auth.entity.UserAccount;
import com.smartlims.laboratory.dto.AuditOperation;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AuditLogWriter {
    private final JdbcTemplate jdbc;
    public AuditLogWriter(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public void append(UserAccount actor, AuditOperation operation, UUID entityId, Instant at) {
        jdbc.update("INSERT INTO audit_logs(id,actor_id,actor_name_snapshot,action,entity_type,entity_id,occurred_at,recorded_at,summary) VALUES (?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), actor.getId(), actor.getFullName(), operation.action, operation.entityType,
                entityId, Timestamp.from(at), Timestamp.from(at), operation.summary);
    }
}
