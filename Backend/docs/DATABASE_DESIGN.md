# Smart-LIMS Database Design

Status: agreed implementation baseline for the scope described below.
Review note: draft measurements may remain unfilled; required-parameter snapshots are persisted per result version.
Updated: 2026-10-26 (patient phase 2).
Migration integration note: main is merged; V4__lab_tests.sql is unchanged and patient linking is prepared as V5__patient_link_tokens.sql with unchanged SQL. The previously audited development database still has the legacy V4 linking identity and requires a separately authorized manual reconciliation before startup. This source preparation did not connect to or modify it. See PATIENTS_API.md section 15.9 and PATIENT_LINKING_V5_RECONCILIATION.md.
Intended repository path: `Backend/docs/DATABASE_DESIGN.md`.

## 1. Scope and implementation status

This document defines the database target for Smart-LIMS. It is a design contract, not evidence that every table or module has already been implemented.

- PostgreSQL 16; UUID identifiers; Spring Boot/JPA backend.
- One laboratory and one booking schedule.
- Roles: ADMIN, PATIENT, RECEPTIONIST, LAB_TECHNICIAN. No physician role.
- Patients may have a laboratory profile without a login account.
- No national identity number or blood type in the patient profile.
- Patient name, birth date, gender, and phone are required; address is optional; phone numbers are not unique.
- Initial monetary currency: ILS.
- Payments are recorded manually or by external transaction reference; no payment gateway is included in this baseline.
- The target contains 21 application tables, including the phase-2 `patient_link_tokens` addition. `flyway_schema_history` is technical and excluded from that count.
- `users`, `email_action_tokens`, `patients`, `lab_tests`, and `patient_link_tokens` are implemented through V1-V5. Other application tables remain implementation targets.
- The supplied SQL also adds `users.reset_code_failed_attempts`; it is included here.
- Preserve existing authentication behavior. Do not recreate existing authentication tables or rewrite an applied migration.
- Symptom-based suggestions are scheduled for a later AI phase. Further AI result-analysis persistence is outside this baseline and requires a separate scope decision.

## 2. Naming and data conventions

- Table/column names use snake_case.
- `Nullable: No` means NOT NULL; primary keys are inherently NOT NULL.
- Every standalone `id` is UUID, generated following the existing application convention.
- `result_samples` uses a composite primary key.
- All event timestamps use TIMESTAMPTZ. Display times using Asia/Jerusalem where appropriate.
- `created_at` defaults to CURRENT_TIMESTAMP. `updated_at` defaults to CURRENT_TIMESTAMP on insertion and must be updated by the application on subsequent writes; a DEFAULT alone does not maintain it.
- Money uses NUMERIC(12,2) and BigDecimal. Laboratory numeric values use NUMERIC; reject NaN and infinity at the input boundary.
- Generate patient numbers, order numbers, and sample barcodes with sequences or another concurrency-safe mechanism, never MAX+1.
- Initial flags: active and is_required default TRUE; is_current defaults FALSE. Counters default 0. Initial statuses are specified under each table.
- Treat free-text blank strings consistently; trim user input and reject blank required fields.
- Foreign keys use RESTRICT/NO ACTION for retained business history unless explicitly stated otherwise. The existing email token FK retains ON DELETE CASCADE.
- Foreign keys and CHECK constraints cannot alone enforce every cross-table rule below; implement the stated transaction/service validations or triggers.

## 3. Complete table list

| # | Table | Purpose |
|---|---|---|
| 1 | `users` | System accounts and authentication state. Preserve the existing implementation. |
| 2 | `email_action_tokens` | Existing account action tokens for email verification, password reset, and invitation acceptance. |
| 3 | `patients` | Laboratory patient profiles. A profile may exist without a login account. |
| 4 | `lab_tests` | Orderable laboratory tests, their current prices, and preparation instructions. |
| 5 | `test_parameters` | Individual measurements within a test, such as WBC or HGB within CBC. |
| 6 | `reference_ranges` | Approved numeric or textual reference ranges by parameter, age, sex, and validity period. |
| 7 | `test_orders` | The main laboratory order belonging to a patient. |
| 8 | `order_items` | The individual tests selected within an order, including historical name and price snapshots. |
| 9 | `appointment_slots` | Available booking periods and the maximum number of appointments for each period. |
| 10 | `appointments` | An optional appointment for a laboratory order. |
| 11 | `payments` | Payment and refund records. This design does not integrate a payment gateway. |
| 12 | `samples` | Physical samples collected for an order, including receipt, rejection, and replacement tracking. |
| 13 | `sample_tests` | Many-to-many links between physical samples and ordered tests. |
| 14 | `test_results` | Result versions for one ordered test, with validation, publication, and correction history. |
| 15 | `result_samples` | The exact sample-to-test links used by each result version. |
| 16 | `result_values` | Individual measured values and historical parameter/reference snapshots within a result version. |
| 17 | `notifications` | User notifications and delivery/retry state. |
| 18 | `audit_logs` | Append-only records of important business actions. |
| 19 | `symptom_assessments` | Patient symptom-analysis sessions for the later test-suggestion feature. |
| 20 | `suggested_tests` | Laboratory tests suggested by a symptom assessment. |
| 21 | `patient_link_tokens` | Short-lived, single-use capabilities for verified patient account/profile linking. |

## 4. Table specifications

### 4.1. `users`

System accounts and authentication state. Preserve the existing implementation.

