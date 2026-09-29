package com.smartlims.auth.repository;

import com.smartlims.auth.entity.EmailActionToken;
import com.smartlims.auth.entity.EmailActionPurpose;
import com.smartlims.auth.entity.UserAccount;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmailActionTokenRepository extends JpaRepository<EmailActionToken, UUID> {
    Optional<EmailActionToken> findByTokenHashAndPurpose(String tokenHash, EmailActionPurpose purpose);

    @Modifying
    @Query("delete from EmailActionToken t where t.user = :user and t.purpose = :purpose")
    int deleteByUserAndPurpose(@Param("user") UserAccount user, @Param("purpose") EmailActionPurpose purpose);

    @Modifying
    @Query("update EmailActionToken t set t.consumedAt = :now where t.id = :id and "
            + "t.purpose = :purpose and t.consumedAt is null and t.expiresAt > :now")
    int consumeIfValid(@Param("id") UUID id, @Param("purpose") EmailActionPurpose purpose,
            @Param("now") Instant now);
}
