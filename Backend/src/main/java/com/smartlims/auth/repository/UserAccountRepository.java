package com.smartlims.auth.repository;

import com.smartlims.auth.entity.UserAccount;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {
    Optional<UserAccount> findByEmail(String email);
    Optional<UserAccount> findByUserNameIgnoreCase(String userName);
    boolean existsByUserNameIgnoreCase(String userName);
    long countByRoleAndEnabledTrueAndEmailVerifiedAtIsNotNull(com.smartlims.auth.entity.Role role);

    boolean existsByEmail(String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UserAccount u where u.id = :id")
    Optional<UserAccount> findWithLockById(@Param("id") UUID id);
}