Implementation status: existing; preserve supplied schema and current behavior.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `full_name` | `VARCHAR(120)` | No | - | Full name |
| `email` | `VARCHAR(254)` | No | UNIQUE | Canonical account email |
| `user_name` | `VARCHAR(30)` | Yes | Case-insensitive partial UNIQUE | Optional login username |
| `phone_number` | `VARCHAR(20)` | Yes | - | Contact phone number |
| `password_hash` | `VARCHAR(255)` | Yes | - | Stored password hash |
| `role` | `VARCHAR(30)` | No | CHECK | Account role |
| `origin` | `VARCHAR(30)` | No | CHECK | Account creation origin |
| `enabled` | `BOOLEAN` | No | DEFAULT FALSE | Account enabled state |
| `email_verified_at` | `TIMESTAMPTZ` | Yes | - | Email verification time |
| `invitation_accepted_at` | `TIMESTAMPTZ` | Yes | - | Invitation acceptance time |
| `failed_login_attempts` | `INTEGER` | No | DEFAULT 0 | Failed login count |
| `locked_until` | `TIMESTAMPTZ` | Yes | - | Temporary lock expiry |
| `reset_code_hash` | `VARCHAR(255)` | Yes | - | Password-reset code hash |
| `reset_code_expires_at` | `TIMESTAMPTZ` | Yes | - | Reset code expiry |
| `reset_code_failed_attempts` | `INTEGER` | No | DEFAULT 0; CHECK 0..5 | Failed reset-code attempts |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Last modification time |

**Rules and relationships**

- Existing schema supplied by the project owner: preserve V1 and any later applied migration. This section consolidates the supplied CREATE TABLE and ALTER TABLE; it does not prescribe rewriting V1.
- Roles: ADMIN, PATIENT, RECEPTIONIST, LAB_TECHNICIAN.
- Origins: PUBLIC_REGISTRATION, ADMIN_INVITATION, FIRST_ADMIN_INVITATION.
- Email is NOT NULL and UNIQUE. The existing canonical-email CHECK requires email = lower(btrim(email)) and octet_length(email) = char_length(email).
- Preserve users_user_name_ci_unique: UNIQUE INDEX ON users(lower(user_name)) WHERE user_name IS NOT NULL. user_name is nullable.
- enabled defaults to FALSE; failed_login_attempts defaults to 0. reset_code_failed_attempts defaults to 0 and must be BETWEEN 0 AND 5.
- password_hash may be NULL before invitation acceptance. Do not expose password hashes, reset hashes, or tokens in response DTOs.
- Phone numbers are not unique. Preserve the existing login, lockout, reset, registration, invitation, and token flows.

### 4.2. `email_action_tokens`

Existing account action tokens for email verification, password reset, and invitation acceptance.

Implementation status: existing; preserve supplied schema and current behavior.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `user_id` | `UUID` | No | FK users.id; ON DELETE CASCADE | Linked account or event actor/recipient |
| `purpose` | `VARCHAR(30)` | No | CHECK | Token action purpose |
| `token_hash` | `VARCHAR(64)` | No | UNIQUE | Stored action-token hash |
| `expires_at` | `TIMESTAMPTZ` | No | - | Token expiry |
| `consumed_at` | `TIMESTAMPTZ` | Yes | - | Token consumption time |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Rules and relationships**

- The field names, types, nullability, purpose values, and indexes in this section match the SQL supplied by the project owner.
- purpose must be VERIFY_EMAIL, RESET_PASSWORD, or ACCEPT_INVITATION. The foreign key to users has ON DELETE CASCADE.
- Preserve indexes email_action_tokens_user_purpose_idx ON (user_id, purpose) and email_action_tokens_expires_at_idx ON (expires_at).
- Preserve the existing token generation, hashing, expiry, and consumption implementation. Consume valid tokens atomically and prevent reuse.
- The presence of RESET_PASSWORD in the database CHECK does not mean the current password-reset implementation uses this table for every step. Preserve the existing reset_code fields and service flow.
- Do not add issued_access_tokens or persist JWT access tokens.

### 4.3. `patients`

Laboratory patient profiles. A profile may exist without a login account.

Implementation status: implemented in V3; phase-2 self-profile creation and verified linking use the same schema and sequence. V1-V3 remain unchanged.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `patient_number` | `VARCHAR(30)` | No | UNIQUE | Server-generated patient file number |
| `user_id` | `UUID` | Yes | UNIQUE; FK users.id | Optional patient login account |
| `full_name` | `VARCHAR(120)` | No | - | Full name |
| `date_of_birth` | `DATE` | No | - | Patient birth date |
| `gender` | `VARCHAR(10)` | No | CHECK | Sex category used for reference matching |
| `phone_number` | `VARCHAR(20)` | No | - | Contact phone number |
| `address` | `TEXT` | Yes | - | Optional address |
| `created_by` | `UUID` | No | FK users.id | Authenticated creator |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Last modification time |

**Rules and relationships**

- patient_number is generated by the server using a PostgreSQL sequence or another concurrency-safe mechanism; never use MAX+1.
- user_id is nullable and UNIQUE: a profile has at most one account, and an account links to at most one profile. A linked account must have role PATIENT.
- Name, date of birth, gender, and phone number are required. Address is optional. No national identity number or blood_type is included.
- gender values: MALE, FEMALE, UNKNOWN. Reject future birth dates in the service. Do not infer sex-specific reference ranges for UNKNOWN.
- Phone numbers may repeat; a child may use a guardian phone number. Do not automatically link profiles based only on name or phone.
- created_by comes from the authenticated actor: staff for a walk-in profile, or the PATIENT account for self-profile creation. Linking preserves the original creator.
- Patient profile fields are the laboratory record; account fields are login/account data. Profile creation, linking, and staff updates never synchronize demographics into users. Profile updates remain ADMIN/RECEPTIONIST only.
- Staff creates unlinked profiles. A verified, eligible PATIENT can create one profile for their own authenticated account or claim an existing unlinked profile using a staff-issued linking token. Neither path matches or merges by name, phone, or patient number.
- Self-create and claim transactions lock the current account row before checking its link. Claims then lock the target profile and token. Staff profile updates also lock the profile to preserve concurrent links. The unique patients.user_id constraint remains the database backstop. Profiles are never reassigned.

### 4.3a. `patient_link_tokens`

Implementation status: implemented by `V5__patient_link_tokens.sql`; separate from authentication/email tokens. Its SQL is byte-identical to the original linking V4. The legacy development V4 history is not modified by this source rename; use the separately reviewed recovery runbook. V4__lab_tests.sql remains unchanged.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Server-generated record identifier |
| `token_hash` | `VARCHAR(64)` | No | UNIQUE; lowercase SHA-256 hex CHECK | Hash only; never raw token |
| `patient_id` | `UUID` | No | FK patients.id; NO ACTION | Target laboratory profile |
| `issued_by` | `UUID` | No | FK users.id; NO ACTION | Authenticated issuing ADMIN/RECEPTIONIST |
| `expires_at` | `TIMESTAMPTZ` | No | - | Exclusive expiry, ten minutes after issue |
| `consumed_at` | `TIMESTAMPTZ` | Yes | - | Successful linking consumption time |
| `revoked_at` | `TIMESTAMPTZ` | Yes | - | Revocation on reissue |

