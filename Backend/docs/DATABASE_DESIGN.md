# Smart-LIMS Database Design

Status: implemented-schema inventory plus carried-forward design for unimplemented features.
Stage 2 Task 11 verification update: 2026-10-28; [one complete isolated-suite invocation](TESTING.md#task-11-full-stage-verification-2026-10-28) passes 236 tests across 27 suites with zero failures/errors/skips. Task 11 and Stage 2 are DONE. The owner's 2026-10-29 clarification treats committing as a separate handoff, not an acceptance criterion; no tests were rerun for this correction. No source/schema/test changes, Postman use, commit/push, production migration or deployment in Task 11. Earlier per-task notes below describe their own verification boundaries.
Updated: 2026-10-27 (documentation-only SDLC review).
Stage 2 Task 7 persistence update: 2026-10-28; V7 adds order storage and JPA mappings. Focused isolated execution is recorded in [TESTING.md](TESTING.md#task-7-order-persistence-verification-2026-10-28); that evidence covers persistence only. Later creation evidence is recorded separately below; deployment remains unverified.
Stage 2 Task 8 creation update: 2026-10-28; the two POST creation endpoints implement the approved identity, admission, snapshot and durable retry transactions. [Creation verification](TESTING.md#task-8-order-creation-verification-2026-10-28) is separate from Task 7 evidence. Patient GETs, cancellation and deployment remain unverified; V1-V7 are unchanged.
Stage 2 Task 9 read update: 2026-10-28; patient-owned list/detail queries, unique-header pagination/counts and grouped per-page snapshot totals are implemented and [verified separately](TESTING.md#task-9-patient-order-read-verification-2026-10-28). No schema change; cancellation and deployment remain unverified.
Stage 2 Task 10 cancellation update: 2026-10-28; eligible role/ownership/state/reason checks, order-row locking, retained first metadata and unchanged historical items/value are implemented and [verified separately](TESTING.md#task-10-order-cancellation-verification-2026-10-28). V1-V7 remain unchanged. This focused evidence preceded Task 11's later full-suite result above; deployment remains unverified.
Stage 2 Task 6 design review: 2026-10-28; ORDERS_API.md and sections 4.7-4.8 reconcile order states, retry identity, snapshots and cancellation; no code, migration, test or database operation.
Task 2 source update: 2026-10-28; V6 adds category persistence/mapping only. Verification is recorded separately in [TESTING.md](TESTING.md#task-2-category-persistence-verification-2026-10-28); this does not establish development/production migration status or future category API behavior.
Requirements, decisions, task IDs and completion evidence: [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). The scope is confirmed; unimplemented column/state/workflow proposals still require the applicable decision and API contract before coding. This design is not evidence of deployed functionality.
Planned results allow unfilled draft measurements and preserve required-parameter snapshots per version; results are not implemented yet.
Migration integration: canonical source is V1-V7. Saved operator evidence records V1-V5 development reconciliation completed on 2026-10-26; earlier pending-reconciliation wording is obsolete for that recorded state. V6/V7 source/test execution is separate from that historical development evidence. See section 1.1 for evidence and limits.
Intended repository path: `Backend/docs/DATABASE_DESIGN.md`.

## 1. Scope and implementation status

This document inventories the current schema and preserves the proposed database target. Requirements and open decisions in the implementation plan govern new-feature contracts; proposed detail here must not silently settle those decisions.

- PostgreSQL 16; UUID identifiers; Spring Boot/JPA backend.
- One laboratory and one booking schedule.
- Roles: ADMIN, PATIENT, RECEPTIONIST, LAB_TECHNICIAN. No physician role.
- Patients may have a laboratory profile without a login account.
- No national identity number or blood type in the patient profile.
- Patient name, birth date, gender, and phone are required; address is optional; phone numbers are not unique.
- Initial monetary currency: ILS.
- Payments are recorded manually or by external transaction reference; no payment gateway is included in this baseline.
- The inventory lists 22 application tables: eight implemented in source migrations, twelve planned for the core workflow, and two deferred for AI. `flyway_schema_history`, `patient_number_seq`, and `order_number_seq` are technical objects, not additional application tables. V6/V7 verification uses only the isolated test cluster; development/production application is not established.
- `users`, `email_action_tokens`, `patients`, `lab_tests`, `patient_link_tokens`, `lab_test_categories`, `test_orders`, and `order_items` are implemented through V1-V7. Other application tables remain implementation targets.
- The supplied SQL also adds `users.reset_code_failed_attempts`; it is included here.
- Preserve existing authentication behavior. Do not recreate existing authentication tables or rewrite an applied migration.
- Symptom-based suggestions are scheduled for a later AI phase. Further AI result-analysis persistence is outside this baseline and requires a separate scope decision.

### 1.1. Implemented migrations and recorded reconciliation

| Migration | Implemented schema change | Requirements / task evidence |
|---|---|---|
| V1__auth_foundation.sql | users, email_action_tokens, account/token checks and indexes | R-AUTH-01/02; T-AUTH-01 |
| V2__password_reset_attempts.sql | users.reset_code_failed_attempts and range constraint | R-AUTH-02; T-AUTH-01 |
| V3__patients.sql | patients, patient_number_seq, retained account/creator FKs and indexes | R-PAT-01/02; T-PAT-01 |
| V4__lab_tests.sql | lab_tests, price/currency/code checks and indexes | R-CAT-01; T-CAT-00 |
| V5__patient_link_tokens.sql | patient_link_tokens, outstanding-token uniqueness and state/hash checks | R-PAT-02; T-PAT-01 |
| V6__lab_test_categories.sql | Empty category assignment table; composite PK, catalog FK, seven-value CHECK, reverse membership index | R-CAT-01/R-NFR-01; Stage 1 Task 2; isolated-test evidence in TESTING.md |
| V7__orders.sql | Order sequence, headers/items, retry uniqueness, snapshot/cancellation checks, retained FKs and lookup indexes | R-ORD-01/R-NFR-01; Stage 2 Task 7; isolated-test evidence in TESTING.md |

The private `Smart-LIMS-DB-Backups` directory retains `reconciliation-result-20261026-221059.json`, `flyway-before-20261026-221059.csv`, `flyway-after-20261026-221059.csv`, `validation-normal-20261026-221059.log`, and the backup archive. These are historical operator artifacts, inspected as files only in this review:

- The result records completion at **2026-10-26 22:16:15 +02:00**, verified backup restoration, unchanged full business rows, and successful normal-order validation for the development database.
- Before/after history shows legacy V4 linking reclassified as V5 with checksum **504398204** and original installed rank **4** preserved. Missing lab V4, checksum **-1646872382**, was then installed at rank **5**. All five recorded migrations succeeded.
- The normal-order log confirms five migrations validated and the schema up to date. This supports completed recovery for the recorded state; it does not establish today's database contents or any other environment's history. No database was connected to or changed during this documentation task.
- Do not repeat recovery on a database with canonical V4 lab/V5 linking history. The [runbook](PATIENT_LINKING_V5_RECONCILIATION.md) is retained only for the exact legacy preconditions and separately authorized use. Other environments remain an inventory decision (D-OPS).

Historical isolated-test evidence is separate: [TESTING.md](TESTING.md) records 141 tests across 17 suites passing on 2026-10-27, including six migration compatibility cases. No tests were run now. Table presence and those historical runs do not establish clinical or production acceptance for planned modules.

## 2. Naming and data conventions

- Table/column names use snake_case.
- `Nullable: No` means NOT NULL; primary keys are inherently NOT NULL.
- Every standalone `id` is UUID, generated following the existing application convention.
- `result_samples` and `lab_test_categories` use composite primary keys.
- All event timestamps use TIMESTAMPTZ. Display times using Asia/Jerusalem where appropriate.
- `created_at` defaults to CURRENT_TIMESTAMP. `updated_at` defaults to CURRENT_TIMESTAMP on insertion and must be updated by the application on subsequent writes; a DEFAULT alone does not maintain it.
- Money uses NUMERIC(12,2) and BigDecimal. Laboratory numeric values use NUMERIC; reject NaN and infinity at the input boundary.
- Generate patient numbers, order numbers, and sample barcodes with sequences or another concurrency-safe mechanism, never MAX+1.
- Initial flags: active and is_required default TRUE; is_current defaults FALSE. Counters default 0. Initial statuses are specified under each table.
- Treat free-text blank strings consistently; trim user input and reject blank required fields.
- Foreign keys use RESTRICT/NO ACTION for retained business history unless explicitly stated otherwise. The existing email token FK retains ON DELETE CASCADE.
- Foreign keys and CHECK constraints cannot alone enforce every cross-table rule below; implement the stated transaction/service validations or triggers.

## 3. Table inventory and proposed target

| # | Table | Status | Purpose |
|---|---|---|---|
| 1 | `users` | Implemented V1/V2 | System accounts and authentication state. Preserve the existing implementation. |
| 2 | `email_action_tokens` | Implemented V1 | Account verification/invitation tokens; RESET_PASSWORD is allowed by the schema but current recovery uses users fields. |
| 3 | `patients` | Implemented V3 | Laboratory patient profiles. A profile may exist without a login account. |
| 4 | `lab_tests` | Implemented V4 | Orderable laboratory tests, their current prices, and preparation instructions. |
| 5 | `test_parameters` | Planned; T-CAT-02/03 | Individual measurements within a test, such as WBC or HGB within CBC. |
| 6 | `reference_ranges` | Planned; T-REF-02/03 | Approved numeric or textual reference ranges by parameter, age, sex, and validity period. |
| 7 | `test_orders` | Implemented V7; Stage 2 Task 7 persistence only | The main laboratory order belonging to a patient. |
| 8 | `order_items` | Implemented V7; Stage 2 Task 7 persistence only | The individual tests selected within an order, including historical name and price snapshots. |
| 9 | `appointment_slots` | Planned; T-APT-02 | Available booking periods and the maximum number of appointments for each period. |
| 10 | `appointments` | Planned; T-APT-03/04 | An optional appointment for a laboratory order. |
| 11 | `payments` | Planned; T-PAY-02/03 | Payment and refund records. This design does not integrate a payment gateway. |
| 12 | `samples` | Planned; T-SMP-02/03 | Physical samples collected for an order, including receipt, rejection, and replacement tracking. |
| 13 | `sample_tests` | Planned; T-SMP-02 | Many-to-many links between physical samples and ordered tests. |
| 14 | `test_results` | Planned; T-RES-02 to T-RES-05 | Result versions for one ordered test, with validation, publication, and correction history. |
| 15 | `result_samples` | Planned; T-RES-02 | The exact sample-to-test links used by each result version. |
| 16 | `result_values` | Planned; T-RES-02/03 | Individual measured values and historical parameter/reference snapshots within a result version. |
| 17 | `notifications` | Planned; T-NTF-02/03 | User notifications and delivery/retry state. |
| 18 | `audit_logs` | Planned; T-AUD-02/03 | Append-only records of important business actions. |
| 19 | `symptom_assessments` | Deferred AI; T-AI-01 | Patient symptom-analysis sessions for the later test-suggestion feature. |
| 20 | `suggested_tests` | Deferred AI; T-AI-01 | Laboratory tests suggested by a symptom assessment. |
| 21 | `patient_link_tokens` | Implemented V5 | Short-lived, single-use capabilities for verified patient account/profile linking. |
| 22 | `lab_test_categories` | Implemented V6; Stage 1 Task 2 | Zero-to-many fixed category assignments per test; composite key prevents duplicate membership. Task 3 implements assignment/response arrays; Task 4 implements membership filtering and patient list availability. |

## 4. Table specifications

### 4.1. `users`

System accounts and authentication state. Preserve the existing implementation.

Implementation status: implemented in V1/V2; preserve the actual migrations and current account behavior. T-AUTH-01 records bounded verification, not deployment readiness.

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
- Public registration requires fullName, email, password, and matching confirmPassword. It stores user_name and phone_number as NULL using the existing schema; no placeholders are generated. confirmPassword is validation-only and is never persisted or logged. See [Registration contract](AUTH_API.md).
- users.full_name and patients.full_name are independent required values. Account/profile changes never automatically synchronize names. Patient-profile phone_number remains required.
- enabled defaults to FALSE; failed_login_attempts defaults to 0. reset_code_failed_attempts defaults to 0 and must be BETWEEN 0 AND 5.
- password_hash may be NULL before invitation acceptance. Do not expose password hashes, reset hashes, or tokens in response DTOs.
- Phone numbers are not unique. Preserve the existing login, lockout, reset, registration, invitation, and token flows.

### 4.2. `email_action_tokens`

Existing account action tokens for email verification and invitation acceptance. RESET_PASSWORD is allowed by the schema; current recovery uses the users reset-code fields.

Implementation status: implemented in V1; preserve the actual migration and current token behavior.

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

Implementation status: implemented by `V5__patient_link_tokens.sql`; separate from authentication/email tokens. Its SQL is byte-identical to the original linking V4. Source renumbering and later recorded development reconciliation are separate events; section 1.1 documents completed historical recovery. V4__lab_tests.sql remains unchanged.

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

- Implemented: code is trimmed/uppercased and constrained to the LAB_TESTS_API format; currency is ILS. ADMIN writes; staff lists include either state, while PATIENT lists are active-only and reject active=false with 403. Task 5 enforces PATIENT active-only detail access: inactive and missing records return the same 404; staff retain inactive details. PUT preserves availability; PATCH changes it. No delete endpoint exists.
- Planned R-CAT-02: a simple test has one parameter; a panel has multiple parameters. The current basic catalog does not enforce a parameter count because parameters are not implemented.
- price must be >= 0. Use NUMERIC(12,2) and Java BigDecimal for money. Initial currency is ILS. [S2]
- sample_type is the default sample description; multiple required specimen types are handled by laboratory workflow in the initial scope.
- Current catalog supports deactivation. V7 order items retain catalog references and code/name/price snapshots; Task 8 creation copies these under shared catalog locks.

### 4.4a. Stage 1 category design (Task 1)

Contract review: 2026-10-27; Task 2 persistence implementation: 2026-10-28. The V4 `lab_tests` table above remains unchanged. V6 adds `lab_test_categories`; V1-V5 remain byte-for-byte unchanged. The [Stage 1 catalog contract](LAB_TESTS_API.md#stage-1-task-1-patient-catalog-target-contract) remains the source for identifiers, implemented query/discovery rules, array examples, and permissions. This design extends R-CAT-01/R-NFR-01; Stage 1 Task 1 is separate from the older T-CAT-01 parameter task.

**Confirmed decisions:** the owner approved multiple categories per test (S1-CAT-D01), optional categories for existing/new tests, and active uncategorized tests remaining visible in "All" (S1-CAT-D02). Task 1 is DONE. Task 2 implements persistence; Task 3 adds administrative assignment and response arrays through that mapping. Task 4 adds category membership queries and patient list availability; Task 5 adds inactive-detail restrictions and final catalog verification. The plan distinguishes implementation/verification completion from its pending commit criterion.

#### `lab_test_categories` assignment table (V6)

The relationship is zero-to-many categories per test and zero-to-many tests per category. V6 uses one collection/association table with fixed string category identifiers; no scalar `lab_tests.category`, standalone category lookup table, or stored label. The absence of assignment rows represents an uncategorized test. This is inventory item 22.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `lab_test_id` | `UUID` | No | Composite PK; FK lab_tests.id; NO ACTION | Assigned catalog test |
| `category` | `VARCHAR(30)` | No | Composite PK; fixed-vocabulary CHECK; no default | One stable category identifier |

- `PRIMARY KEY (lab_test_id, category)` prevents duplicate assignment of the same category to the same test, including concurrent inserts. Do not add uniqueness on either column alone: a test may have multiple categories and the same category may be assigned to multiple tests. No surrogate UUID or assignment timestamp is needed.
- `FOREIGN KEY (lab_test_id) REFERENCES lab_tests(id)` with NO ACTION prevents orphan assignments and follows retained catalog identity conventions. Catalog deletion remains unsupported; deactivation preserves assignments. Removing an assignment through ADMIN PUT deletes only the corresponding collection row, never its test.
- The CHECK is `category IN ('BLOOD_TESTS', 'VITAMINS_MINERALS', 'THYROID', 'LIVER', 'KIDNEY', 'LIPIDS', 'DIABETES')`. Together with NOT NULL and the composite key, this bounds each test to zero through seven valid unique assignments. "All", blank, null, and arbitrary/differently cased identifiers cannot be stored. Use string-enum values, never enum ordinals; labels and display order remain contract/client mappings. A category can have no tests without requiring a placeholder row.
- Retain existing lab_tests indexes. The composite PK covers per-test category loading and its FK. Add B-tree `lab_test_categories(category, lab_test_id)` for category membership queries. Task 4 uses a correlated EXISTS membership predicate against the mapped collection and combines availability/literal search before totals, sorting and pagination over tests. The outer query has no assignment join, so filtering cannot duplicate content or inflate counts; each matching test returns its full category set in contract order.
- V6 creates only the empty assignment table and reverse index, without data inference, legacy backfill, or changes to lab_tests rows. V1-V5 remain unchanged. UUIDs, names, descriptions, prices, currency, sample types, preparation instructions, availability, and timestamps are preserved. No fabricated "uncategorized" row/value or automatic deactivation.
- Implemented JPA mapping: lazy `@ElementCollection` set on LabTest, with `@Enumerated(STRING)` LabTestCategory values backed by this table; existing LabTestRepository supplies persistence. The seven enum constants match the contract/CHECK. No category entity, new repository, or independent lifecycle is needed. Task 3 validates the string-list DTO before conversion (including duplicates, exact enum values, null elements and count) and emits arrays ([] when unassigned) in enum declaration/contract order. Strict JSON parsing rejects wrong container/element types without coercion.
- Implemented Task 3 HTTP contract: POST omission/null/empty array creates zero assignments. PUT omission/null/empty array clears all assignments; a nonempty array replaces the complete set atomically with catalog-field changes under the existing test-row lock and transaction. All failure paths roll back both field and membership writes. Category changes preserve availability; PATCH status preserves assignments. No extra assignment or category-management endpoint is introduced. Task 3 changes the Task 2 PUT behavior from preserving internally assigned categories to replacing/clearing them as specified. The lazy collection is mapped to response DTOs inside existing read/write transactions; no schema or migration change is needed.
- Implemented Task 4 list contract: active unassigned tests remain visible to patients in "All". Staff retain both states unless filtered. A named-category filter includes a test when it has that membership and excludes unassigned tests. No category filter means all category sets, including empty, subject to effective availability. Exact enum parsing rejects invalid/repeated category input before the service policy; unknown query keys remain ignored. Existing page/sort limits, UUID tie-breaker and large-offset filtered-count path are retained. Task 5 detail visibility uses the same role/availability policy, with inactive patient reads hidden as missing.
- Implemented Task 4 authorization: PATIENT list defaults to active-only; explicit well-formed `active=false` is 403 after all query syntax validation. Staff retain inactive list access; only ADMIN may change fields/membership/availability. Task 5 makes inactive detail indistinguishable from missing (404) for patients before DTO/category mapping, preserving staff access. No schema or migration change is needed. These are service authorization rules, not new database roles or row-level security.

Task 1 evidence remains the source/contract and screenshot review on 2026-10-27, with no execution in that documentation-only task. Task 2 adds separate focused migration/persistence/catalog regression execution, recorded in TESTING.md and the plan. Task 3 adds focused HTTP/category/security execution recorded separately in TESTING.md and the plan. Task 4 adds separately recorded focused membership/list-availability execution. Task 5 adds separately recorded focused detail and single complete-suite execution, including catalog migration/persistence regressions. No development/production deployment readiness is established; the commit criterion remains pending per the user's explicit no-commit instruction.

### 4.5. `test_parameters`

Individual measurements within a test, such as WBC or HGB within CBC.

Implementation status: planned, absent from V1-V5. This is proposed design; resolve the linked requirements/decisions and API contract in IMPLEMENTATION_PLAN before implementation.

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

Implementation status: planned, absent from V1-V5. This is proposed design; resolve the linked requirements/decisions and API contract in IMPLEMENTATION_PLAN before implementation.

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

Stage 2 Task 6 reviewed design (2026-10-28), implemented in V7 by Task 7 with TestOrder/OrderStatus mappings and TestOrderRepository. The single detailed HTTP/validation/retry contract is [ORDERS_API.md](ORDERS_API.md). Confirmed Stage 2 rules and S2-ORD-D01/D02 replace the earlier NEW/payment-coupled proposal for this slice. Tasks 8-10 implement creation, owned reads and cancellation without schema changes. Each has focused evidence, and Task 11's full-suite verification satisfies stage acceptance. Task 11 and Stage 2 are DONE; the owner commit is a separate handoff.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK; existing application UUID generation convention | Internal order identity |
| `order_number` | `VARCHAR(30)` | No | UNIQUE; format CHECK | Sequence-generated visible number, immutable |
| `patient_id` | `UUID` | No | FK patients.id; NO ACTION | Existing laboratory profile, immutable |
| `created_by` | `UUID` | No | FK users.id; NO ACTION | Authenticated creator, immutable |
| `idempotency_key` | `UUID` | No | UNIQUE with created_by | Normalized required create retry key, immutable |
| `request_hash` | `CHAR(64)` | No | Lowercase SHA-256 hex CHECK | Canonical operation/profile/selection fingerprint, immutable |
| `status` | `VARCHAR(20)` | No | DEFAULT PENDING; four-value CHECK | PENDING, IN_PROGRESS, COMPLETED, CANCELLED |
| `currency` | `CHAR(3)` | No | DEFAULT ILS; CHECK ILS | One order/snapshot currency, immutable |
| `cancelled_by` | `UUID` | Yes | FK users.id; NO ACTION | Original cancellation actor; server-derived |
| `cancelled_at` | `TIMESTAMPTZ` | Yes | Conditional state CHECK | Original cancellation time |
| `cancellation_reason` | `TEXT` | Yes | Nonblank trimmed text when present; length <= 1000 | Required by service for staff cancellation; optional for patient |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time, immutable |
| `updated_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Application-maintained modification time |

Storage and transaction requirements:

- Add technical BIGINT `order_number_seq`, START 1/INCREMENT 1, independent of patient_number_seq. Format ORD- plus at least six digits without truncating larger numbers; VARCHAR(30) accommodates BIGINT. CHECK `^ORD-[0-9]{6,19}$`; UNIQUE is authoritative. Gaps are acceptable, no reuse/reset/MAX+1. This is a technical sequence, not a new application table; the 22-table inventory is unchanged.
- UNIQUE(created_by, idempotency_key), NOT NULL on both, with request_hash CHECK `^[0-9a-f]{64}$`. Owner-confirmed retry semantics require durable identity retained with the order, including after cancellation. No expiry/cache-only policy and no separate idempotency table are needed. Canonical fingerprint details are in ORDERS_API.md section 5.
- CHECK status in the four approved values. This stage only creates PENDING and writes PENDING to CANCELLED. IN_PROGRESS/COMPLETED describe future workflow states; do not infer processing/publication authority or expose arbitrary transitions. NEW is not retained as an alias: these are unapplied proposals, not an existing data migration.
- Cancellation consistency: CANCELLED requires both cancelled_by and cancelled_at; all other states require cancelled_by, cancelled_at and cancellation_reason NULL. A present reason must be stripped, nonblank and at most 1000 characters; cancelled_at cannot precede created_at. Service enforces the staff reason requirement against the authenticated current role; a cross-table role CHECK is not valid. Repeated authorized cancellation preserves the first metadata and updated_at.
- No source=ONLINE/WALK_IN or notes field is introduced in Stage 2. Authenticated creation is not proof of physical attendance, and neither request field is part of the approved interface. Future source/visit/notes requirements need a reviewed contract. No appointment, payment, visit, sample or result row is created by an order operation.
- Create the header and 1-100 unique items atomically. Resolve existing patient identity through the current profile/account link; staff can select an unlinked existing profile. No automatic profile creation, matching or linking. A child-count/parent-currency/active-admission invariant cannot be expressed as an ordinary CHECK over another table: enforce nonempty, bounded, complete aggregates and catalog availability in the order service transaction. Maintain the composite item uniqueness/FKs as database backstops. No zero-item or partially persisted order may commit through the application.
- No mutable header total/test count. Compute count and exact SUM of all immutable price_at_order values. A cancelled order retains the original value/items; this is historical order amount, not balance/net payment. SUM/BigDecimal must accommodate 100 maximum catalog prices (999999999999.00), rather than narrowing the aggregate to per-item NUMERIC(12,2).
- Use the existing account-then-patient locking order for new creation/current eligibility and linking safety; same-actor creations serialize on the user row. Check successful retry identity before fresh catalog availability. Lock selected catalog rows with shared/pessimistic-read locks in UUID order until snapshot commit; current catalog writes use exclusive row locks. Replays never reprice. The unique-key fallback must roll back before winner lookup in a new transaction.
- Cancellation takes an order row lock, then rechecks ownership/state and writes all metadata atomically. It does not acquire account/patient locks after the order lock; future processing must lock that order row too. No independent item update/cancellation, reopening, refund, appointment cancellation or payment-driven edit freeze is implemented in this stage. Future integrations must approve/reconcile those transitions before writing related records.
- Ownership queries join patient_id to patients.user_id (not created_by). Task 9 list filters/counts/page operate over unique orders, then group item count/value for just the selected page without multiplying outer rows. Current DTO/page/error/security conventions, the large-offset count path and UUID sort tie-breaker are preserved. Task 7 uses matching CHAR mappings for currency/hash and passes Hibernate schema validation; Task 10 adds cancellation using the existing columns and order lock.
- TestOrder owns a lazy item collection with cascade PERSIST only, exposed as an unmodifiable list; persisted aggregates reject adding items. OrderItem is Hibernate-immutable with no setters and non-updatable snapshot columns. No cascade remove/orphan removal is configured. Repository methods provide sequence allocation, actor/key lookup and an order write lock; LabTestRepository provides a shared snapshot lock. Services must apply the transaction/authorization/lock-order rules above in Tasks 8-10; repository methods alone do not implement them.
- Task 8 adds validated creation DTOs, OrderService and OrderCreationTransactions. Creation rechecks eligibility/current role under the account lock, locks the resolved patient, checks the canonical SHA-256 intent and acquires shared catalog locks in lexical UUID order before storing 1-100 unique active ILS snapshots. Header/items flush and commit atomically; totals remain computed exact sums. Matching replays read the retained order without mutations or current availability checks. Unique retry collisions leave the failed transaction before a fresh REQUIRES_NEW winner lookup/recheck. Response mapping occurs within the transaction. No new schema, payment, appointment, visit or cancellation write path is added.
- Task 10 cancellation rechecks the current eligible account/role without account or patient write locks, validates the staff reason requirement, then locks the order and rechecks ownership/state. It writes PENDING to CANCELLED, actor, microsecond-normalized UTC event time and reason atomically; ORM maintains updated_at. Flush/refresh returns persisted timestamp precision. A valid repeat returns the original record without dirtying it. Header/item snapshots and retry identity are retained; no item writes, refund, appointment, visit, processing or result transition is introduced.

### 4.8. `order_items`

Stage 2 Task 6 reviewed design, implemented in V7 by Task 7 with the OrderItem mapping. Original ordered tests are immutable historical snapshots; order-level status/cancellation is sufficient for this stage.

| Column | PostgreSQL type | Nullable | Key / default | Meaning |
|---|---|---|---|---|
| `id` | `UUID` | No | PK; existing application UUID convention | Item identity |
| `order_id` | `UUID` | No | FK test_orders.id; NO ACTION | Retained parent order |
| `lab_test_id` | `UUID` | No | FK lab_tests.id; NO ACTION | Stable selected catalog identity |
| `test_code_snapshot` | `VARCHAR(30)` | No | Same code-format CHECK as catalog | Code at creation, immutable |
| `test_name_snapshot` | `VARCHAR(150)` | No | Trimmed nonblank CHECK | Name at creation, immutable |
| `price_at_order` | `NUMERIC(12,2)` | No | Finite and >= 0 CHECK, as current catalog | Server-selected historical price, immutable |
| `created_at` | `TIMESTAMPTZ` | No | DEFAULT CURRENT_TIMESTAMP | Creation time, immutable |

- UNIQUE(order_id, lab_test_id); one occurrence/implicit quantity one. API validation rejects duplicates before converting input to a set. A deliberate later repeat is a new order with a new key.
- Retained FK references prevent orphan items and deletion of referenced orders/catalog tests. No cascade deletion/orphan-removal history path. Copy code/name/price under catalog locks once; never read current names/prices to reconstruct historical responses. Order currency is ILS and every admitted catalog row must match it.
- The earlier proposed item status=NEW/cancellation fields and updated_at are deferred: Stage 2 has no independent item lifecycle or edit API, and whole-order cancellation preserves every item. Future sample/processing/result contracts may add their own required state via new migrations, without redefining these snapshots or inventing clinical rules.
- Categories/specimen/preparation/report snapshots are not silently added to these historical fields. Parameter/reference ranges, measurements and published results remain separate future modules.

### 4.9. `appointment_slots`

Available booking periods and the maximum number of appointments for each period.

Implementation status: planned, absent from V1-V5. This is proposed design; resolve the linked requirements/decisions and API contract in IMPLEMENTATION_PLAN before implementation.

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

Implementation status: planned, absent from V1-V5. This is proposed design; resolve the linked requirements/decisions and API contract in IMPLEMENTATION_PLAN before implementation.

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
- Cancelling an appointment does not implicitly cancel the order. Future appointment integration must define atomic order/appointment cancellation before enabling that coupling; Stage 2 order cancellation has no appointment side effect.

### 4.11. `payments`

Payment and refund records. This design does not integrate a payment gateway.

Implementation status: planned, absent from V1-V5. This is proposed design; resolve the linked requirements/decisions and API contract in IMPLEMENTATION_PLAN before implementation.

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

Implementation status: planned, absent from V1-V5. This is proposed design; resolve the linked requirements/decisions and API contract in IMPLEMENTATION_PLAN before implementation.

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

Implementation status: planned, absent from V1-V5. This is proposed design; resolve the linked requirements/decisions and API contract in IMPLEMENTATION_PLAN before implementation.

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

Implementation status: planned, absent from V1-V5. This is proposed design; resolve the linked requirements/decisions and API contract in IMPLEMENTATION_PLAN before implementation.

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
- Proposed: editing a VALIDATED version returns it to DRAFT and clears its validation metadata. Whether one technician may enter, validate, and publish must be resolved in D-RES before implementation; this proposal grants no new permission.
- Publication requires validation. In one transaction, set the old published version is_current = FALSE and the new one TRUE. is_current implies status = PUBLISHED.
- Published values, samples, snapshots, and publication metadata must not be overwritten. Only the current-version marker changes when superseded.
- Patient name/number, birth date, and gender snapshots are required before publication. Validation/publication timestamps and actors are required for their respective states.
- Patients access only their own published results. Historical versions must be clearly marked as superseded. report_file_key references a private authorized download.

### 4.15. `result_samples`

The exact sample-to-test links used by each result version.

Implementation status: planned, absent from V1-V5. This is proposed design; resolve the linked requirements/decisions and API contract in IMPLEMENTATION_PLAN before implementation.

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

Implementation status: planned, absent from V1-V5. This is proposed design; resolve the linked requirements/decisions and API contract in IMPLEMENTATION_PLAN before implementation.

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

Implementation status: planned, absent from V1-V5. This is proposed design; resolve the linked requirements/decisions and API contract in IMPLEMENTATION_PLAN before implementation.

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

Implementation status: planned, absent from V1-V5. This is proposed design; resolve the linked requirements/decisions and API contract in IMPLEMENTATION_PLAN before implementation.

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

Implementation status: deferred AI, absent from V1-V5; outside core implementation. T-AI-01 requires a separate later-phase baseline before any schema/API work.

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

Implementation status: deferred AI, absent from V1-V5; outside core implementation. T-AI-01 requires a separate later-phase baseline before any schema/API work.

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

Links involving planned/deferred tables below are proposed relationships, not existing foreign keys. Implemented relationships are defined by the V1-V6 inventory in section 1.1.

| Parent | Child / link | Cardinality or rule |
|---|---|---|
| users | email_action_tokens | One account to many action tokens |
| users | patients | Optional one-to-one; unlinked patient profiles allowed |
| patients | patient_link_tokens | Multiple historical tokens; at most one outstanding token per profile |
| users | patient_link_tokens | Authenticated staff issuer; retained non-cascading reference |
| patients | test_orders | One patient to many orders |
| lab_tests | lab_test_categories | Zero to many unique assignments per test; FK lab_test_id |
| Fixed category vocabulary | lab_test_categories | Zero to many tests per identifier; category CHECK, no category lookup table; PK(lab_test_id, category) prevents duplicate membership |
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

For planned tables these are design proposals for the relevant task/contract review, not indexes or locking already present in the application.

Preserve the existing authentication indexes. Add indexes for frequently queried FK columns unless already covered by a suitable PK/UNIQUE index.

Additional recommended indexes:

- `lab_test_categories(lab_test_id, category)` PK and `lab_test_categories(category, lab_test_id)` are implemented in V6; development/production application is unverified.
- Stage 2 implemented V7: `test_orders(patient_id, created_at DESC, id ASC)`, `test_orders(patient_id, status, created_at DESC, id ASC)`, UNIQUE(order_number), UNIQUE(created_by, idempotency_key), and an index on cancelled_by. The composite retry index covers created_by; filtered order-number substring search is a normal literal search initially, with further indexing only if measured.
- Stage 2 implemented V7: `order_items(order_id, lab_test_id)` UNIQUE, covering order_id FK/loading, plus `order_items(lab_test_id)` for its retained catalog FK.
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

1. Stage 2 creation: current account, patient, then selected catalog rows in stable UUID order; successful retry lookup precedes fresh catalog admission. Cancellation locks its order and never takes account/patient locks afterward. See section 4.7 and ORDERS_API.md.
2. Future booking: lock slot rows before capacity checks and appointment writes.
3. Lock order/payment rows before payment or refund amount checks.
4. Lock ordered test items before allocating result revisions or publishing.
5. Lock parameters before reference-range overlap checks and writes.
6. Use stable lock ordering when a transaction touches several records.

## 7. Authorization and lifecycle rules

Existing patient/catalog/account permissions are defined by their implemented contracts. Future workflow permissions below are carried-forward proposals pending D-ROLE and feature-specific decisions; they are not deployed access policy.

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

This illustrates the planned workflow only. Orders, appointments, payments, samples, results, notification persistence and audit persistence are not implemented yet.

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

The current [implementation plan](../IMPLEMENTATION_PLAN.md) records completed Stage 1 catalog work and Stage 2 order Tasks 6-10. Task 6 is contract/design review; Task 7 supplies persistence, Task 8 creation and Tasks 9/10 owned reads/cancellation, each with focused evidence. Task 11 passes the full suite and all stage acceptance criteria; Task 11 and Stage 2 are DONE. The owner commit is a separate handoff. References and the remaining workflow stay unimplemented. Older R-/T- identifiers elsewhere in this design are carried-forward traceability, not current task numbering.

Stage 1 Task 1 is DONE: section 4.4a and LAB_TESTS_API.md define the accepted optional multiple-category contract. Task 2 implements only the V6 schema and JPA collection, with focused verification recorded in the plan/TESTING.md. Task 3 adds category assignment/response DTOs through the existing transaction/mapping; focused evidence is recorded separately. Task 4 implements membership queries and patient list visibility with focused evidence in TESTING.md/the plan. Task 5 implements detail visibility and records final catalog/full-suite evidence. No remaining functional catalog gap was identified; the catalog commit criterion was subsequently satisfied (verified c7deaa7 in the plan); deployment readiness remains unverified. Stage 2 Task 6 finalizes the [single order API contract](ORDERS_API.md); Task 7 implements the storage/mappings in sections 4.7-4.8; Task 8 implements creation and retry transactions/POSTs; Tasks 9/10 implement owned reads and cancellation. Task 11 acceptance passes the full suite; Task 11 and Stage 2 are DONE. The owner commit is a separate handoff. Parameter/reference contracts and the remaining workflow stay separate future slices; AI stays deferred.

Use the next available Flyway migration version at implementation time. Never rewrite an applied migration, delete history, or reset a team database as a shortcut. Each slice requires requirement IDs, contract, transaction/ownership rules and scoped acceptance evidence before DONE.

## 10. Official technical references

The sources support design principles; table names, lengths, and the planned 22-table structure are project decisions. This document does not claim FHIR or ISO certification.

- [S1] PostgreSQL 16 - Constraints: https://www.postgresql.org/docs/16/ddl-constraints.html
- [S2] PostgreSQL 16 - Numeric Types: https://www.postgresql.org/docs/16/datatype-numeric.html
- [S3] PostgreSQL 16 - Explicit Locking: https://www.postgresql.org/docs/16/explicit-locking.html
- [S4] HL7 FHIR R4 - Observation: https://www.hl7.org/fhir/R4/observation.html
- [S5] HL7 FHIR R4 - DiagnosticReport definitions: https://www.hl7.org/fhir/R4/diagnosticreport-definitions.html
- [S6] OWASP - Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

The laboratory must provide the approved catalog, reference values, sample/container requirements, methods, and result interpretation policies before clinical use.
