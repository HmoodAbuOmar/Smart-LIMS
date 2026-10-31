package com.smartlims.notifications.repository;

import com.smartlims.notifications.entity.PatientNotification;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface PatientNotificationRepository extends JpaRepository<PatientNotification, UUID> {
    // Shared by every read/count/mutation: notification ownership alone never grants target access.
    String VISIBLE = " n.patient_id IN (SELECT p.id FROM patients p WHERE p.user_id=:user) "
            + "AND EXISTS (SELECT 1 FROM test_orders o WHERE o.id=n.order_id AND o.patient_id=n.patient_id) "
            + "AND (n.appointment_id IS NULL OR EXISTS (SELECT 1 FROM appointments a WHERE a.id=n.appointment_id AND a.order_id=n.order_id)) "
            + "AND (n.result_id IS NULL OR EXISTS (SELECT 1 FROM test_results r JOIN order_items i ON i.id=r.order_item_id "
            + "WHERE r.id=n.result_id AND r.status='PUBLISHED' AND i.order_id=n.order_id)) ";
    String FILTER = VISIBLE + "AND (CAST(:category AS varchar) IS NULL OR n.category=CAST(:category AS varchar)) "
            + "AND (CAST(:unread AS boolean) IS NULL OR (n.read_at IS NULL)=CAST(:unread AS boolean)) ";

    @Query(value = "SELECT n.* FROM patient_notifications n WHERE " + FILTER + "ORDER BY n.created_at DESC,n.id ASC",
            countQuery = "SELECT count(*) FROM patient_notifications n WHERE " + FILTER, nativeQuery = true)
    Page<PatientNotification> page(@Param("user") UUID user, @Param("category") String category,
            @Param("unread") Boolean unread, Pageable pageable);

    @Query(value = "SELECT count(*) FROM patient_notifications n WHERE " + FILTER, nativeQuery = true)
    long countVisible(@Param("user") UUID user, @Param("category") String category, @Param("unread") Boolean unread);

    @Query(value = "SELECT n.* FROM patient_notifications n WHERE n.id=:id AND " + VISIBLE, nativeQuery = true)
    Optional<PatientNotification> owned(@Param("user") UUID user, @Param("id") UUID id);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "UPDATE patient_notifications n SET read_at=GREATEST(clock_timestamp(),n.created_at) "
            + "WHERE n.id=:id AND n.read_at IS NULL AND " + VISIBLE, nativeQuery = true)
    int markRead(@Param("user") UUID user, @Param("id") UUID id);

    @Modifying(flushAutomatically = true)
    @Query(value = "UPDATE patient_notifications n SET read_at=GREATEST(statement_timestamp(),n.created_at) "
            + "WHERE n.read_at IS NULL AND " + VISIBLE, nativeQuery = true)
    int markAllRead(@Param("user") UUID user);

    @Modifying(flushAutomatically = true)
    @Query(value = "INSERT INTO patient_notifications(patient_id,order_id,appointment_id,result_id,category,event_type,event_key,title,message) "
            + "VALUES (:patient,:order,:appointment,:result,:category,:type,:key,:title,:message) ON CONFLICT(event_key) DO NOTHING", nativeQuery = true)
    int insert(@Param("patient") UUID patient, @Param("order") UUID order, @Param("appointment") UUID appointment,
            @Param("result") UUID result, @Param("category") String category, @Param("type") String type,
            @Param("key") String key, @Param("title") String title, @Param("message") String message);
}