- Generate 32 cryptographically random bytes and encode as 43 URL-safe unpadded Base64 characters using existing VerificationTokens; persist only SHA-256. The raw value is returned once in a non-cacheable issuance response.
- A partial unique index on patient_id WHERE consumed_at IS NULL AND revoked_at IS NULL allows one outstanding token per profile, including an expired token. Issuance locks the profile, revokes any outstanding token (including expired ones), then inserts its replacement in one transaction.
- A CHECK disallows simultaneous consumed_at/revoked_at states. Issuer and expiry indexes support FK access and expiry queries. No cascading deletion is introduced.
- Claim lock order is account -> profile -> token. The initial hash lookup retrieves only a profile ID; validity is rechecked after locking. Expiry is checked against application time after lock acquisition; expires_at equal to now is invalid. Consumption and the profile's user_id assignment commit or roll back together.
- Invalid, expired, revoked, or reused tokens share one sanitized response. Conflicting links do not consume a still-valid token. Successful linking creates no profile and preserves its number, original creator, creation time, and demographics.
- QR/link content must contain only the opaque capability, with no patient data. Transfer it through a trusted staff-to-patient handoff; a patient number alone is never proof. Do not log raw tokens, serialize them into audit details, or put them in URL query strings or server access logs. DTO string representations redact token values.
- Eligibility reuses current account login eligibility (enabled, verified email, password present, accepted invitation where applicable) and requires the current database role PATIENT. Authentication/JWT/cookie/CSRF behavior is unchanged.

### 4.4. `lab_tests`

Orderable laboratory tests, their current prices, and preparation instructions.

Implementation status: implemented in main's unchanged V4__lab_tests.sql. The currency entity field explicitly uses JDBC CHAR to match its existing CHAR(3) column during Hibernate validation.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `code` | `VARCHAR(30)` | No | UNIQUE | Catalog code |
| `name` | `VARCHAR(150)` | No | - | Display name |
| `description` | `TEXT` | Yes | - | Description |
| `price` | `NUMERIC(12,2)` | No | CHECK >= 0 | Current test price |
| `currency` | `CHAR(3)` | No | DEFAULT ILS | Currency code |
| `sample_type` | `VARCHAR(40)` | No | - | Sample type |
| `preparation_instructions` | `TEXT` | Yes | - | Patient preparation instructions |
| `active` | `BOOLEAN` | No | DEFAULT TRUE | Availability state |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Last modification time |

**Rules and relationships**

- code is unique and normalized consistently. A simple test has one parameter; a panel has multiple parameters.
- price must be >= 0. Use NUMERIC(12,2) and Java BigDecimal for money. Initial currency is ILS. [S2]
- sample_type is the default sample description; multiple required specimen types are handled by laboratory workflow in the initial scope.
- Deactivate a test instead of deleting one referenced by historical orders. Current price changes affect new orders only.

### 4.5. `test_parameters`

Individual measurements within a test, such as WBC or HGB within CBC.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `lab_test_id` | `UUID` | No | FK lab_tests.id | Parent or selected catalog test |
| `code` | `VARCHAR(30)` | No | UNIQUE with lab_test_id | Catalog code |
| `name` | `VARCHAR(150)` | No | - | Display name |
| `result_type` | `VARCHAR(10)` | No | CHECK | NUMERIC or TEXT |
| `unit` | `VARCHAR(40)` | Yes | - | Measurement unit |
| `method` | `VARCHAR(100)` | Yes | - | Measurement or payment method |
| `display_order` | `INTEGER` | No | CHECK >= 0 | Display sequence |
| `is_required` | `BOOLEAN` | No | DEFAULT TRUE | Required for result validation |
| `active` | `BOOLEAN` | No | DEFAULT TRUE | Availability state |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Last modification time |

**Rules and relationships**

- UNIQUE(lab_test_id, code). result_type is NUMERIC or TEXT. display_order must be >= 0.
- is_required and active default to TRUE. Do not share one parameter row across different parent tests in the initial scope.
- Use one unit and one method per parameter. Once used, a change that alters its meaning requires a new parameter and deactivation of the old one.
- Historical result snapshots preserve the old display name, code, unit, method, value type, and ordering.

### 4.6. `reference_ranges`

Approved numeric or textual reference ranges by parameter, age, sex, and validity period.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `parameter_id` | `UUID` | No | FK test_parameters.id | Measurement parameter |
| `gender` | `VARCHAR(10)` | No | CHECK | Sex category used for reference matching |
| `min_age_days` | `INTEGER` | Yes | CHECK >= 0 | Inclusive minimum age in days |
| `max_age_days` | `INTEGER` | Yes | CHECK max > min when both set | Exclusive maximum age in days |
| `normal_min` | `NUMERIC` | Yes | - | Numeric lower reference limit |
| `normal_max` | `NUMERIC` | Yes | - | Numeric upper reference limit |
| `normal_text` | `TEXT` | Yes | - | Text reference value |
| `valid_from` | `TIMESTAMPTZ` | No | - | Inclusive validity start |
| `valid_to` | `TIMESTAMPTZ` | Yes | CHECK > valid_from | Exclusive validity end |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Rules and relationships**

