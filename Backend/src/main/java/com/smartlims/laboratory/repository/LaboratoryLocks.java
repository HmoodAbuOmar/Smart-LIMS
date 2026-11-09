package com.smartlims.laboratory.repository;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class LaboratoryLocks {
    private final JdbcTemplate jdbc;

    public LaboratoryLocks(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // All create retries take identity before order. Hash collision only serializes extra work.
    public void retry(String operation, UUID actor, UUID key) {
        jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", operation + ":" + actor + ":" + key);
    }
}
