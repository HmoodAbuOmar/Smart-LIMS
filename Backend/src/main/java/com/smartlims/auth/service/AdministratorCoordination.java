package com.smartlims.auth.service;

import jakarta.persistence.EntityManager;
import org.hibernate.Session;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
public class AdministratorCoordination {
    // Shared by administrator removal/role changes and first-administrator provisioning.
    private static final long LOCK_KEY = 0x534C494D5341444DL;
    private final EntityManager entityManager;

    public AdministratorCoordination(EntityManager entityManager) { this.entityManager = entityManager; }

    @Transactional(propagation = Propagation.MANDATORY)
    public void lock() {
        entityManager.unwrap(Session.class).doWork(connection -> {
            try (var statement = connection.prepareStatement("select pg_advisory_xact_lock(?)")) {
                statement.setLong(1, LOCK_KEY);
                statement.execute();
            }
        });
    }
}