- gender values: MALE, FEMALE, ANY. Ages are expressed in days.
- Age and validity intervals use inclusive lower and exclusive upper bounds: [min_age_days, max_age_days) and [valid_from, valid_to). NULL means unbounded.
- Age bounds must be nonnegative; if both are set, max_age_days > min_age_days. If valid_to is set, it must be > valid_from.
- Numeric references require at least one numeric bound and no normal_text. Text references require normal_text and no numeric bounds. Validate the parameter type in the service.
- If both numeric bounds are provided, normal_min <= normal_max.
- Prevent overlapping age/validity intervals for the same parameter and gender. Lock the parent parameter while checking and writing reference ranges so concurrent writers cannot introduce an overlap.
- Prefer the matching gender range over ANY. Select the applicable reference using specimen collection/measurement time and age at that time, rather than the patient current age.
- For a multi-sample measurement use the explicitly recorded measured_at as the relevant measurement time. Preserve the selected reference in result snapshots.
- Do not delete a used reference or rewrite it retroactively. Close its validity period and create a new record.
- If no applicable reference exists, use NOT_EVALUATED. The laboratory supplies approved reference values; this document does not supply clinical limits. [S4]

### 4.7. `test_orders`

The main laboratory order belonging to a patient.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `order_number` | `VARCHAR(30)` | No | UNIQUE | Server-generated visible order number |
| `patient_id` | `UUID` | No | FK patients.id | Patient profile |
| `created_by` | `UUID` | No | FK users.id | Authenticated creator |
| `source` | `VARCHAR(10)` | No | CHECK | ONLINE or WALK_IN |
| `status` | `VARCHAR(20)` | No | DEFAULT NEW | Business workflow state |
| `currency` | `CHAR(3)` | No | DEFAULT ILS | Currency code |
| `notes` | `TEXT` | Yes | - | Optional notes |
| `cancelled_at` | `TIMESTAMPTZ` | Yes | - | Cancellation time |
| `cancellation_reason` | `TEXT` | Yes | - | Cancellation reason |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Last modification time |

**Rules and relationships**

- source values: ONLINE, WALK_IN. status values: NEW, IN_PROGRESS, COMPLETED, CANCELLED. Initial status is NEW and currency is ILS.
- Create the order and its initial items in one transaction. A non-cancelled order must contain at least one non-cancelled item.
- PATIENT may create an order only for their own linked profile; staff may act for a patient. The server selects catalog prices and identifies created_by.
- Total due is computed from non-cancelled item prices. Net paid is computed from confirmed payments minus confirmed refunds. Do not maintain a competing mutable total.
- Freeze ordinary item/price editing after collection of payment or start of laboratory processing. Cancellations require payment/refund reconciliation.
- COMPLETED means every non-cancelled item has a current published result. Cancellation records its timestamp and reason.

### 4.8. `order_items`

The individual tests selected within an order, including historical name and price snapshots.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `order_id` | `UUID` | No | FK test_orders.id | Parent laboratory order |
| `lab_test_id` | `UUID` | No | FK lab_tests.id | Parent or selected catalog test |
| `test_code_snapshot` | `VARCHAR(30)` | No | - | Test code at order creation |
| `test_name_snapshot` | `VARCHAR(150)` | No | - | Test name at order creation |
| `price_at_order` | `NUMERIC(12,2)` | No | CHECK >= 0 | Historical test price |
| `status` | `VARCHAR(20)` | No | DEFAULT NEW | Business workflow state |
| `cancelled_at` | `TIMESTAMPTZ` | Yes | - | Cancellation time |
| `cancellation_reason` | `TEXT` | Yes | - | Cancellation reason |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Last modification time |

**Rules and relationships**

- UNIQUE(order_id, lab_test_id). One test appears once per order in the initial scope; a later repeat is a new order.
- status values: NEW, IN_PROGRESS, COMPLETED, CANCELLED. Initial status is NEW; price_at_order must be >= 0.
- The server copies catalog code, name, and price at order creation. Catalog changes must not rewrite historical snapshots.
- Items referenced by a payment, sample, or result are retained rather than physically deleted. When cancellation is allowed, record its time and reason.

### 4.9. `appointment_slots`

Available booking periods and the maximum number of appointments for each period.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `starts_at` | `TIMESTAMPTZ` | No | UNIQUE | Booking period start |
| `ends_at` | `TIMESTAMPTZ` | No | CHECK > starts_at | Booking period end |
| `capacity` | `INTEGER` | No | CHECK > 0 | Maximum active bookings |
| `active` | `BOOLEAN` | No | DEFAULT TRUE | Availability state |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Last modification time |

**Rules and relationships**

- ends_at > starts_at and capacity > 0. active defaults to TRUE.
- This scope uses one laboratory booking schedule with non-overlapping periods. An EXCLUDE constraint on tstzrange(starts_at, ends_at, '[)') can enforce non-overlap. [S1]
- Booking locks the slot row with SELECT FOR UPDATE, counts capacity-consuming appointments, and inserts the appointment in the same transaction. BOOKED and CHECKED_IN consume capacity. [S3]
- Do not reduce capacity below existing active bookings. Do not change the times of a booked slot; explicitly reschedule to a new slot.
- Walk-in orders do not automatically consume a booking slot.

### 4.10. `appointments`

An optional appointment for a laboratory order.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `order_id` | `UUID` | No | UNIQUE; FK test_orders.id | Parent laboratory order |
| `slot_id` | `UUID` | No | FK appointment_slots.id | Selected booking period |
| `status` | `VARCHAR(20)` | No | DEFAULT BOOKED | Business workflow state |
| `created_by` | `UUID` | No | FK users.id | Authenticated creator |
| `checked_in_at` | `TIMESTAMPTZ` | Yes | - | Arrival time |
| `cancelled_at` | `TIMESTAMPTZ` | Yes | - | Cancellation time |
| `cancellation_reason` | `TEXT` | Yes | - | Cancellation reason |
| `notes` | `TEXT` | Yes | - | Optional notes |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Last modification time |

**Rules and relationships**

- order_id is UNIQUE: an order has zero or one appointment. Do not duplicate patient_id or scheduled_at; obtain them from the order and slot.
- status values: BOOKED, CHECKED_IN, COMPLETED, CANCELLED, NO_SHOW. Initial status is BOOKED.
- Check-in records checked_in_at. Cancellation records cancelled_at and a reason.
- Reschedule by locking the old and new slots in a stable order, checking capacity, and updating slot_id; record the change in audit_logs.
- Cancelling an appointment does not implicitly cancel the order. Cancelling an order cancels its active appointment in the same transaction.

### 4.11. `payments`

Payment and refund records. This design does not integrate a payment gateway.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `order_id` | `UUID` | No | FK test_orders.id | Parent laboratory order |
| `amount` | `NUMERIC(12,2)` | No | CHECK > 0 | Positive transaction amount |
| `currency` | `CHAR(3)` | No | DEFAULT ILS | Currency code |
| `type` | `VARCHAR(10)` | No | CHECK | Payment/refund or notification type |
| `method` | `VARCHAR(20)` | No | CHECK | Measurement or payment method |
| `status` | `VARCHAR(15)` | No | DEFAULT PENDING | Business workflow state |
| `original_payment_id` | `UUID` | Yes | FK payments.id | Original payment for a refund |
| `recorded_by` | `UUID` | No | FK users.id | Transaction recorder |
| `confirmed_by` | `UUID` | Yes | FK users.id | Transaction confirmer |
| `external_reference` | `VARCHAR(100)` | Yes | - | External transaction reference |
| `idempotency_key` | `VARCHAR(100)` | No | UNIQUE | Unique retry key |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `confirmed_at` | `TIMESTAMPTZ` | Yes | - | Confirmation time |

**Rules and relationships**

- amount > 0. type is PAYMENT or REFUND. method is CASH or EXTERNAL. status is PENDING, CONFIRMED, FAILED, or CANCELLED.
- Currency must match the order; initial currency is ILS. This is manual recording or an external reference, not card storage or gateway integration.
- PAYMENT requires original_payment_id = NULL. REFUND requires a confirmed original PAYMENT from the same order and currency.
- Lock the order and relevant original payment when validating amounts. Prevent overpayment and excessive refunds, including pending reservations that could later be confirmed.
- idempotency_key is required and UNIQUE. Retrying an identical operation returns the existing record; reusing the key with different data returns a conflict.
- CONFIRMED records confirmed_by and confirmed_at. Confirmed transactions are immutable; refunds are new records. Cash can be recorded and confirmed in one transaction.

### 4.12. `samples`

Physical samples collected for an order, including receipt, rejection, and replacement tracking.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `order_id` | `UUID` | No | FK test_orders.id | Parent laboratory order |
| `barcode` | `VARCHAR(50)` | No | UNIQUE | Unique sample identifier |
| `sample_type` | `VARCHAR(40)` | No | - | Sample type |
| `container_type` | `VARCHAR(60)` | Yes | - | Tube or container description |
| `status` | `VARCHAR(15)` | No | DEFAULT COLLECTED | Business workflow state |
| `collected_by` | `UUID` | No | FK users.id | Sample collector |
| `collected_at` | `TIMESTAMPTZ` | No | - | Collection time |
| `received_by` | `UUID` | Yes | FK users.id | Sample receiver |
| `received_at` | `TIMESTAMPTZ` | Yes | - | Receipt time |
| `rejected_by` | `UUID` | Yes | FK users.id | Sample rejection actor |
| `rejected_at` | `TIMESTAMPTZ` | Yes | - | Rejection time |
| `rejection_reason` | `TEXT` | Yes | - | Rejection explanation |
| `replaces_sample_id` | `UUID` | Yes | FK samples.id | Previous replaced sample |
| `notes` | `TEXT` | Yes | - | Optional notes |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Last modification time |

**Rules and relationships**

- barcode is server-generated and unique. status is COLLECTED, RECEIVED, or REJECTED.
- RECEIVED requires received_by and received_at. REJECTED requires rejected_by, rejected_at, and rejection_reason.
- Receipt and rejection times cannot precede collected_at. Validate physical sample/container suitability for the ordered tests.
- A replacement creates a new sample with replaces_sample_id pointing to the old one from the same order. Prevent self-reference and replacement cycles.
- Do not validate a new result using a rejected sample. Keep old samples and result history rather than overwriting them.

### 4.13. `sample_tests`

Many-to-many links between physical samples and ordered tests.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `sample_id` | `UUID` | No | FK samples.id | Physical sample |
| `order_item_id` | `UUID` | No | FK order_items.id | Ordered test item |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Rules and relationships**

- UNIQUE(sample_id, order_item_id). A sample can serve several items, and an item can use several samples.
- The sample and order item must belong to the same order. Enforce this in the service transaction or with a database trigger; a cross-table CHECK is not sufficient. [S1]
- Do not delete links referenced by result_samples. A replacement sample uses a new link.

### 4.14. `test_results`

Result versions for one ordered test, with validation, publication, and correction history.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `order_item_id` | `UUID` | No | FK order_items.id | Ordered test item |
| `status` | `VARCHAR(15)` | No | DEFAULT DRAFT | Business workflow state |
| `version_number` | `INTEGER` | No | CHECK > 0 | Result revision number |
| `previous_result_id` | `UUID` | Yes | UNIQUE; FK test_results.id | Previous published revision |
| `is_current` | `BOOLEAN` | No | DEFAULT FALSE | Current published revision marker |
| `entered_by` | `UUID` | No | FK users.id | Result author |
| `measured_at` | `TIMESTAMPTZ` | No | - | Relevant measurement time |
| `validated_by` | `UUID` | Yes | FK users.id | Result validator |
| `validated_at` | `TIMESTAMPTZ` | Yes | - | Validation time |
| `published_by` | `UUID` | Yes | FK users.id | Result publisher |
| `published_at` | `TIMESTAMPTZ` | Yes | - | Publication time |
| `correction_reason` | `TEXT` | Yes | - | Reason for correction |
| `patient_name_snapshot` | `VARCHAR(120)` | Yes | - | Patient name shown on report |
| `patient_number_snapshot` | `VARCHAR(30)` | Yes | - | Patient number shown on report |
| `birth_date_snapshot` | `DATE` | Yes | - | Birth date used for report |
| `gender_snapshot` | `VARCHAR(10)` | Yes | - | Sex category used for report |
| `explanation` | `TEXT` | Yes | - | Reviewed patient-facing explanation |
| `report_file_key` | `TEXT` | Yes | - | Private report storage reference |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Last modification time |

**Rules and relationships**

- status values: DRAFT, VALIDATED, PUBLISHED. version_number > 0. UNIQUE(order_item_id, version_number).
- Use a partial UNIQUE index ON (order_item_id) WHERE is_current, and another ON (order_item_id) WHERE status IN ('DRAFT', 'VALIDATED').
- Results belong to an order item rather than a single sample link. result_samples records all used sample links. This is a project design decision informed by HL7 report/specimen separation, not an HL7 SQL requirement. [S5]
- The first version has no previous_result_id. A correction references the latest published version for the same item, records a reason, and increments the version number.
- Lock the order item during version allocation and publication to prevent concurrent draft creation or branching corrections.
- Validation checks required parameters, eligible received samples, reference selection, and report snapshots. Record validated_by and validated_at.
- Editing a VALIDATED version returns it to DRAFT and clears its validation metadata. One technician may enter, validate, and publish under the current four-role scope.
- Publication requires validation. In one transaction, set the old published version is_current = FALSE and the new one TRUE. is_current implies status = PUBLISHED.
- Published values, samples, snapshots, and publication metadata must not be overwritten. Only the current-version marker changes when superseded.
- Patient name/number, birth date, and gender snapshots are required before publication. Validation/publication timestamps and actors are required for their respective states.
- Patients access only their own published results. Historical versions must be clearly marked as superseded. report_file_key references a private authorized download.

### 4.15. `result_samples`

The exact sample-to-test links used by each result version.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `result_id` | `UUID` | No | Composite PK; FK test_results.id | Result version |
| `sample_test_id` | `UUID` | No | Composite PK; FK sample_tests.id | Used sample-to-item link |

**Rules and relationships**

- PRIMARY KEY(result_id, sample_test_id). Each link must target the same order_item_id as the result.
- A validated or published laboratory result requires at least one suitable received sample in this project scope.
- Keep the exact sample links for each result version. Do not change published links when replacement samples are collected.

### 4.16. `result_values`

Individual measured values and historical parameter/reference snapshots within a result version.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `result_id` | `UUID` | No | FK test_results.id | Result version |
| `parameter_id` | `UUID` | No | FK test_parameters.id | Measurement parameter |
| `reference_range_id` | `UUID` | Yes | FK reference_ranges.id | Selected reference range |
| `numeric_value` | `NUMERIC` | Yes | - | Numeric measurement |
| `numeric_comparator` | `VARCHAR(2)` | Yes | CHECK | Optional numeric boundary operator |
| `text_value` | `TEXT` | Yes | - | Text measurement |
| `parameter_code_snapshot` | `VARCHAR(30)` | No | - | Historical parameter code |
| `parameter_name_snapshot` | `VARCHAR(150)` | No | - | Historical parameter name |
| `result_type_snapshot` | `VARCHAR(10)` | No | CHECK | Historical value type |
| `unit_snapshot` | `VARCHAR(40)` | Yes | - | Historical measurement unit |
| `method_snapshot` | `VARCHAR(100)` | Yes | - | Historical measurement method |
| `display_order_snapshot` | `INTEGER` | No | CHECK >= 0 | Historical display sequence |
| `is_required_snapshot` | `BOOLEAN` | No | - | Whether this parameter was required for this result version |
| `normal_min_snapshot` | `NUMERIC` | Yes | - | Historical lower reference limit |
| `normal_max_snapshot` | `NUMERIC` | Yes | - | Historical upper reference limit |
| `normal_text_snapshot` | `TEXT` | Yes | - | Historical text reference |
| `flag` | `VARCHAR(20)` | No | DEFAULT NOT_EVALUATED | Result interpretation flag |
| `notes` | `TEXT` | Yes | - | Optional notes |

**Rules and relationships**

- UNIQUE(result_id, parameter_id). The parameter must belong to the catalog test selected in the order item.
- A DRAFT may contain an unfilled parameter row with both numeric_value and text_value NULL. At most one value may be set. When a value is supplied, NUMERIC allows only numeric_value and TEXT allows only a nonblank text_value. numeric_comparator requires numeric_value. Use result_type_snapshot to validate the stored value type.
- When validating or publishing, every row with is_required_snapshot = TRUE must contain a value of the correct type. Optional unfilled rows may remain NULL and are displayed as not reported; they are never interpreted as zero or normal.
- numeric_comparator is NULL for an exact number, or <, <=, >, >= for a bounded result. Do not store <5 as an exact measurement of 5.
- For an uncertain comparison use NOT_EVALUATED rather than guessing. Reject non-finite numeric inputs.
- reference_range_id, when present, must belong to parameter_id. Copy name, code, value type, unit, method, display order, and reference limits into snapshots.
- flag values: NORMAL, HIGH, LOW, ABNORMAL, NOT_EVALUATED. Do not invent critical thresholds or automatic textual interpretations without approved rules.
- Create one result_values row for every active parameter when creating the first draft, copying the catalog definition and is_required into is_required_snapshot. Initial measurement fields and reference fields may remain NULL. This persists the expected parameter set instead of depending on a later catalog query.
- A correction copies the previous published parameter rows and their required/type/unit/method snapshots; it does not silently adopt a changed catalog definition. Recalculate reference selection only when the relevant measurement context changes, and preserve the superseded published version.
- Do not silently add or remove parameter rows from an existing draft when the catalog changes. Explicit reconciliation, if needed, must occur before validation and be audited.
- Published values and their snapshots are immutable; correction creates values in a new result version. [S4]

### 4.17. `notifications`

User notifications and delivery/retry state.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `user_id` | `UUID` | No | FK users.id | Linked account or event actor/recipient |
| `result_id` | `UUID` | Yes | FK test_results.id | Result version |
| `type` | `VARCHAR(30)` | No | - | Payment/refund or notification type |
| `message` | `TEXT` | No | - | General notification message |
| `channel` | `VARCHAR(10)` | No | CHECK | IN_APP or EMAIL |
| `delivery_status` | `VARCHAR(10)` | No | DEFAULT PENDING | Delivery workflow state |
| `deduplication_key` | `VARCHAR(160)` | No | UNIQUE | Unique notification event key |
| `attempt_count` | `INTEGER` | No | DEFAULT 0 | Delivery attempt count |
| `next_attempt_at` | `TIMESTAMPTZ` | Yes | - | Next scheduled retry |
| `last_error` | `TEXT` | Yes | - | Sanitized delivery error |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `sent_at` | `TIMESTAMPTZ` | Yes | - | Delivery time |
| `read_at` | `TIMESTAMPTZ` | Yes | - | In-app read time |

**Rules and relationships**

- channel values: IN_APP, EMAIL. delivery_status values: PENDING, SENT, FAILED. attempt_count starts at 0.
- Create notification rows transactionally with result publication; deliver email after commit and retry failures.
- deduplication_key prevents duplicate notification rows. Claim/update pending rows atomically so workers do not process the same row concurrently.
- This table is the initial delivery queue; no additional outbox table is required. SMTP can still duplicate delivery after a crash between sending and saving status; this is not an exactly-once guarantee.
- Only the recipient may read or mark their in-app notifications. Unlinked patients receive manual phone communication in the initial scope.
- Keep email messages general, such as result-ready notifications, without sensitive result details. last_error must be sanitized.

### 4.18. `audit_logs`

Append-only records of important business actions.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `user_id` | `UUID` | Yes | FK users.id | Linked account or event actor/recipient |
| `action` | `VARCHAR(60)` | No | - | Audit event code |
| `entity_type` | `VARCHAR(50)` | No | - | Affected entity type |
| `entity_id` | `UUID` | Yes | - | Affected entity identifier |
| `request_id` | `VARCHAR(100)` | Yes | - | Request correlation identifier |
| `details` | `JSONB` | No | DEFAULT {} | Minimal structured event details |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Rules and relationships**

- user_id is nullable for system actions. entity_type and entity_id identify a business record logically; entity_id is not a foreign key to every table.
- details defaults to an empty JSON object. Record profile creation/linking, orders, payments, sample events, validation, publication, corrections, and rescheduling.
- Use append-only access; revoke ordinary UPDATE and DELETE rights on this table from the application database role.
- Never record passwords, JWTs, email tokens, database connection secrets, or unnecessary health data. [S6]
- Index (entity_type, entity_id, created_at), (user_id, created_at), and (action, created_at).

### 4.19. `symptom_assessments`

Patient symptom-analysis sessions for the later test-suggestion feature.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `patient_id` | `UUID` | No | FK patients.id | Patient profile |
| `created_by` | `UUID` | No | FK users.id | Authenticated creator |
| `symptoms_text` | `TEXT` | No | - | Patient-entered symptoms |
| `status` | `VARCHAR(15)` | No | DEFAULT PENDING | Business workflow state |
| `explanation` | `TEXT` | Yes | - | Reviewed patient-facing explanation |
| `engine_version` | `VARCHAR(100)` | No | - | Rules/model version |
| `error_code` | `VARCHAR(50)` | Yes | - | Sanitized processing error |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `completed_at` | `TIMESTAMPTZ` | Yes | - | Processing completion time |

**Rules and relationships**

- status values: PENDING, COMPLETED, FAILED. completed_at records completion of processing; error_code is sanitized.
- Access is restricted to the patient owner and explicitly authorized staff. created_by is the authenticated actor.
- Persist a successful assessment and its suggested tests atomically. Suggestions do not create orders automatically or constitute diagnosis.
- Implement in the later AI phase. These tables cover symptom-based test suggestions, not every possible AI analysis of laboratory results.

### 4.20. `suggested_tests`

Laboratory tests suggested by a symptom assessment.

Implementation status: target schema; implement incrementally.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Record identifier |
| `assessment_id` | `UUID` | No | FK symptom_assessments.id | Parent symptom assessment |
| `lab_test_id` | `UUID` | No | FK lab_tests.id | Parent or selected catalog test |
| `reason` | `TEXT` | No | - | Reason for suggesting the test |
| `display_order` | `INTEGER` | No | CHECK >= 0 | Display sequence |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time |

**Rules and relationships**

- UNIQUE(assessment_id, lab_test_id). display_order must be >= 0.
- Suggestions are created internally by the assessment process, not through a public arbitrary-create API.
- Create an order only from explicitly selected and confirmed suggestions; recheck catalog availability, current prices, and ownership.
- Do not store a confidence percentage without a defined and validated meaning.

## 5. Relationship summary

| Parent | Child / link | Cardinality or rule |
|---|---|---|
| users | email_action_tokens | One account to many action tokens |
| users | patients | Optional one-to-one; unlinked patient profiles allowed |
| patients | patient_link_tokens | Multiple historical tokens; at most one outstanding token per profile |
| users | patient_link_tokens | Authenticated staff issuer; retained non-cascading reference |
| patients | test_orders | One patient to many orders |
| lab_tests | test_parameters | One test to one or more parameters |
| test_parameters | reference_ranges | One parameter to multiple demographic/time ranges |
| test_orders | order_items | One order to one or more test items |
| lab_tests | order_items | One catalog test referenced by many ordered items |
| test_orders | appointments | Zero or one appointment per order |
| appointment_slots | appointments | Many appointments up to capacity |
| test_orders | payments | Multiple payments/refunds |
| payments | payments | Refund points to original payment |
| test_orders | samples | Multiple physical samples |
| samples / order_items | sample_tests | Many-to-many association |
| order_items | test_results | Multiple result versions |
| test_results / sample_tests | result_samples | Used specimens per result version |
| test_results | result_values | Multiple parameter measurements |
| test_parameters | result_values | Parameter referenced by many measurements |
| reference_ranges | result_values | Optional selected reference per measurement |
| users | notifications | Multiple notifications per recipient |
| users | audit_logs | Multiple events; system actor may be NULL |
| patients | symptom_assessments | Multiple assessment sessions |
| symptom_assessments | suggested_tests | Multiple suggestions |
| lab_tests | suggested_tests | Catalog test referenced by many suggestions |

Staff actor fields also reference users as specified in each table.

## 6. Required indexes and integrity controls

Preserve the existing authentication indexes. Add indexes for frequently queried FK columns unless already covered by a suitable PK/UNIQUE index.

Additional recommended indexes:

- `test_orders(patient_id, created_at)` and `test_orders(created_by)`.
- `order_items(order_id, lab_test_id)` UNIQUE.
- `test_parameters(lab_test_id, code)` UNIQUE.
- `reference_ranges(parameter_id, gender, valid_from)`.
- `appointments(order_id)` UNIQUE and `appointments(slot_id, status)`.
- `payments(order_id, status)` and `payments(original_payment_id)`.
- `samples(order_id)` and `samples(replaces_sample_id)`.
- `sample_tests(sample_id, order_item_id)` UNIQUE and `sample_tests(order_item_id)`.
- `test_results(order_item_id, version_number)` UNIQUE.
- Partial UNIQUE indexes on `test_results(order_item_id)` for current publication and outstanding draft/validation, as described above.
- `result_samples(result_id, sample_test_id)` PK and `result_samples(sample_test_id)`.
- `result_values(result_id, parameter_id)` UNIQUE and `result_values(parameter_id)`.
- `notifications(user_id, read_at)` and `notifications(delivery_status, next_attempt_at)`.
- Audit indexes listed in the audit table section.
- `suggested_tests(assessment_id, lab_test_id)` UNIQUE and `suggested_tests(lab_test_id)`.

Concurrency controls must cover every write path:

1. Lock slot rows before capacity checks and appointment writes.
2. Lock order/payment rows before payment or refund amount checks.
3. Lock ordered test items before allocating result revisions or publishing.
4. Lock parameters before reference-range overlap checks and writes.
5. Use stable lock ordering when a transaction touches several records.

## 7. Authorization and lifecycle rules

- Enforce both role and record ownership on the backend.
- Do not expose JPA entities directly; use DTOs.
- Derive created_by, entered_by, collected_by, validated_by, and other actor fields from authenticated context, not untrusted request fields.
- A patient may access only their own linked profile, orders, appointments, and published results.
- Receptionist/admin manage patient profiles, orders, appointments, and recorded payments.
- Technician/admin manage laboratory samples and results; technician access to patient information must serve laboratory work.
- Admin manages catalog tests, parameters, reference ranges, booking slots, and audit access.
- Preserve the existing CORS, CSRF, JWT, and cookie-security configuration.
- Deactivate catalogs and cancel orders/items instead of deleting referenced history.
- Profile linking must not be automated using names or phone numbers alone. Phase 2 implements the controlled authenticated/verified token workflow described in section 4.3a and PATIENTS_API.md section 15.

## 8. End-to-end example

The short IDs below illustrate relationships; actual identifiers are UUIDs. No medical reference values or prices are specified.

1. Account U1 has role PATIENT. Patient profile P1 links to U1. A walk-in profile could instead have user_id = NULL.
2. Catalog test T1 is CBC. Parameters C1 = WBC and C2 = HGB both reference T1. Reference R1 belongs to C2.
3. Order O1 belongs to P1. Item I1 belongs to O1 and references T1, with historical code/name/price snapshots.
4. Optional appointment A1 links O1 to slot SL1. A walk-in order needs no appointment row.
5. Payment PAY1 records the order payment and confirmation.
6. Sample S1 belongs to O1. Link ST1 connects S1 to I1. If needed, sample S2 and link ST2 serve the same item.
7. Result RES1 belongs to I1, version 1, initially DRAFT. result_samples links RES1 to ST1 and ST2 if both were used.
8. result_values records the measurements for C1 and C2, their selected references, and historical snapshots.
9. A technician validates RES1, then publishes it; is_current becomes TRUE. Notifications and audit events are recorded.
10. A correction creates RES2 for I1, referencing RES1 through previous_result_id. RES1 stays published history, and RES2 becomes current only when published.

## 9. Incremental implementation plan

1. Preserve and verify existing authentication entities/migrations.
2. Implement patient management: migration, entity, repository, DTOs, service, controller, validation, and authorization tests.
3. Implemented patient self-profile creation and controlled account/profile linking in phase 2. Concurrent operations cannot give an account a second profile; matching/merging by demographics remains out of scope.
4. Implement laboratory catalog, parameters, and reference ranges.
5. Implement orders and items.
6. Implement booking slots and appointments.
7. Implement payment/refund recording.
8. Implement samples and sample-to-item links.
9. Implement results, used-sample links, values, validation, publication, and corrections.
10. Implement notifications and append-only auditing, adding audit calls to earlier modules as needed.
11. Implement dashboards and reports using queries/views over these tables; no independent dashboard table is needed.
12. Implement symptom assessments and suggested tests in the AI phase.

Use the next available Flyway migration version for each change. Never rewrite an applied migration, delete migration history, or reset a team database as a shortcut.

### First implementation task: patient management

Implement only the patients module first:

| Method | Endpoint | Access / behavior |
|---|---|---|
| POST | /api/patients | ADMIN, RECEPTIONIST; create an unlinked profile |
| GET | /api/patients | ADMIN, RECEPTIONIST, LAB_TECHNICIAN; paginated name/file-number/phone search |
| GET | /api/patients/{id} | Authorized staff; PATIENT only for their linked profile |
| PUT | /api/patients/{id} | ADMIN, RECEPTIONIST; update approved profile fields |

Do not add a delete endpoint. Do not accept patient_number, user_id, created_by, or audit timestamps in the generic create/update DTOs. Keep patient self-registration/linking changes out of this first task.

## 10. Official technical references

The sources support design principles; table names, lengths, and the 21-table structure are project decisions. This document does not claim FHIR or ISO certification.

- [S1] PostgreSQL 16 - Constraints: https://www.postgresql.org/docs/16/ddl-constraints.html
- [S2] PostgreSQL 16 - Numeric Types: https://www.postgresql.org/docs/16/datatype-numeric.html
- [S3] PostgreSQL 16 - Explicit Locking: https://www.postgresql.org/docs/16/explicit-locking.html
- [S4] HL7 FHIR R4 - Observation: https://www.hl7.org/fhir/R4/observation.html
- [S5] HL7 FHIR R4 - DiagnosticReport definitions: https://www.hl7.org/fhir/R4/diagnosticreport-definitions.html
- [S6] OWASP - Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

The laboratory must provide the approved catalog, reference values, sample/container requirements, methods, and result interpretation policies before clinical use.
