# Database-backed test setup

## Stage 5 medical history verification (2026-10-30)

Tasks 28-32, S5-MH-R01-R06. Branch `backend-hmood`. Existing owner additions to
this file (280 lines at task entry) are preserved. No Postman or live development
HTTP/database work was performed for Stage 5; tests use MockMvc, real JWT/cookie
security, synthetic fixtures and fake external email.

Independently verified disposable PostgreSQL 16.15 before execution: inspected
the saved SMARTLIMS_TEST_POSTGRES_DATA path under the user's temporary directory,
postgresql.conf loopback-only listener/55432 and pg_hba.conf loopback postgres
trust entry. pg_ctl initially reported stopped (stale postmaster.pid); started
only that resolved disposable directory. psql explicitly connected to
127.0.0.1:55432/smartlims_auth_regression and confirmed current_database,
current_user=postgres, server address/port, listen_addresses=127.0.0.1 and actual
data_directory matching
`C:/Users/hmood/AppData/Local/Temp/smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df`.
pg_ctl and the independent listener inspection both identified PID 14408.
The development PostgreSQL service was separate and untouched. The unchanged
machine-local .mvn/maven.config and Surefire mapping target only that guarded
regression URL. No application datasource fallback; no credentials printed.

Commands run directly from Backend:

| Command | Result |
|---|---|
| `.\mvnw.cmd '-DskipTests' compile` | BUILD SUCCESS, 13.394 s, finished 18:27:35 +02:00. Compile only. |
| `.\mvnw.cmd '-Dtest=VisitArchiveTest,HealthTrendTest' test` (initial) | 22 tests, 1 failure, 0 errors/skips; 56.258 s, finished 18:31:06 +02:00. New cookie fixture incorrectly named the cookie; corrected to existing access_token. No production security change or weakened assertion. |
| `.\mvnw.cmd '-Dtest=VisitArchiveTest,HealthTrendTest' test` (expanded/corrected) | **26 tests, 0 failures/errors/skips, BUILD SUCCESS**, 58.709 s, finished **18:33:10 +02:00**. VisitArchiveTest 10; HealthTrendTest 16. |

Coverage and acceptance:

| Requirement | Current focused evidence |
|---|---|
| S5-MH-R01 | Completed/publication/exact-visit evidence; literal search; ANDed date/test/flag filters; same-test flag correlation; multi-specimen/value unique totals; deterministic UUID ties; empty/distant pages; historical inactive test choices. |
| S5-MH-R02 | Owned details reuse complete published snapshots, notes/explanation/real visit links and existing result/report URLs; draft/approved/open/foreign/missing visits concealed; no payment fields or internal events. |
| S5-MH-R03 | Numeric-only owned current publications; TEXT/unreported exclusion; separate unit/method/specimen/container/parameter identity series; multi-kind signature; same-kind specimen deduplication; retained snapshots after catalog/definition deactivation; search/paging. |
| S5-MH-R04 | Measurement chronology independent of publication order, chart ascending/table descending, selected-window stats independent of page; period defaults/all/custom/calendar windows; Jerusalem 25-hour DST day and exact date bounds; empty/single/zero/negative/unchanged/censored and full storage precision decimals. |
| S5-MH-R05 | Bearer/cookie/current-role/ownership/unlinked behavior; strict repeated/unknown/malformed selectors; correction replacement and cancelled published retention; simultaneous publication/read never hides or duplicates a point/visit test. |
| S5-MH-R06 | PASS: full invocation and final preservation/diff review below; all 319 existing plus 26 Stage 5 tests pass together. |

No migration is needed. V1-V9, POM/dependency versions, existing tests, isolation
guard and local Maven mapping are preserved. New synthetic fixture SQL changes
only unpublished snapshot rows in the guarded regression database to exercise
historical incompatible definitions/unreported numeric data; published immutability
guards remain enforced. API examples: [MEDICAL_HISTORY_API.md](MEDICAL_HISTORY_API.md).
No clinical data/authority, payment information or educational interpretation
is seeded. Existing Stage 4 reviewer configuration/approved definitions/publication
workflow remains the prerequisite for populating histories. No large-history load
benchmark, live client/manual verification or deployment claim.

Final required invocation, after final source/contract/data-design review and
independent recheck of pg_ctl PID 14408, loopback listener and actual psql database/
data_directory identity:

```powershell
.\mvnw.cmd test
```

**345 tests across 46 suites, 0 failures, 0 errors, 0 skips, BUILD SUCCESS,
exit 0.** Maven duration **04:03 min**; finished **2026-10-30T18:38:41 +02:00**.
All 46 Surefire XML reports were independently parsed after completion: exact same
totals, zero stale reports predating this invocation. The 26 new cases passed
again in this final run alongside all 319 existing tests, including migration,
Stage 4 workflow/clinical security/correction concurrency and PDF regressions.
No PDF code or layout was changed. No further source change followed this run.

Final read-only isolated psql checks: all nine Flyway versions successful and no
remaining smartlims_migration_* compatibility databases. `git diff --check` and
new-file whitespace/conflict scan passed. Protected-file diff confirmed unchanged
POM, applied migration sources, report rendering, isolation guard and Maven mapping.
Only Backend Stage 5 source/tests/contracts/design/evidence and the excluded local
implementation plan changed; previous owner work in this file remains intact.
No existing test/assertion was removed or weakened. No implementation blocker
remains: Stage 5 and Tasks 28-32 are DONE. Owner review/manual client checks,
commit/push and deployment remain separate and were not performed.

## Stage 3 and 4 live HTTP verification (2026-10-30)

Status: DONE. Owner-authorized follow-up to Tasks 18/27, S3-APT-R01–R07 and
S4-RES-R01–R08. Branch `backend-hmood`; clean working tree at entry.
This entry supersedes the earlier manual-HTTP handoff only; historical isolated
automated-suite results and deployment limits below remain separate.

Executed **153 recorded scenario checks, 326 boolean assertions, all PASS**.
Transport: Python urllib HTTP client against the running local backend at
`http://127.0.0.1:8080`, from **2026-10-30T12:44:21.628668+00:00** through
**2026-10-30T13:14:58.369937+00:00** (UTC). These are actual HTTP exchanges, not inspection of saved
requests, MockMvc, simulated responses, or a Postman cloud collection run.
The connected full Postman MCP toolset exposed resource management but no usable
request/collection execution tool; terminal execution was therefore used.
Private bootstrap/discovery calls are setup context, outside the scenario count.

| Workflow | Result | Actual evidence |
|---|---|---|
| Stage 3 rescheduling and retries | PASS | Dedicated and supplied fixtures moved; same ID/type retained; exact immediate retry retained revision; conflicting stale revision returned 409. |
| Appointment cancellation / Past | PASS | Cancelled record retained in patient Past; authorized cancellation retry preserved timestamp/version; order remained PENDING. |
| Capacity / rebooking / order cascade | PASS | Capacity-one schedule read before/after booking, movement, cancellation and cascade; released/consumed exactly as expected. Fresh-key rebooking created a new ID. |
| Supplied test order/appointment | PASS | Order `75b7e73c-a6aa-475f-bead-31ad9405f691` and appointment `0a4e6cfe-fe21-4c9f-882a-e29fe79b4c41` were processed through authorized staff flows; supplied order is now CANCELLED. Its rebooking also became CANCELLED on order cascade. |
| Visits / processing / closure | PASS | Explicit real-time synthetic arrival created OPEN visit, IN_PROGRESS order and CHECKED_IN appointment; exact retry retained visit; direct cancellation then conflicted. Visit closure completed appointment/order and released capacity after publication. |
| Specimens | PASS | REGISTERED→RECEIVED, explicit suitability, nullable collection time, retained rejection and independent replacement receipt/attestation; cross-order suitability denied; APPROVED/PUBLISHED evidence protected with SAMPLE_IN_USE. |
| Drafts / independent review | PASS | Complete synthetic parameter snapshots; stale revision/strict decimal checks; drafts and unpublished approvals concealed; technician/generic ADMIN review denied. Separate allowlisted reviewer approved/published. Editing APPROVED cleared approval and required reapproval. |
| Patient results / corrections | PASS | Pending before visits; All/Available/Pending, search/category/unique counts, complete owned detail, foreign concealment; correction draft retained current original publication. Publishing correction atomically changed current ID and preserved two published historical versions. |
| PDF downloads | PASS | Three actual 200 downloads: initial, superseded initial, corrected current; valid PDF signature/EOF, nonempty bytes, PDF content type, attachment, private/no-store. Foreign/draft downloads returned 404. |
| Actual-time no-show | PASS | Fresh near-term slot booked; pre-end no-show returned 409; after actual slot end NO_SHOW recorded, retry retained revision, patient Past retained it, capacity released. Pending fixture order subsequently cancelled while NO_SHOW history remained. |
| Authorization / privacy | PASS | Anonymous protected reads 401; missing-authentication/CSRF writes 403; role denials 403; foreign patient visit/result/appointment 404. Standard error envelope, request-ID equality and no-store checked on independent anonymous scenarios. |

### Safe setup and local configuration

Established bootstrap ADMIN access through an existing supported login flow without
printing credentials/tokens. Created six dedicated `verify_00c77b0a_*` accounts
through ADMIN invitations, captured only synthetic `@example.invalid` mail in a
loopback sink, accepted invitations through the public set-password API and logged
in normally. No account/security rows were edited directly in PostgreSQL.
Separate patient/foreign-patient profiles prove ownership. A dedicated zero-price
SYNTHETIC panel with NUMERIC/TEXT parameters and explicitly synthetic categories
was used; no clinical ranges, interpretation rules or inferred specimen suitability
were introduced.

Independent reviewer ADMIN UUID:
`7633d456-f0fe-455b-916b-8a3f82e64915`.
Technician author UUID:
`3a0af84d-20de-493c-a037-fb1346df9ae2`.
The reviewer UUID was added to `SMARTLIMS_LABORATORY_AUTHORIZED_ADMIN_IDS` in the
local Windows user environment, merging existing entries (none were present).
The current IDE launch has the same explicit grant. Existing DB/JWT/security
settings were preserved. Temporary loopback SMTP launch overrides were removed;
the final three HTTP checks passed after original email settings were restored.
Generated passwords/tokens are Windows-user DPAPI encrypted in a user-only local
directory outside Git. No secret values were uploaded to shared Postman variables
or saved request/response examples. Independent review was never disabled.

### Saved account evidence

Workspace **Smart-LIMS** (`86c94ce6-e272-464e-adc8-f3c4c2b699a5`),
[Smart-LIMS API](https://go.postman.co/collection/50742279-2e703687-f70e-46b1-bcf5-55db0d345512),
environment **Smart-LIMS Local**. MCP read-back verified **153 new verification
requests and 153 actual sanitized response examples**, with no missing/status/body
mismatches. All **80 pre-existing requests**, collection authentication, scripts
and collection variables remain unchanged. Temporary account-only transfer
collections were verified empty and removed; the workspace again contains only
the original Smart-LIMS API collection.

| Saved feature path | Verification requests/examples |
|---|---:|
| Auths / Verification 2026-10-30 - Setup / Setup - executed evidence 1 | 23 |
| Appointments / Verification 2026-10-30 (including executed evidence 1–2) | 35 |
| Visits / Verification 2026-10-30 (including executed evidence 1–2) | 27 |
| Samples / Verification 2026-10-30 (including executed evidence 1) | 18 |
| Results / Verification 2026-10-30 (including executed evidence 1–6) | 50 |

Non-secret connection/supplied IDs and 57 observed fixture values (IDs, dates,
versions and operation keys) are saved in the existing environment. Private
authentication values were preserved. Verification requests use separate
`verification*Token` role variables without shared raw token values.
Examples are timestamped historical states, not resettable fixtures.

Recorded creation keys belong to their exact historical operations: stage-3 order,
booking and rebooking; supplied-order rebooking; stage-4 order/booking; arrival;
initial/rejected/replacement specimens; initial result; correction; no-show order
and booking. Reuse a key only with the same intent/body for that exact retry.
An intentional new creation needs a fresh key; a new complete run also needs
fresh unique fixture identities/codes. Versioned mutation bodies retain the actual
historical `expectedVersion`; obtain the current technical `version` for a new
mutation, including between approval and publication. `versionNumber` is clinical.
No pre-request script regenerates creation keys.

PDF examples preserve the exact downloaded bytes as explicitly labelled base64,
with actual HTTP headers and SHA-256 values:

| Check | Bytes | SHA-256 |
|---|---:|---|
| S4-53 initial publication | 38135 | `96f67563528e72ccfb5d1d4b8bdaa648bc8c50addcbfe52c75eadf9f324a40bb` |
| S4-70 superseded initial | 37687 | `cb30fe3d3084bb0521ee078f9a48d4d9766ecfbe939a45629280bb93db6f6295` |
| S4-71 corrected current | 38194 | `3e196f8eb0789a2eb3cc03e0ab201754916f49f8777d177979af1f1117612c6f` |

### Execution limits and review notes

No backend implementation defect was identified; no production code, dependency,
schema or applied migration was changed. No Maven/regression tests or direct
database operations were run against the development database. No isolated suite
was rerun; the historical 319-test result below is not evidence from this run.
PDF checks here establish actual downloads/headers/byte completeness, not a new
visual typography/layout review. Earlier visual/automated evidence remains separate.
External SMTP delivery and production deployment remain unverified.

Provisioning recovered an existing invitation after a helper's mixed-case email
lookup; it did not create a duplicate account. A helper initially checked the visit
projection using `items`; the actual contract uses `tests`. That assertion helper
was corrected and the read was rerun successfully (S4-58); it was not a backend
defect. Only the final retained observation is in the scenario manifest.
MCP gateway size/transport errors affected evidence archiving; state was read back
before retry/cleanup, and final saved requests/examples match retained observations.
Only verification Markdown was written in Backend. No Postman exports/configuration
files were created in Git; no commit or push was performed.

### Saved verification request manifest

Each row identifies a saved request in desktop Cloud View; its example contains
the observed sanitized response, actual status, headers and scenario description.

| Check | Saved scenario | Method | HTTP | Result | Postman request ID |
|---|---|---|---:|---|---|
| S3-A01 | Anonymous appointment detail | GET | 401 | PASS | `9ab9282c-9f8b-8471-f82a-373840749b21` |
| S3-A02 | Anonymous Past list | GET | 401 | PASS | `e0f9b28f-4b7b-6c16-9042-05f01bd3d5a0` |
| S4-V01 | Anonymous patient visit list | GET | 401 | PASS | `1028e57e-2b1b-7de7-c822-ad90cdbafc29` |
| S4-S01 | Anonymous specimen list | GET | 401 | PASS | `957c3d02-5db3-0768-0db4-2f8ea42e98b5` |
| S4-R01 | Anonymous patient result list | GET | 401 | PASS | `eae5fb0e-1fc7-ab65-94cf-61387b7e9201` |
| S4-R02 | Anonymous PDF report | GET | 401 | PASS | `c27853d3-4882-57b5-b5a9-ee3f16560bf7` |
| S3-A03 | Anonymous cancellation without CSRF | POST | 403 | PASS | `716b4df1-f45b-994f-b183-d1e72f25cbec` |
| S4-V02 | Anonymous arrival without CSRF | POST | 403 | PASS | `155e9ee0-5dc5-c501-c122-e10694c048aa` |
| S4-S02 | Anonymous specimen creation without CSRF | POST | 403 | PASS | `63afd403-643e-37ad-2961-22d73f9043c9` |
| S4-R03 | Anonymous draft creation without CSRF | POST | 403 | PASS | `773cad21-56cf-4a76-bc33-071e6176a753` |
| SETUP-reviewer-01 | Invite synthetic reviewer | POST | 200 | PASS | `fca11257-67f3-4459-8011-ccaf40e20550` |
| SETUP-reviewer-02 | Accept synthetic reviewer invitation | POST | 200 | PASS | `ee19e422-7162-440e-a7ff-23e41fdd90c8` |
| SETUP-reviewer-03 | Authenticate synthetic reviewer | POST | 200 | PASS | `767c670a-c309-4bb6-b8dd-379f45513ce5` |
| SETUP-technician-01 | Invite synthetic technician | POST | 200 | PASS | `c348f397-2554-446f-a8b0-4ee39d5f8aee` |
| SETUP-technician-02 | Accept synthetic technician invitation | POST | 200 | PASS | `12c9fa2f-1f94-4c15-b4e3-c5b24d2537e2` |
| SETUP-technician-03 | Authenticate synthetic technician | POST | 200 | PASS | `c5c19fae-a1a5-4aa0-86a1-75812f5bdf8c` |
| SETUP-receptionist-01 | Invite synthetic receptionist | POST | 200 | PASS | `c2cc56d3-0218-448d-ba74-1038995350a2` |
| SETUP-receptionist-02 | Accept synthetic receptionist invitation | POST | 200 | PASS | `cc32fbd1-b89c-4d35-8e68-118b4d08fe05` |
| SETUP-receptionist-03 | Authenticate synthetic receptionist | POST | 200 | PASS | `cb943bda-7cb0-4c96-94fc-a8aeb01eb600` |
| SETUP-patient-01 | Invite synthetic patient | POST | 200 | PASS | `f3d4791d-f6d8-4877-9c29-5b4312db4780` |
| SETUP-patient-02 | Accept synthetic patient invitation | POST | 200 | PASS | `0b493b59-26cc-4af1-ae82-734011a18c21` |
| SETUP-patient-03 | Authenticate synthetic patient | POST | 200 | PASS | `f397920a-f0a9-468a-8ba5-69e71a0a4cb5` |
| SETUP-foreignPatient-01 | Invite synthetic foreignPatient | POST | 200 | PASS | `0107086c-13fe-412f-8e82-3ae395362929` |
| SETUP-foreignPatient-02 | Accept synthetic foreignPatient invitation | POST | 200 | PASS | `c5a42be7-42fe-47aa-aa9b-09911a8bd0e7` |
| SETUP-foreignPatient-03 | Authenticate synthetic foreignPatient | POST | 200 | PASS | `02899aff-d5f4-4b14-8022-ea1c61f3fad8` |
| SETUP-admin-01 | Invite synthetic admin | POST | 200 | PASS | `8520c7a5-1df4-4f4e-a9dc-a1066cb8a5f4` |
| SETUP-admin-02 | Accept synthetic admin invitation | POST | 200 | PASS | `5d2c6fe6-d9dc-435d-b8c1-962a79b9c1c5` |
| SETUP-admin-03 | Authenticate synthetic admin | POST | 200 | PASS | `9981b5e4-69c5-45b3-a2b1-e4b5ca13a71f` |
| SETUP-patient-04 | Create synthetic linked patient profile patient | POST | 201 | PASS | `ae1ef641-682d-4b4f-973b-fb1396b1d769` |
| SETUP-foreignPatient-04 | Create synthetic linked patient profile foreignPatient | POST | 201 | PASS | `20b9fd10-674a-428f-be34-f9fb84df7186` |
| SETUP-CATALOG-01 | Create clearly synthetic panel | POST | 201 | PASS | `52b9343d-4e2c-4c81-9412-f54b2fc51f8f` |
| SETUP-PARAM-1 | Define synthetic numeric parameter | POST | 201 | PASS | `c7ff1936-2e0f-4702-a4a8-0cd71650745c` |
| SETUP-PARAM-2 | Define synthetic text parameter | POST | 201 | PASS | `1aab2d37-e20c-4e06-a94f-d2c3c8b05180` |
| S3-01 | Create dedicated patient order | POST | 201 | PASS | `ad03b802-6ef8-46b5-a150-874f178eb87b` |
| S3-02 | Create dedicated appointment type | POST | 201 | PASS | `8b4a1d71-3f46-4ebd-bde9-c0538c1fc2b6` |
| S3-03A | Create dedicated capacity-one slot 1 | POST | 201 | PASS | `e11abc18-a802-41b4-bd00-226b2380c6bd` |
| S3-03B | Create dedicated capacity-one slot 2 | POST | 201 | PASS | `9e9bc2b3-05d9-46b4-8c6b-827ee2e6e976` |
| S3-04 | Discover both dedicated slots before booking | GET | 200 | PASS | `0bcea393-da33-41b9-8391-2d7f60b21cbe` |
| S3-05 | Book dedicated slot A | POST | 201 | PASS | `0814da8d-5c4f-418f-adab-6285beb8891d` |
| S3-06 | Capacity after initial booking | GET | 200 | PASS | `7d6dc093-82e1-4b49-bc4d-bd4c62e1debf` |
| S3-07 | Reschedule alternatives exclude current slot | GET | 200 | PASS | `5cbfed31-c787-4dbc-b9a4-4abd1f8ddb3b` |
| S3-08 | Foreign patient cannot read booking | GET | 404 | PASS | `6a3ca4d3-61ad-4f01-9a3c-15b7be0bd52d` |
| S3-09 | Technician cannot list appointments | GET | 403 | PASS | `5e6a4cc4-978a-452e-8339-59e70ccdbb7f` |
| S3-10 | Reschedule to slot B | POST | 200 | PASS | `992f428b-906a-406b-911c-9e9222e1d46b` |
| S3-11 | Exact immediate reschedule retry | POST | 200 | PASS | `d7a6236f-f11c-42d2-9e18-9b458dee1982` |
| S3-12 | Stale conflicting reschedule rejected | POST | 409 | PASS | `b3e34e91-c358-41ab-8cb6-44ec170ec9a0` |
| S3-13 | Reschedule releases A and consumes B | GET | 200 | PASS | `9f477f1a-a832-4e43-947a-76a5700a9754` |
| S3-14 | Cancel moved appointment | POST | 200 | PASS | `15340834-b3e2-4324-9db9-95cc63719880` |
| S3-15 | Cancellation retry retains original metadata | POST | 200 | PASS | `51e47b58-18a2-49e6-9361-8d52919c7584` |
| S3-16 | Cancellation releases capacity once | GET | 200 | PASS | `63791c0b-9100-49ce-b161-72d7040e47ef` |
| S3-17 | Cancelled booking appears in Past | GET | 200 | PASS | `b5db0498-d5da-487b-a1e3-18ff480a74c9` |
| S3-18 | Appointment cancellation leaves order pending | GET | 200 | PASS | `38191ba3-5878-419c-a097-3b9c2d741ce3` |
| S3-19 | Rebook with fresh creation key | POST | 201 | PASS | `3209ace3-66f7-4856-afd7-ab610eed2a32` |
| S3-20 | Rebooking consumes slot capacity | GET | 200 | PASS | `7cb996d8-169c-437e-b6a5-817725035d83` |
| S3-21 | Linked pending order cancellation | POST | 200 | PASS | `c6ddc0c9-be84-47bb-a978-9c486d3c0c74` |
| S3-22 | Linked order cancellation cascades to booking | GET | 200 | PASS | `7461cbfe-1afc-4893-9de8-2acb19a750fe` |
| S3-23 | Order cascade releases capacity | GET | 200 | PASS | `d24bba7e-1202-40c2-a917-f23a94a18f3b` |
| S3-24 | Earlier cancellation metadata survives cascade | GET | 200 | PASS | `5592fbbb-1013-45db-b199-454a71f83345` |
| S3-E01 | Alternatives for supplied confirmed fixture | GET | 200 | PASS | `16970fc5-601a-42ae-b7e4-59e17ad99af8` |
| S3-E02 | Reschedule supplied fixture to dedicated slot A | POST | 200 | PASS | `11511d03-85af-4eeb-a2fa-93c0509a6cfb` |
| S3-E03 | Cancel supplied fixture with staff reason | POST | 200 | PASS | `d67ca172-bb49-4493-b225-71d9d980bd3b` |
| S3-E04 | Rebook supplied test order with fresh key | POST | 201 | PASS | `3d2030f2-424f-4515-8c5a-6b011c75931b` |
| S3-E05 | Cancel supplied linked test order | POST | 200 | PASS | `102d9bdd-bafd-46e7-9879-77c0df4b4c8e` |
| S3-E06 | Creation replay proves supplied booking cascade state | POST | 200 | PASS | `e4081d33-467c-4cc7-9c9d-c83d1cf13e78` |
| S3-E07 | Supplied fixture cascade releases dedicated capacity | GET | 200 | PASS | `2831d692-dfe2-40cb-83d9-bb537eaf2c2d` |
| S4-01 | Create dedicated results order | POST | 201 | PASS | `528f709c-fc5e-43c4-9cac-f0cdaed75e4e` |
| S4-02 | Book arrival-linked appointment | POST | 201 | PASS | `cbe4e07d-3e4b-458f-943d-689eb41ee405` |
| S4-03 | Pending results before any visit | GET | 200 | PASS | `bf241988-1619-40ac-b42f-f17c9e47b189` |
| S4-04 | Record actual synthetic verification arrival | POST | 201 | PASS | `de8ac9a0-e80e-4470-badb-0436b1d85c45` |
| S4-05 | Exact arrival retry returns same visit | POST | 200 | PASS | `26c0ad57-f9e7-4e8d-bcf3-5556ea51aacf` |
| S4-06 | Arrival checks in linked appointment | GET | 200 | PASS | `57e33de5-4cf2-474a-a766-d048ca17251d` |
| S4-07 | Checked-in appointment retains capacity | GET | 200 | PASS | `d6f77ac3-fc44-4941-a5a8-40a876f6500b` |
| S4-08 | Processing order cancellation denied | POST | 409 | PASS | `cbd87eee-acbf-438c-9d6a-6924f9cf1fba` |
| S4-09 | Direct checked-in cancellation denied | POST | 409 | PASS | `ad30408a-f280-4012-837c-fd566100c34d` |
| S4-10 | Patient owns actual visit detail | GET | 200 | PASS | `d0b61fde-3e6c-4521-a064-d0861c1f86d2` |
| S4-11 | Patient visit list is order-filtered | GET | 200 | PASS | `8053e363-45b8-453d-871f-08b223e1c4b0` |
| S4-12 | Foreign patient visit concealed | GET | 404 | PASS | `9bb7b944-10a8-4054-8a8d-4c897f150308` |
| S4-13 | Patient cannot create visit | POST | 403 | PASS | `8691931b-ea84-4e68-8060-c896fb2e5092` |
| S4-14 | Register specimen for actual visit | POST | 201 | PASS | `4ac7f309-1e2f-429d-86ef-9e8658383c1a` |
| S4-15 | Exact specimen registration retry | POST | 200 | PASS | `b300f4ec-c15e-4a1c-81ee-c5da8357e4f5` |
| S4-16 | Generic ADMIN has no clinical specimen access | GET | 403 | PASS | `142a2be3-7754-4845-a383-7a543345d7b7` |
| S4-17 | Receptionist has no clinical specimen access | GET | 403 | PASS | `354217cc-055b-4328-a8fb-02e3ea47bad0` |
| S4-18 | Receive registered specimen | POST | 200 | PASS | `80b336a0-b31b-4411-9555-004386d2ad6b` |
| S4-19 | Attest explicit item suitability | POST | 200 | PASS | `4465213c-fbc4-4e34-b819-e44ac7cd76a7` |
| S4-20 | Authorized reviewer may inspect clinical specimens | GET | 200 | PASS | `1d8171c5-6ffb-492b-a9d9-2e10c915cdfc` |
| S4-21 | Register separate rejection fixture | POST | 201 | PASS | `32d7df95-e901-4cd8-86f0-0bd0d24ffe25` |
| S4-22 | Reject specimen with retained reason | POST | 200 | PASS | `57be391d-b4a1-4bf1-9c98-f11fb580a70d` |
| S4-23 | Register explicit replacement specimen | POST | 201 | PASS | `807eff86-6a11-4552-ad09-90a2bc1635d3` |
| S4-24 | Receive replacement independently | POST | 200 | PASS | `cc3c307f-ca4e-4ba5-80b5-b1eaf36863ca` |
| S4-25 | Attest replacement independently | POST | 200 | PASS | `7932d41c-e02d-47a5-9b55-325effad2bca` |
| S4-26 | Create technician draft with parameter snapshots | POST | 201 | PASS | `b36ba9e7-cde4-4631-962a-9a3013a0ce01` |
| S4-27 | Exact draft creation retry | POST | 200 | PASS | `ce6363c2-26da-4b0f-8d0d-20ee17d0928b` |
| S4-28 | Patient cannot read staff draft endpoint | GET | 403 | PASS | `ed248b23-cd63-4f73-8409-01d4ad9147a1` |
| S4-29 | Patient draft detail concealed | GET | 404 | PASS | `a3ffdd2f-22a7-469d-9fff-dc19f0d09d7a` |
| S4-30 | Patient draft PDF concealed | GET | 404 | PASS | `fd53349b-36df-4883-839f-e8adb24f8fc4` |
| S4-31 | Incomplete draft cannot be approved | POST | 409 | PASS | `194c06e9-4333-4c74-9a6a-a83f8225b8d2` |
| S4-32 | Fill every snapshotted synthetic parameter | PUT | 200 | PASS | `4be81d5d-770c-4c99-9fe1-75bf15617df3` |
| S4-33 | Stale draft revision rejected | PUT | 409 | PASS | `f3fed4fa-6c57-4f5a-8614-f46ac95545a0` |
| S4-34 | Technician author cannot approve | POST | 403 | PASS | `f5b414ed-95ca-498c-b34d-e55e8fe546d0` |
| S4-35 | Generic ADMIN cannot approve | POST | 403 | PASS | `139823d5-6ec0-4aaa-8ce3-06f3d39fa3ea` |
| S4-36 | Reviewer cannot edit technician draft | PUT | 403 | PASS | `119d10b0-595b-44d0-b2fc-4362183a5216` |
| S4-37 | Unapproved draft cannot publish | POST | 409 | PASS | `8c118f55-a2aa-44d4-a82b-c48cadec32f9` |
| S4-38 | Independent authorized reviewer approves | POST | 200 | PASS | `bc50daf0-174b-47bf-a192-70406e490e28` |
| S4-39 | Approved specimen evidence cannot be rejected | POST | 409 | PASS | `52f811c7-d25a-4a3d-be12-dac74c578f04` |
| S4-40 | Approved result remains hidden from patient | GET | 404 | PASS | `b558eccc-6a06-42d1-be58-37518e3f6e14` |
| S4-41 | Editing approval returns result to draft | PUT | 200 | PASS | `b0ed37ca-0857-457c-b433-fb96e0316909` |
| S4-42 | Invalidated approval cannot publish | POST | 409 | PASS | `1bc55789-7761-4b7f-837c-66daa7f03a39` |
| S4-43 | Reapprove invalidated draft independently | POST | 200 | PASS | `de2021d2-f5f7-4d71-a19b-ab3f7d90fee9` |
| S4-44 | Publish approved initial result | POST | 200 | PASS | `1d05a723-dee8-459a-8920-b83bb5030163` |
| S4-45 | Publication alone leaves open-visit order processing | GET | 200 | PASS | `033ed0bc-bda3-4b21-8c70-0701c0832f05` |
| S4-46 | Available results combine search and category | GET | 200 | PASS | `51617eb9-721a-4f4b-968f-72f15a622f02` |
| S4-47 | Pending filter excludes published item | GET | 200 | PASS | `d654b538-8440-4ed8-813a-19f61562c0a5` |
| S4-48 | Second category returns same item once | GET | 200 | PASS | `156afeb4-5687-4c86-bf83-35ad330c57b3` |
| S4-49 | Full published patient detail | GET | 200 | PASS | `6f325563-03fb-4888-8451-a9ac22fd58ef` |
| S4-50 | Foreign published result concealed | GET | 404 | PASS | `b2657477-26e0-4743-93dc-a0cf44388c58` |
| S4-51 | Published result cannot be edited | PUT | 409 | PASS | `4bbb31d6-f533-42f2-a8f4-07d941d9718c` |
| S4-52 | Initial patient publication history | GET | 200 | PASS | `8f23d364-fb80-4fbb-bc45-de8a9c807700` |
| S4-53 | Download actual initial published PDF | GET | 200 | PASS | `e5636845-c9d9-43db-bb51-58652113796a` |
| S4-54 | Foreign patient PDF concealed | GET | 404 | PASS | `95b2a8c7-1970-4c43-b44f-019184740d3d` |
| S4-55 | Complete actual verification visit | POST | 200 | PASS | `ce8830f6-fe35-4ef6-8709-c1d53a696ae0` |
| S4-56 | Visit closure completes linked appointment | GET | 200 | PASS | `408280e6-4368-4f02-85c1-0525d36b4452` |
| S4-57 | Visit closure releases capacity | GET | 200 | PASS | `e94e2958-c015-40bd-93a0-a00a9808f569` |
| S4-58 | Patient visit exposes current published link | GET | 200 | PASS | `464ab493-a24c-4d19-b19e-75fa3b72cd6f` |
| S4-59 | Create correction of current publication | POST | 201 | PASS | `bd7c32aa-0454-49ec-916f-16ff76bd2ef3` |
| S4-60 | Exact correction creation retry | POST | 200 | PASS | `13f7855e-b77e-4f8b-ad9b-04762dc97681` |
| S4-61 | Working correction preserves current publication | GET | 200 | PASS | `ddc4ad55-b4b9-439c-a7fe-ff496116fc9b` |
| S4-62 | Patient history excludes correction draft | GET | 200 | PASS | `2a3a086c-f6a1-400c-94e0-39decec25530` |
| S4-63 | Patient correction draft concealed | GET | 404 | PASS | `48503485-362d-49c5-9241-fbf687ad6f62` |
| S4-64 | Edit complete correction parameter set | PUT | 200 | PASS | `387fb964-c00d-4481-b8fd-ce54b8d8548d` |
| S4-65 | Independently approve correction | POST | 200 | PASS | `4bb6e7ba-2dcd-4ca7-8049-9bdb5b0adfeb` |
| S4-66 | Publish correction atomically | POST | 200 | PASS | `e49506ea-93f2-4893-9d20-5bf4a8c61eee` |
| S4-67 | Patient Available points to correction | GET | 200 | PASS | `bc27d3ab-63af-496b-a776-11eb52a9aceb` |
| S4-68 | Old publication retained and superseded | GET | 200 | PASS | `f0404e29-7388-41e5-bf3d-674c917c87f5` |
| S4-69 | Published history contains both versions only | GET | 200 | PASS | `a32782c5-bc16-495c-9a46-85c9fce293c2` |
| S4-70 | Download superseded initial PDF | GET | 200 | PASS | `4b4f4af0-2d51-49d8-91e6-f54ced32de49` |
| S4-71 | Download current corrected PDF | GET | 200 | PASS | `564ccf22-b180-4ceb-a1f8-ab3bf5509a46` |
| S4-72 | Published evidence remains protected | POST | 409 | PASS | `b4c6eb08-bb8c-4a5a-99f6-aa093b5952eb` |
| S4-73 | Cross-order suitability denied | POST | 409 | PASS | `7488cb5f-d616-4212-bed4-c81c512027cd` |
| S4-74 | Repeated patient result filter rejected | GET | 400 | PASS | `ac7515a5-f363-4ed5-b5e4-4c02f1f17275` |
| S4-75 | String decimal is rejected by strict JSON | PUT | 400 | PASS | `8946ee81-e0fd-407f-81f7-915055e45c50` |
| S4-N01 | Create dedicated no-show order | POST | 201 | PASS | `87534623-0e28-450e-bfd3-f8c3bf853d44` |
| S4-N02 | Publish near-term real-time no-show fixture | POST | 201 | PASS | `405fe5e0-7fdd-42a0-b875-8cf782063502` |
| S4-N03 | Book dedicated no-show fixture | POST | 201 | PASS | `3095b4a0-35fa-47bf-8eae-aa89145dcf13` |
| S4-N04 | No-show before actual slot end denied | POST | 409 | PASS | `01acfc65-5766-4534-afc8-532d40012633` |
| S4-N05 | Mark actual elapsed unvisited appointment no-show | POST | 200 | PASS | `22049dba-e8e5-48dd-ae26-1f73810ea3cc` |
| S4-N06 | No-show retry preserves version | POST | 200 | PASS | `d3a638a1-a5de-4001-9110-aea43f108845` |
| S4-N07 | No-show appears in patient Past | GET | 200 | PASS | `4cbd67ba-0c75-4bf8-b86d-ac08d60ab8c2` |
| S4-N08 | No-show releases actual elapsed slot capacity | GET | 200 | PASS | `105a454f-2c46-46a7-9c21-36a7a3a44858` |
| S4-N09 | Retain no-show fixture while cancelling its pending test order | POST | 200 | PASS | `fa2a57c8-521d-47b5-8001-f5e94ca14f72` |
| S4-N10 | Order cleanup retains no-show appointment history | GET | 200 | PASS | `2eab316e-e173-4470-b61a-8672fd8cac34` |
| S4-F01 | Final current publication after original email settings restored | GET | 200 | PASS | `e57ca752-1370-486c-8446-5823b2552b57` |
| S4-F02 | Final staff read of retained original version | GET | 200 | PASS | `e8a96538-eaa0-40c5-bb7f-94d40764519c` |
| S4-F03 | Independent reviewer clinical grant survives restart | GET | 200 | PASS | `8aaf39ac-7ccd-457b-abdb-90cb167dbfb3` |

## Stage 4 verification (2026-10-30)

Branch backend-hmood. Initial pending-decision documentation is preserved; the
owner approved S4-RES-D01–D05 on 2026-10-29. Before coding, inspected V4/V6/V7/V8,
LabTest/OrderItem mappings and retained FKs, catalog/order repositories and their
snapshot/persistence/migration tests. No parallel catalog was introduced.

Independently reverified the saved disposable PostgreSQL 16 cluster: pg_ctl and
loopback listener PID 17724; psql confirmed smartlims_auth_regression, postgres,
127.0.0.1:55432 and actual data_directory
C:/Users/hmood/AppData/Local/Temp/smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df,
matching saved SMARTLIMS_TEST_POSTGRES_DATA and process -D. Development service
PID 5464 is separate and was not accessed. Unchanged local Maven mapping/Surefire
guard selects only that isolated URL. Synthetic data and fake email; compatibility
tests create/drop only their own guarded smartlims_migration_* databases.

Task 20 initial focused command:
`.\mvnw.cmd '-Dtest=LaboratoryFoundationTest,AppointmentMigrationTest' test`.
6/6, zero failures/errors/skips, BUILD SUCCESS, exit 0; 41.615 s; finished
2026-10-30 00:03:10 +02:00. Verified fresh/upgrade V9 migrations, all new ORM
mappings, existing catalog/parameter identity and retained FKs, role/input/revision
checks, explicit reviewer allowlist and current-role/eligibility enforcement.
Additional used-definition/V8-row preservation evidence follows. No full-suite
or deployment claim yet; V1–V8 and existing dependency versions are unchanged.

Task 20 completion: `.\mvnw.cmd '-Dtest=LaboratoryFoundationTest,ResultMigrationTest' test`
— 6/6, zero failures/errors/skips, BUILD SUCCESS, exit 0; 34.882 s; finished
2026-10-30 00:05:07 +02:00. Used-definition immutability/deactivation and invalid
value-type constraint verified. V8-to-V9 upgrade retained actual synthetic catalog,
categories, patient/order/item, appointment type/slot/booking rows and every V1–V8
migration metadata row; new clinical tables remain empty. Task 20 DONE.

Task 21: `.\mvnw.cmd '-Dtest=VisitWorkflowTest,AppointmentBookingTest,AppointmentCancellationTest,AppointmentRescheduleTest' test`
— 27/27 (6 new visit + 21 appointment), zero failures/errors/skips, BUILD SUCCESS,
exit 0; 52.868 s; finished 2026-10-30 00:10:15 +02:00. Real arrival/visit-item links,
owned administrative detail, actual order visit availability, PENDING→IN_PROGRESS,
CHECKED_IN shared occupancy/direct-action blocking, visit/appointment completion
without invented result completion, no-show end/visited guards, exact creation
retry, cross-order/role/ownership rejection, arrival-versus-cancel and aggregate
rollback pass. Task 21 DONE; no full-stage/deployment claim.

Task 22: `.\mvnw.cmd '-Dtest=SampleWorkflowTest' test` — 5/5, zero
failures/errors/skips, BUILD SUCCESS, exit 0; 38.566 s; finished 2026-10-30
00:14:04 +02:00. Explicit receipt/suitability and actual visit/item links,
separate nullable collection time, clinical authority, cross-order rejection,
required rejection reasons, retained receipt/replacement history, exact creation
retry, concurrent receipt and receipt/attestation rollback pass. Task 22 DONE.

Task 23: `.\mvnw.cmd '-Dtest=ResultDraftTest' test` — 5/5, zero failures/
errors/skips, BUILD SUCCESS, exit 0; 39.263 s; finished 2026-10-30 00:19:37 +02:00.
Verified existing parameter/unit/method/required snapshots do not follow catalog
changes, decimal values and explicitly supplied references/flags, real visit/
definition prerequisites, technician-only authorship, patient staff-route denial,
strict JSON, exact retry, concurrent creation/value-only edits, incomplete parameter
sets and transaction rollback. Task 23 DONE.

Task 24: `.\mvnw.cmd '-Dtest=ResultPublicationTest' test` — 10/10, zero
failures/errors/skips, BUILD SUCCESS, exit 0; 41.890 s; finished 2026-10-30
00:23:13 +02:00. Independent explicit reviewer policy (including author role change),
required measurements and received/attested specimen prerequisites, approval
invalidation/protected evidence, immutable published patient/value/specimen/
attribution snapshots and SQL child/event guards, reasoned corrections/retry/current
swap, all-item/all-visit order completion, publication/visit-close and approval/
rejection contention, atomic replacement rollback pass. Task 24 DONE.

Task 25: `.\mvnw.cmd '-Dtest=PatientResultListTest' test` — 5/5, zero failures/
errors/skips, BUILD SUCCESS, exit 0; 38.927 s; finished 2026-10-30 00:26:01 +02:00.
Tab membership/pre-visit pending, per-item/repeated-test identity, publication date/
actions, real visit linkage, correction draft/current publication, cancelled pending
omission/published retention, literal percent/underscore/backslash search, current
multi-category filtering/unique totals, paging/large offsets, strict queries,
ownership/profile absence and clinical-only staff queue pass. Task 25 DONE.

Task 26: initial PatientResultReportTest runs passed 4/4 at 00:34:55 (44.039 s)
and 00:39:01 (1:06), but visual review rejected Arabic shaping despite successful
Unicode extraction/font embedding. Diagnostic typography rendering isolated the
bundled font's shared default GSUB/KUR language-table offset. Selecting that exact
default alias restored contextual joining; no font bytes or clinical content changed.
Two intermediate local typography-test compilation failures (wrong diagnostic
interface package at 00:47:36, UTF-8 BOM at 00:52:28) were corrected; neither was
a passing verification or database test execution. Diagnostic-only render checks
were not used to mark acceptance complete.

Final focused command:
`.\mvnw.cmd '-Dtest=ReportTypographyTest,PatientResultReportTest' '-Dsmartlims.report.qa-dir=tmp/pdfs' test`
— **6/6**, zero failures/errors/skips, BUILD SUCCESS, exit 0; **38.846 s**;
finished **2026-10-30 00:53:27 +02:00**. Owned published/superseded details/history,
same-404 foreign/unpublished reports (including PDF Accept), complete snapshots,
12-parameter multipage output/last content, XML escaping, embedded fonts,
regular/bold lam-alef single-glyph regression, supplied local identity/logo and
external/invalid-logo denial pass. Rendered and visually inspected both complete
synthetic report pages plus the regular/bold Arabic ligature page: Arabic joining,
mixed direction, labels, content, margins and page breaks accepted with no clipping.
QA contains only synthetic data and is optional via the explicit property. Task 26
DONE. Full-stage suite and deployment remain separate.

Task 27 focused security/concurrency: `.\mvnw.cmd '-Dtest=LaboratoryConcurrencySecurityTest' test`
— 3/3, zero failures/errors/skips, BUILD SUCCESS, exit 0; 33.721 s; finished
2026-10-30 00:55:13 +02:00. Arrival/no-show contention leaves exactly one actual
outcome/event, duplicate concurrent publication leaves one current version and
publication event, cookie draft/review writes require CSRF, and disabling the
reviewer invalidates the prior JWT before publication. Full suite follows after
final source/contract review.

Task 27 final verification: independently rechecked pg_ctl status, process -D,
loopback listener and an explicit psql connection immediately before the full run.
PostgreSQL 16.15 PID 17724, 127.0.0.1:55432/smartlims_auth_regression, postgres;
actual data_directory matched saved SMARTLIMS_TEST_POSTGRES_DATA:
C:/Users/hmood/AppData/Local/Temp/smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df.
Development service PID 5464 was distinct and untouched. The unchanged machine-local
Maven/Surefire URL and isolation guard selected only this disposable instance.
Compatibility tests used only their own guarded smartlims_migration_* databases.

Ran directly from Backend, branch backend-hmood, after all production/test changes:

```powershell
.\mvnw.cmd test
```

**319 tests across 44 suites, 0 failures, 0 errors, 0 skips; BUILD SUCCESS, exit 0.**
Finished **2026-10-30 01:02:18 +02:00**; Maven duration **3 minutes 31 seconds**.
All 44 Surefire XML reports were freshly written (00:59:13–01:02:18), independently
parsed and summed to 319/0/0/0. This is one green complete invocation on final code.
No follow-up code fix/rerun was needed for this invocation. Earlier focused-run
compile/visual issues remain explicitly recorded above, not erased by this pass.

| Group | Suites | Passing tests |
|---|---:|---:|
| Existing appointments | 7 | 37 |
| Existing authentication/provisioning/browser security | 7 | 55 |
| Existing catalog | 6 | 43 |
| Existing orders | 8 | 73 |
| Existing patients/linking/migration compatibility | 5 | 64 |
| Application context | 1 | 1 |
| New Stage 4 laboratory/results/visits/specimens/reports | 10 | 46 |
| Total | 44 | 319 |

Stage acceptance review:

| Requirement | Outcome |
|---|---|
| S4-RES-R01/R02 list and screen fields/actions | PASS: owned per-item tabs, pre-visit pending/cancelled omission/published retention, original names/current categories, literal search, deterministic unique counts/pages, zone report date and real action/visit eligibility. |
| S4-RES-R03 published details/history/reports | PASS: same-404 ownership/unpublished concealment, complete snapshots, immutable versions/atomic replacement, superseded access, authorized PDF with supplied data, Arabic joining/bidi and accepted visual layout. |
| S4-RES-R04 real visits | PASS: explicit staff-recorded selected-item links, one order/multiple visits, unique optional appointment, owned details and authorized publication links; no fabricated attendance/payment data. |
| S4-RES-R05/R06 clinical workflow/foundations | PASS: ADMIN definitions, technician drafts, explicit independently authorized ADMIN review, approval invalidation, reasoned corrections, received/attested same-order specimen evidence and retained rejection/replacement events; no clinical seeds/automatic interpretation. |
| S4-RES-R07 security/consistency | PASS: strict inputs/roles/ownership/CSRF/current eligibility; retry/stale-write/rollback and booking, arrival/cancel/no-show, edit/approve/publish/reject/visit-close contention; correct active capacity and all-items/all-visits order completion. |
| S4-RES-R08 preservation/evidence | PASS: 273 existing plus 46 new cases green in the same full run. V8-to-V9 synthetic rows/FKs/history preserved. V1–V8, isolation guard and local Maven mapping unchanged. Exact manual HTTP bodies/routes in RESULTS_API.md. |

Task 27 and Stage 4 DONE. Diff/encoding/whitespace review passed, including all new
text files. Existing test edits only extend explicit fixture cleanup and latest
migration expectations; no behavioral assertions/guards were weakened. No frontend,
Postman artifact/tool/client, unrelated stage, commit/push or deployment. Optional
synthetic PDF QA files were removed after visual inspection; tests regenerate them
only with the explicit QA property. The implementation plan remains local-only.

Remaining handoff: owner manual HTTP checks/review/commit and environment deployment.
No implementation blocker remains. Configure eligible reviewer ADMIN UUIDs explicitly;
blank grants no clinical review. Clinical definitions/references/specimen attestations
and optional identity/logo must be supplied by authorized people. No live HTTP-server
flow, external email delivery or development/production V9 application is claimed.

## Stage 3 verification (2026-10-29)

Current branch backend-hmood. The saved disposable PostgreSQL 16 cluster was stopped;
restarted only its resolved temporary directory, confirmed pg_ctl PID 17724,
postmaster.pid/data directory and actual psql current_setting('data_directory') all
match C:/Users/hmood/AppData/Local/Temp/smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df.
psql independently confirmed smartlims_auth_regression, postgres and loopback
127.0.0.1:55432; listener belongs to PID 17724. Development Windows service is a
separate PID 5464 and was not a target. Unchanged .mvn/maven.config/Surefire mapping
selects that guarded URL. Synthetic fixtures, fake email; no application defaults.
Compatibility tests own only newly created smartlims_migration_* databases.

Initial focused command: `.\mvnw.cmd '-Dtest=AppointmentScheduleTest' test`.
Result: 6 tests, 1 failure/2 errors, finished 2026-10-29 23:01:23 +02:00,
53.643 s, exit 1. Three fixtures generated nanosecond timestamp strings, correctly
rejected by the contract's microsecond precision validation. Normalized synthetic
fixture timestamps to microseconds; production validation was preserved. Corrected
schedule/migration run and later slice evidence will be recorded below.

Corrected Task 13 run: `.\mvnw.cmd '-Dtest=AppointmentScheduleTest,AppointmentMigrationTest' test`.
8 tests, 0 failures/errors/skips; BUILD SUCCESS; exit 0, 33.091 s, finished
2026-10-29 23:02:21 +02:00. Fresh/upgrade migrations, no seeded schedule, legacy
checksum/data preservation, DB overlap/positive-capacity constraints and concurrent
slot publication verified. Additional occupied-capacity persistence coverage follows.

Task 13 expanded check: `.\mvnw.cmd '-Dtest=AppointmentScheduleTest' test`.
7/7, zero failures/errors/skips, BUILD SUCCESS, exit 0, 29.592 s, finished
2026-10-29 23:03:30 +02:00. Added occupied-capacity rejection, active-order partial
uniqueness, retained slot FK and type-name snapshot verification. Task 13 DONE;
no full-suite or deployment claim.

Task 14: `.\mvnw.cmd '-Dtest=AppointmentBookingTest' test` — 6/6, zero
failures/errors/skips, BUILD SUCCESS, exit 0; 35.056 s; finished 2026-10-29
23:05:28 +02:00. Verified linked ownership/staff unlinked target, initial response,
retained PENDING order, original-intent retry, strict JSON/header validation,
availability filtering/counts, shared capacity, active-order and patient overlap,
concurrent last-capacity allocation and same-key retry. Task 14 DONE.

Task 15: `.\mvnw.cmd '-Dtest=AppointmentReadTest' test` — 4/4, zero
failures/errors/skips, BUILD SUCCESS, exit 0; 33.731 s; finished 2026-10-29
23:06:58 +02:00. Grouping uses one captured now with complementary predicates;
patient ownership, tab paging/counts/large offsets, retained snapshot, Asia/Jerusalem
winter/summer offsets/date rollover and action flags pass. Task 15 DONE.

Task 16: `.\mvnw.cmd '-Dtest=AppointmentRescheduleTest' test` — 6/6, zero
failures/errors/skips, BUILD SUCCESS, exit 0; 35.877 s; finished 2026-10-29
23:08:36 +02:00. Alternatives/capacity, retained identity/type/snapshot/original
retry, exact move repeat, stale revision, staff/owner permissions, old-slot release,
non-PENDING/started/patient-overlap rejection, transaction rollback and concurrent
last-place movement pass. Task 16 DONE.

Task 17: `.\mvnw.cmd '-Dtest=AppointmentCancellationTest,OrderCancellationTest' test`
— 24/24 (9 appointment + 15 existing order), zero failures/errors/skips,
BUILD SUCCESS, exit 0; 41.761 s; finished 2026-10-29 23:11:14 +02:00. Retained
metadata/repeats, strict reasons/privacy, capacity release/rebooking, original
cancelled history, post-start order cascade, atomic order/appointment rollback and
book/move/cancel/order races pass. Expected synthetic-trigger rejection from the
existing order rollback test is not a suite failure. Task 17 DONE.

Task 18 additional focused check: `.\mvnw.cmd '-Dtest=AppointmentConcurrencyTest' test`
— 3/3, zero failures/errors/skips, BUILD SUCCESS, exit 0; 28.725 s; finished
2026-10-29 23:13:43 +02:00. Concurrent different orders for the same patient cannot
double-book despite spare capacity; booking versus reschedule cannot overbook or
lose the existing booking; cookie appointment writes require matching CSRF while
bearer transport remains exempt. All 37 new appointment cases have passed focused
runs; this cumulative statement is not yet full-suite evidence.

Pre-full check at 23:14 +02:00 reverified actual PostgreSQL data directory, guarded
database, loopback address/port and listener PID 17724. V1–V7, POM and local Maven
mapping remain unchanged; git diff --check passes. Existing test modifications are
limited to explicit cleanup tables for retained V8 FKs and expected latest migration
counts/history. No guard or existing behavioral assertion was removed or weakened.

Final direct full invocation from Backend, branch backend-hmood:

```powershell
.\mvnw.cmd test
```

**273 tests across 34 suites, 0 failures, 0 errors, 0 skips; BUILD SUCCESS;
exit 0.** Finished **2026-10-29 23:16:44 +02:00**; Maven duration **2 minutes
13 seconds**. All 34 Surefire XML reports were freshly written by this invocation
(appointment reports 23:14:54–23:15:07); independent XML totals match Maven.

| Suite group | Suites | Passing tests |
|---|---:|---:|
| New appointments: booking 6, cancellation 9, concurrency/browser security 3, migration 2, reads 4, reschedule 6, schedule/persistence 7 | 7 | 37 |
| All existing authentication, provisioning, browser security, patient/linking, catalog, orders, migration and application-context suites | 27 | 236 |
| Total in one final invocation | 34 | 273 |

| Stage acceptance | Result/evidence |
|---|---|
| Booking/types/availability | PASS: explicit staff schedule, active type discovery, owned PENDING order admission, no seeds/hours, strict inputs and original-intent retry. |
| Upcoming/Past/table/actions | PASS: complementary grouping at captured now, retained future cancellations/past CONFIRMED rows, Asia/Jerusalem winter/summer offsets and date rollover, snapshot type, ID/status and action eligibility, accurate paging and ownership privacy. |
| Reschedule | PASS: valid alternatives, retained type/ID/history, exact immediate retry/stale revision handling, full/overlapping/started/non-PENDING rejection, old/new capacity atomicity and rollback. |
| Cancellation/order integration | PASS: retained original metadata, staff reasons/repeat validation, once-only release, rebooking and atomic linked order cascade including past slots; no reverse cancellation. |
| Concurrency/security | PASS: last-capacity competition, same-key retries, cross-order patient conflict, booking versus move, concurrent moves/cancels/order cascade, JWT roles/ownership and cookie CSRF. |
| Schema/data/regressions | PASS: V8 fresh/upgrade/constraints, retained rows/FKs/snapshots, V1–V7 migration history preserved; all 236 existing cases pass with V8 cleanup/history expectations. |
| Scope/docs/handoff | PASS: all 13 method/path mappings matched to contract/security/service/DTOs; no deferred visit workflow or other stage; exact manual requests in APPOINTMENTS_API.md section 7. |

Task 18 and Stage 3 are **DONE**. This is one green final complete invocation,
not a cumulative substitute. Earlier focused fixture failures remain recorded
above. Only documentation/status evidence changed after the final full run; no
application/test code changed. git diff --check passes. V1–V7, dependencies,
isolation guard, machine-local Maven mapping and local exclusions are preserved.
No Postman use/artifacts, frontend changes, staging, commit, push or next-stage work.

Owner manual HTTP verification/commit are separate. A live network application,
development/production application of V8, real email and deployment readiness were
not verified. Check-in/completion/no-show remain intentionally deferred. No Stage 3
acceptance gap remains. Appointment mutations intentionally serialize for one lab
using a database coordination row; this is a throughput tradeoff, not a capacity
counter or a replacement for order/slot locks. Any future workflow writing these
records must follow the documented lock order and capacity rules.

## Historical setup and earlier evidence

SDLC traceability: R-NFR-01 and per-task acceptance in [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). The run records below are historical evidence; this 2026-10-27 documentation review did not run tests, start the application, or check current database/server availability. A future implementation task must record its own command, isolated target, date, counts and result before DONE. The separately recorded development recovery is described in [DATABASE_DESIGN section 1.1](DATABASE_DESIGN.md#11-implemented-migrations-and-recorded-reconciliation).

The integration suites require an explicitly disposable PostgreSQL instance with a
database named `smartlims_auth_regression`, accessed on loopback as `postgres` with
an empty password. Their fixtures truncate application tables. Do not use a
development or shared database. Start and prepare the disposable instance separately.

## Configured local instance (2026-10-27)

A fresh PostgreSQL 16.15 cluster is running separately from the development service:

- Listener: `127.0.0.1:55432` only.
- Database: `smartlims_auth_regression`; user: `postgres`; empty password, with
  trust authentication restricted to IPv4 loopback on this disposable cluster.
- `SMARTLIMS_TEST_DATABASE_URL` is saved in the current Windows user's environment
  as `jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression`.
- `SMARTLIMS_TEST_POSTGRES_DATA` is saved in the same environment and identifies
  this cluster's fresh temporary data directory, outside the repository.
- No development role privileges or application connection variables were changed.

Connectivity was verified against this isolated instance, including its actual data
directory, database, user, listener, and port. At original setup the database had
zero application tables. Test runs apply and validate Flyway migrations only in
this isolated cluster; development data and migration files remain unchanged.

## Direct Maven Wrapper execution

From Backend, run the complete suite directly:

```powershell
.\mvnw.cmd test
```

This machine has an explicitly configured `.mvn/maven.config` containing:

```text
-Dsmartlims.test.database.url=jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression
```

The file is machine-local and excluded through `.git/info/exclude`; it contains
only the isolated URL, with no credentials. Maven reads it on every invocation,
including from a terminal that has not inherited the Windows user environment.
Do not add database credentials or a development URL to this file.

The POM maps `smartlims.test.database.url` into Surefire's forked test JVM as
`SMARTLIMS_TEST_DATABASE_URL`. The property defaults to the Maven process's
`SMARTLIMS_TEST_DATABASE_URL` environment value when there is no explicit Maven
property. A local Maven configuration or command-line property takes precedence.
There is no database URL default in the tracked POM. Without an explicit isolated
target, the existing Java guard still fails before datasource startup.

For another machine without the local Maven file, explicitly configure the
isolated target through the environment or a Maven property, for example:

```powershell
.\mvnw.cmd '-Dsmartlims.test.database.url=jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression' test
```

The isolated PostgreSQL cluster must already be running. IsolatedPostgresTest
supplies the test-only `postgres` username and empty password; application
connection settings are never used as a fallback. The full suite also creates
and removes its own `smartlims_migration_*` databases on this same isolated cluster.

To select a single suite, pass Surefire's test selector directly to the wrapper:

```powershell
.\mvnw.cmd '-Dtest=RegistrationTest' test
```

## Reconciliation test fixture

The guarded reconciliation SQL is retained unchanged at
[`src/test/resources/db/fixtures/reconcile-patient-linking-v4-to-v5.sql`](../src/test/resources/db/fixtures/reconcile-patient-linking-v4-to-v5.sql).
`PatientMigrationCompatibilityTest` loads it from the test classpath and executes
it only in newly created `smartlims_migration_*` databases on the isolated cluster.
The fixture is outside Flyway migration locations and is not packaged with the
application's main resources. Its database-name, connected-client, checksum,
locking, timeout, and single-row safeguards remain in place. Any manual use
outside disposable tests still requires the explicit authorization and verified
backup described in the [reconciliation runbook](PATIENT_LINKING_V5_RECONCILIATION.md).

## Restarting the isolated PostgreSQL cluster

The isolated server is a user process, not an automatically starting Windows
service. After a reboot or manual shutdown, start this cluster before testing:

```powershell
$testPgData = [Environment]::GetEnvironmentVariable('SMARTLIMS_TEST_POSTGRES_DATA', 'User')
& 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe' -D $testPgData -l (Join-Path $testPgData 'server.log') -w start
```

The cluster is disposable and its temporary directory can be removed by system
cleanup. If that happens, provision a fresh isolated cluster and update the two
user environment values; do not reuse a development database.

## Process environments and IntelliJ

Saving a Windows user environment value also does not update an already running
terminal, IDE, or agent. A child process inherits its parent's environment, not a
fresh copy of the current Windows user settings. Opening a new IntelliJ terminal
tab can therefore inherit the same old environment from IntelliJ. Without the
local Maven configuration, Maven and the Java tests only see that inherited
process environment.

The local Maven file and Surefire mapping fix direct wrapper execution without
restarting IntelliJ. For IntelliJ's Maven tool window, enable **Use settings from
.mvn/maven.config** under **Build, Execution, Deployment > Build Tools > Maven**,
select the Maven wrapper, and reload the Maven project. Alternatively, set the
`smartlims.test.database.url` property explicitly in the Maven run configuration.
See [IntelliJ Maven settings](https://www.jetbrains.com/help/idea/maven-support.html).

If relying solely on Windows environment inheritance instead, fully exit and
restart IntelliJ from a process with the updated environment; also restart a
stale parent launcher such as Toolbox if applicable. Closing a terminal tab or
reloading Maven does not refresh IntelliJ's own inherited environment. Direct
IntelliJ JUnit runs do not use Surefire or `.mvn/maven.config`; set the guarded
`SMARTLIMS_TEST_DATABASE_URL` in that JUnit run configuration, or restart the IDE
so it inherits the variable. No system-wide environment change is required for
the direct-wrapper solution above.

## Diagnosing context startup failures

If Surefire reports `ApplicationContext failure threshold (1) exceeded`, inspect
the first `Failed to load ApplicationContext` and its `Caused by` chain.

The 2026-10-27 reports contain 108 errors: five original failures at
`IsolatedPostgresTest.isolatedProperties` with `IllegalStateException: An explicitly
isolated regression database is required.`, and 103 cascading threshold errors.
The guard rejects a missing or incorrectly formatted isolated database URL before
datasource/Flyway startup. The variable was absent in the environment inspected
during diagnosis. The environment condition on the abstract test base is not
inherited by subclasses; do not rely on it to skip database-backed suites when
configuration is absent. Supply the required isolated database configuration instead.

The guard remains enforced, with a more actionable message. No tests,
database connections, or migrations were run during the original diagnosis.
The subsequent isolated setup above configured the required URL. A complete run
then eliminated the context errors and exposed a separate missing reconciliation
SQL artifact, already referenced by the compatibility tests and reconciliation
runbook. Restoring that guarded SQL resolved all six migration compatibility tests
without changing their assertions or any applied migration file. Its test executions
use only newly created `smartlims_migration_*` databases on the isolated cluster;
the development reconciliation procedure was not run during that verification.

## Earlier verification (2026-10-27)

The affected compatibility suite passed all six tests. The final complete run on
the final code then succeeded from a fresh PowerShell process using the former
launcher's saved-user environment fallback. Use direct Maven wrapper execution
as documented above for current runs.

Maven reported **141 tests, 0 failures, 0 errors, 0 skips**, `BUILD SUCCESS`, in
53.399 seconds (finished at 16:28:50 +02:00). The test JVM's Flyway/Hibernate logs
confirmed `jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression`. All six
migration compatibility cases executed, including wrong-database, checksum, and
connected-client rejection plus data/metadata preservation. Existing assertions,
the isolation guard, password policy, and applied migration files were unchanged.

## Direct-wrapper verification (2026-10-27, after the earlier pass)

Before the Maven mapping was added, direct `.\mvnw.cmd test` reproduced the latest
failure: 141 tests, 108 errors, 6 skips. Its first startup cause was the missing
process-level `SMARTLIMS_TEST_DATABASE_URL`, despite a valid saved Windows user
value. The threshold errors were consequences of that startup failure.

After configuring the explicit local Maven target and the Surefire environment
mapping, an invalid `smartlims.test.database.url` was verified to fail the
existing guard before datasource startup. The final complete verification used
the wrapper directly, with the parent process's test URL still unset:

```powershell
.\mvnw.cmd test
```

Result: **141 tests across 17 suites, 0 failures, 0 errors, 0 skips**,
`BUILD SUCCESS`, finished at 17:08:10 +02:00 in 1 minute 5 seconds. This was a
separate direct-wrapper run. The test JVM's database logs confirmed the isolated
cluster on `127.0.0.1:55432`. No development
data, applied migration file, test assertion, isolation guard, password policy,
or context failure threshold was changed for this fix.

## Verification after launcher removal (2026-10-27)

After moving the SQL unchanged into test resources, updating the compatibility
test to load it from the classpath, and removing the redundant launcher and its
directory, the complete suite ran once with `.\mvnw.cmd test` using the unchanged
local Maven configuration.

Result: **141 tests across 17 suites, 0 failures, 0 errors, 0 skips**,
`BUILD SUCCESS`, exit code 0, finished at 17:29:52 +02:00 in 1 minute 4 seconds.
All six migration compatibility tests passed. Database logs confirmed the isolated
cluster on `127.0.0.1:55432`; reconciliation tests used only their newly created
`smartlims_migration_*` databases. No development database reconciliation was run.
SHA-256 checks confirmed that the SQL fixture's contents, main Flyway migrations,
local Maven test configuration, pre-existing POM/isolation-guard changes, and
retained database backup files were preserved.

## Task 2 category persistence verification (2026-10-28)

Scope: Stage 1 Task 2 only, extending R-CAT-01/R-NFR-01 and S1-CAT-R01/R04.
V6 adds category persistence; DTOs, controllers, services, query filters, and
availability permissions remain unchanged. This record is separate from the
earlier full-suite runs above. The complete suite was not run for Task 2.

Before testing, inspected the configured temporary cluster's postmaster files,
postgresql.conf and pg_hba.conf; pg_ctl confirmed it was stopped. Started only
that disposable cluster. An explicit psql connection to
127.0.0.1:55432/smartlims_auth_regression confirmed PostgreSQL 16.15, user
postgres, matching SMARTLIMS_TEST_POSTGRES_DATA directory ending in
smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df, and loopback-only
listen_addresses. A separate listener inspection also confirmed 127.0.0.1:55432.
The unchanged machine-local Maven config and Surefire mapping selected this
guarded database. No application datasource defaults or smart_lims_db connection
were used. Migration suites created/dropped only their own generated
smartlims_migration_<32 hex characters> databases on this same isolated instance.
Persistence tests use rollback transactions and fake VerificationEmailSender.

Exact initial command, from Backend:

```powershell
.\mvnw.cmd '-Dtest=LabTestCategoryMigrationTest,LabTestCategoryPersistenceTest,LabTestManagementTest,PatientMigrationCompatibilityTest' test
```

Initial result: 20 tests, 0 assertion failures, 3 errors, 0 skips; exit 1,
finished 2026-10-28 00:02:52 +02:00. All four category migration, seven catalog,
and six patient migration compatibility cases passed. The three new persistence
cases hit the existing lab_tests_code_check because their UUID-derived synthetic
codes contained lowercase letters. Corrected only the synthetic factory with
Locale.ROOT uppercase; production validation and test assertions were preserved.

Reran only the affected suite:

```powershell
.\mvnw.cmd '-Dtest=LabTestCategoryPersistenceTest' test
```

Result: **3 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 2026-10-28 00:03:44 +02:00 in 30.483 seconds. No production code or
other tested suite changed after the initial execution. Final per-suite results
are therefore 20 distinct passing cases across these two invocations, not a
single green 20-test Maven invocation:

| Suite | Passing cases | Verification |
|---|---:|---|
| LabTestCategoryMigrationTest | 4 | Fresh V1-V6 and indexes; V5 upgrade with every catalog field/timestamp and prior Flyway metadata unchanged; repeat migration no-op; duplicate/invalid/null/orphan constraints; concurrent duplicate insertion |
| LabTestCategoryPersistenceTest | 3 | Hibernate schema validation; round trips for zero/one/multiple/shared/all-seven categories; removal/clearing without removing the test; current PUT/status operations preserve assignments |
| LabTestManagementTest | 7 | Current catalog HTTP/security/search/pagination/concurrency behavior; create/detail JSON still omit categories; FK-aware isolated fixture cleanup |
| PatientMigrationCompatibilityTest | 6 | Existing fresh/upgrade/reconciliation and guard checks with V6 included in expected history; all assertions retained |

Post-run read-only checks on the guarded regression database confirmed successful
V6 history and zero remaining owned migration databases. SHA-256 comparisons
confirmed 116 captured files unchanged, including V1-V5, local Maven
configuration, isolation guard, application API files, unrelated documentation,
and local-only exclusions. git diff --check passed. Task 2 is DONE; no
development/production migration or readiness was verified.
Tasks 3-5 (array DTOs/assignment, membership queries and patient inactive-test
restrictions) remain TODO and were not implemented or tested as target behavior.


## Task 3 administrative category assignment verification (2026-10-28)

Scope: Stage 1 Task 3 only; R-CAT-01/R-NFR-01 and S1-CAT-R01/R03/R04,
using DONE Task 2 persistence and the finalized category contract. POST accepts
optional categories; PUT replaces/clears the complete set within the existing
row-lock transaction. Every response includes all assignments in contract order
or []. PATCH status, ADMIN-only writes, authentication and CSRF are preserved.
Tasks 4-5 membership filters/patient inactive-test restrictions remain TODO.

Before execution, independently inspected the saved temporary test data directory,
postmaster files, postgresql.conf and pg_hba.conf. pg_ctl reported no running
server and no 55432 listener was present; started only that disposable cluster.
PostgreSQL recovered from its prior interrupted shutdown and became ready.
An explicit psql connection confirmed PostgreSQL 16.15, current_database
smartlims_auth_regression, user postgres, server/listen_addresses 127.0.0.1,
port 55432, and the exact temporary data directory ending in
smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df. A separate listener
inspection matched 127.0.0.1:55432 and that cluster's postgres process. The
unchanged local Maven config/Surefire mapping selected this guarded target.
No smart_lims_db connection or application datasource fallback was used.
Database-backed tests use synthetic fixtures and fake VerificationEmailSender;
management fixtures truncate only the guarded regression database, while the
persistence suite uses rollback transactions. No compatibility database was
created. Flyway validated all six existing migrations and reported V6 current,
with no migration necessary; Hibernate schema validation succeeded.

Exact initial command from Backend:

```powershell
.\mvnw.cmd '-Dtest=LabTestRequestTest,LabTestServiceTest,LabTestErrorHandlerTest,LabTestCategoryPersistenceTest,LabTestManagementTest' test
```

Initial result: **28 tests, 3 failures, 0 errors, 0 skips; BUILD FAILURE**,
exit 1, finished 2026-10-28 16:23:11 +02:00 in 1 minute 1 second.
All 18 request/service/error-handler/persistence cases passed. Seven of ten
management cases passed. Two new assertions hit Spring JsonPath's conversion
of immutable expected Lists into their concrete implementation type, yielding
null during assertion conversion; switched to Hamcrest equality to compare
arrays directly without conversion. The anonymous-write setup also incorrectly
expected 401 before satisfying existing CSRF protection (which returns 403
first). Supplied valid CSRF without an access token to reach and assert 401.
These were test-only corrections; no production/security change followed the
initial run, and the full array/order and authentication assertions are retained.

Reran only the affected suite:

```powershell
.\mvnw.cmd '-Dtest=LabTestManagementTest' test
```

Result: **10 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 2026-10-28 16:25:51 +02:00 in 52.869 seconds. Final evidence covers
**28 distinct passing cases across these two invocations**, not a single green
28-test Maven invocation:

| Suite | Passing cases | Evidence |
|---|---:|---|
| LabTestRequestTest | 5 | Existing field/JSON/query validation plus optional categories, exact identifiers, duplicate/null rejection and strict JSON element/container types |
| LabTestServiceTest | 6 | Service authorization, uniqueness/constraint translation, availability/status behavior and identifier handling |
| LabTestErrorHandlerTest | 4 | Existing validation/error envelope, request IDs, JSON, method and content-type statuses |
| LabTestCategoryPersistenceTest | 3 | Existing zero/one/multiple/shared/all-seven mapping checks; updated full replacement round trip and status preservation |
| LabTestManagementTest | 10 | Real PostgreSQL plus MockMvc/security: POST omission/null/[]/single/multiple/all seven; reverse input normalized to contract response order; full arrays in create/detail/list/status; complete replacement, membership removal, repeated replacement, all three clearing forms, preserved availability; invalid/duplicate/null/blank/padded/lowercase/unknown/excessive values and wrong JSON types on POST/PUT; unchanged complete row/timestamps and assignments after invalid/conflicting updates; existing field validation, pagination/search/concurrent creation, ADMIN-only bearer/cookie writes, anonymous 401 after valid CSRF, missing/mismatched/valid cookie CSRF for every write and role |

Documentation verification parsed all seven catalog JSON examples; git diff
--check passed. Pre-task SHA-256 comparisons preserve all unrelated captured
files, including the four unrelated modified documents, V1-V6, security/controller/
repository/query/entity code, POM, isolation guard, local Maven config and local-only
exclusions. Existing edits in the three relevant tracked documents were retained
and extended; IMPLEMENTATION_PLAN.md remains locally excluded/untracked.

The complete suite, migration compatibility suites, live-server/network HTTP,
Tasks 4-5 target behavior and development/production deployment were not run or
verified. smart_lims_db was not accessed. No Postman artifacts, commits, pushes,
branch switches, new migrations or changes to applied migrations were made.


## Task 4 catalog list filtering verification (2026-10-28)

Scope: Stage 1 Task 4 only; R-CAT-01/R-NFR-01, S1-CAT-R02/R03/R04;
depends on DONE Tasks 2-3. GET /api/lab-tests accepts one exact category
identifier. A correlated EXISTS predicate combines membership, literal search
and effective availability before pagination/counting, preserving one row per
test and every assigned category in the response. PATIENT omission/active=true
lists active tests only; well-formed active=false returns 403 after supported
query syntax validation. Staff retain either availability state. Unknown query
keys remain ignored. Task 5 detail visibility/catalog completion remains TODO;
no detail-endpoint policy change is included.

Before testing, reverified the independent disposable PostgreSQL 16.15 cluster:
inspected the saved temporary data directory, postmaster files, postgresql.conf
and pg_hba.conf. pg_ctl confirmed PID 17864 running that directory, and a separate
listener inspection matched 127.0.0.1:55432 to that process. An explicit psql
connection to smartlims_auth_regression confirmed current_database, postgres user,
loopback server address/port, listen_addresses=127.0.0.1, and the exact temporary
data directory ending in
smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df. No startup or cluster
configuration change was needed. The unchanged excluded .mvn/maven.config and
Surefire mapping selected jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression.
No smart_lims_db connection or application datasource fallback was used.
Management fixtures use synthetic data, fake VerificationEmailSender and truncate
only the guarded regression database. No compatibility databases were created.
Flyway validated all six existing migrations, reported V6 current and no migration
necessary; Hibernate schema validation succeeded.

Exact command, from Backend:

```powershell
.\mvnw.cmd '-Dtest=LabTestRequestTest,LabTestServiceTest,LabTestErrorHandlerTest,LabTestManagementTest' test
```

Result: **32 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished **2026-10-28 17:14:25 +02:00**, total Maven time **35.013 seconds**.
This was one successful focused invocation; no rerun or complete-suite execution.

| Suite | Passing cases | Evidence |
|---|---:|---|
| LabTestRequestTest | 6 | Existing DTO/JSON/query validation; all seven exact enum query identifiers accepted; omission and ignored plural key; invalid/blank/padded/lowercase/label/comma-separated and repeated category rejected |
| LabTestServiceTest | 7 | Existing write/identifier/constraint checks; PATIENT active=false rejected directly at the service boundary before repository access, with existing forbidden envelope semantics; missing authentication rejected |
| LabTestErrorHandlerTest | 4 | Existing validation envelope, matching request ID, no-store, JSON and method/content-type behavior |
| LabTestManagementTest | 15 | Five new list cases plus ten existing assignment/security/catalog regressions (the former patient inactive-list success assertion updated to the finalized 403 rule). Real PostgreSQL plus MockMvc/security verifies membership under either assigned category with full arrays; all seven filter values; no duplicates/inflated totals; unfiltered uncategorized inclusion and named-filter exclusion; combined case-insensitive trimmed name/code search and availability; count/pagination across equal-name/price UUID ties in both sort directions and code-desc sorting; ordinary and Integer.MAX_VALUE distant pages retain filtered totals; empty-page metadata; literal %, _ and backslash; blank search; every role via bearer and cookie with omitted/true/false active and optional category; unknown-key bypass attempts; missing/invalid authentication; invalid/repeated syntax for every supported query key, including 400 precedence over the patient inactive-list policy, fieldErrors, no-store and matching request ID. Existing ADMIN writes and cookie CSRF checks pass. |

Final review: git diff --check passed; all seven catalog JSON examples parsed.
Pre-task SHA-256 comparisons confirm unrelated files, V1-V6, entity/category mapping,
request/response assignment DTOs, mapper, controller/repository/error handling,
security, POM, database guard, local Maven mapping and local exclusions unchanged.
Relevant API/design/test documentation and the excluded local implementation plan
were updated without changing historical run results. Task 4 is DONE; Task 5 TODO.

Not run/verified: complete backend suite, migration compatibility suites, live
network HTTP server, Task 5 inactive-detail restrictions/final stage completion,
and development/production deployment readiness. No smart_lims_db access, new or
modified applied migrations, Postman files, commits, pushes or branch changes.


## Task 5 detail and catalog completion verification (2026-10-28)

Scope: Stage 1 Task 5 only, including the requested Tasks 1-4 acceptance review;
R-CAT-01/R-NFR-01, S1-CAT-R01/R02/R03/R04, with DONE Tasks 1-4 and resolved
S1-CAT-D01/D02. The existing detail DTO already contains all twelve documented
fields and ordered category arrays. LabTestService now returns the existing
LAB_TEST_NOT_FOUND error for an inactive test requested by PATIENT before mapping
its fields/categories. Missing and inactive errors have the same message and
empty fieldErrors, with no detail fields. Staff retain inactive access. Writes,
list filtering, authentication, cookie CSRF and applied migrations are unchanged.

Independently reverified isolation before execution: inspected the saved temporary
data directory, postmaster files, postgresql.conf and pg_hba.conf; pg_ctl reported
the same dedicated running cluster (PID 17864), independently matched to the
127.0.0.1:55432 listener. Explicit psql confirmed PostgreSQL 16.15, database
smartlims_auth_regression, postgres user, loopback server/listen_addresses and
matching temporary data_directory ending in
smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df. The unchanged excluded
local Maven configuration/Surefire mapping selected that guarded target. The
existing guard and all test datasource paths were reviewed; application defaults
were never a fallback. No startup/configuration change or smart_lims_db access.
Fixtures use synthetic data and fake email. Compatibility suites create/drop only
their own smartlims_migration_<32 hex characters> databases on that same cluster.
There were zero owned migration databases before and after execution. Post-run
read-only checks confirmed all regression database migrations successful through V6.

Focused command, from Backend:

```powershell
.\mvnw.cmd '-Dtest=LabTestServiceTest,LabTestManagementTest,LabTestErrorHandlerTest' test
```

Result: **30 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished **2026-10-28 18:37:07 +02:00**, Maven time **46.891 seconds**.
Service 8, management 18, error-handler 4. New coverage verifies all twelve detail
fields, UTC timestamps matching persistence, omitted/null optional text, zero/one/
multiple ordered categories, exact field allowlist, all roles via bearer/cookie,
active uncategorized detail access, patient inactive categorized/uncategorized
404 indistinguishable from missing (except request ID), query-key bypass attempts,
staff inactive access, reactivation visibility, missing/malformed/noncanonical IDs,
uppercase canonical UUIDs, authentication precedence and missing/invalid tokens.
The service unit check verifies rejection before mapper interaction. Existing
create/update/status, ADMIN-only writes, list filters and cookie CSRF regressions
pass. The existing cookie test now expects patient 404 if its prior ADMIN iteration
deactivated that fixture. A subsequent type-only test cleanup removed an unchecked
Map assignment; no production behavior changed after this focused run.

After focused checks passed, executed the complete suite exactly once:

```powershell
.\mvnw.cmd test
```

Result: **163 tests across 19 suites, 1 failure, 0 errors, 0 skips; BUILD FAILURE**,
exit 1, finished **2026-10-28 18:38:58 +02:00**, reported time **1 minute 12 seconds**.
All six catalog suites (43 cases) and both migration compatibility suites (10 cases,
including the four catalog migration cases) passed. The only failure was
PatientManagementTest.databaseEnforcesUniqueNumbersLinksGenderAndRetainedUserReferences:
its exact history expectation still ended at V5, while Task 2 correctly introduced
V6__lab_test_categories.sql. This was a Stage 1 verification-maintenance gap,
not a patient behavior failure. Updated that exact expected version list to V1-V6
and added an exact V6 script-name assertion; all existing patient uniqueness,
gender and retained-reference assertions remain. No production or applied migration
file changed to resolve the failure. No unrelated failure was found.

Reran only the affected suite:

```powershell
.\mvnw.cmd '-Dtest=PatientManagementTest' test
```

Result: **27 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished **2026-10-28 18:40:07 +02:00**, Maven time **29.220 seconds**.
The other 136 cases passed in the single full invocation. Final evidence therefore
covers **163 distinct passing cases across the full run and targeted rerun**.
The latest per-suite reports aggregate to 163/0/0/0 but originate from those two
invocations; this is not a single green complete-suite result. The complete suite
was not rerun after the history assertion fix, honoring the requested one full run.

| Final suite group | Passing cases | Evidence origin |
|---|---:|---|
| Six catalog suites | 43 | Single full run: request 6, service 8, error-handler 4, management 18, category persistence 3, category migration 4 |
| Authentication/provisioning/security/password suites | 55 | Single full run |
| Patient management | 27 | Targeted rerun after strict V6 history correction |
| Other patient/linking/request/migration suites | 37 | Single full run; includes all six patient migration compatibility cases |
| Application context | 1 | Single full run |

Tasks 1-4 acceptance review: the finalized fixed vocabulary/static discovery,
optional category/legacy handling, V6 integrity/index/mapping design, array
validation/replacement/status semantics, unique membership filtering with combined
literal search/pagination/counts, patient list policy and staff access are retained.
Fresh/upgrade/preservation and category constraint/concurrency checks passed in
the full run. The sole stale history assertion was corrected as above. No remaining
functional catalog gap or unresolved clinical/product decision was identified.

Task 5 implementation/verification is DONE. Stage technical acceptance is DONE
with the cumulative evidence above. Overall stage status remains IN_PROGRESS
solely because the plan separately requires a commit and the user explicitly
instructed not to commit. No commit, push or branch switch was performed.
Documentation, git diff --check and all seven catalog JSON examples were checked;
pre-task hashes preserve unrelated files, V1-V6, security, controller/repository/
DTO/mapper/query code, POM, isolation guard, machine-local Maven mapping and local
exclusions. The local implementation plan remains excluded/untracked.

Not verified: one green combined full invocation after the history assertion fix,
live network HTTP server/client integration, development/production migration or
deployment readiness. No development data was accessed or clinical mapping inferred.
No Postman artifacts, future workflow modules, new migrations or applied migration
changes. Committing is intentionally pending; no future stage was started.

## Task 7 order persistence verification (2026-10-28)

Scope: Stage 2 Task 7, R-ORD-01/R-NFR-01; storage support for S2-ORD-R03/R04/R05
under ORDERS_API.md and DATABASE_DESIGN.md sections 4.7-4.8. Reviewed the linked
my-orders.jpeg reference. Added V7__orders.sql, TestOrder/OrderItem/OrderStatus,
TestOrderRepository and the catalog shared snapshot-lock lookup. No order
controller/service/DTO or new HTTP behavior is implemented.

Before database execution, independently confirmed PostgreSQL 16.15 using psql,
the loopback listener, process command line, and the saved disposable data path:

- Target: jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression,
  user postgres, empty test-only password.
- Listener 127.0.0.1:55432, postgres PID 17864; actual data_directory and its
  process -D both matched
  C:/Users/hmood/AppData/Local/Temp/smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df.
- The development Windows service was separate (PID 5788), using
  C:/Program Files/PostgreSQL/16/data; it was not a test target.
- Migration cases created/dropped only their own guarded
  smartlims_migration_<32 lowercase hex> databases on that disposable instance.
  Fixtures were synthetic; external email was mocked. Maven's local URL mapping,
  Surefire mapping and IsolatedPostgresTest guard were preserved.

Commands ran directly from Backend on branch backend-hmood:

```powershell
.\mvnw.cmd '-Dtest=OrderMigrationTest,OrderPersistenceTest' test
```

**14 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 2026-10-28 21:56:01 +02:00, Maven time 48.157 seconds.
OrderMigrationTest: 7; OrderPersistenceTest: 7, including three enum cases.

```powershell
.\mvnw.cmd '-Dtest=LabTestCategoryMigrationTest,PatientMigrationCompatibilityTest,PatientManagementTest' test
```

**37 tests, 0 failures, 27 fixture errors, 0 skips; BUILD FAILURE**, exit 1,
finished 2026-10-28 21:57:41 +02:00, Maven time 35.764 seconds.
Both migration suites passed (4 category + 6 patient compatibility cases).
PatientManagementTest's 27 errors all originated before the test bodies:
PostgreSQL rejected TRUNCATE of patients/users because test_orders now references
them (SQLSTATE 0A000). Updated the explicit fixture table lists in the five
affected authentication/patient/catalog suites to include order_items/test_orders.
No CASCADE, assertion removal, isolation-guard change or production behavior
change was used. Existing exact migration-history/count assertions now include V7
and its script name; earlier checksum and preservation assertions remain.

```powershell
.\mvnw.cmd '-Dtest=RegistrationTest,AuthenticationRegressionTest,PatientManagementTest,PatientProfileLinkingTest,LabTestManagementTest' test
```

**117 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 2026-10-28 21:59:17 +02:00, Maven time 54.077 seconds.
Counts: registration 26, authentication regression 20, patient management 27,
patient linking 26, catalog management 18. The earlier fixture errors are resolved.

Task 7 acceptance evidence:

| Criterion | Current execution evidence |
|---|---|
| Orders/items persist and reload | JPA flush/clear/reload verifies IDs, lazy relationships, unlinked profile support, PENDING defaults, timestamps, CHAR hash/currency, retry lookup, all four stored states and cancellation metadata. Hibernate ddl-auto=validate passes. |
| Constraints enforce the design | Direct SQL verifies NOT NULL, number/hash/state/currency checks, cancellation consistency/reason/time, item code/name/finite nonnegative price bounds, unique numbers/actor keys/item membership and retained FKs. Nine order/item indexes and the independent BIGINT sequence are inspected. Concurrent same-actor/key writes leave one winner. |
| Fresh migration and upgrade preserve data | Fresh V1-V7 migration/validation and no-op rerun pass. V6-to-V7 compares complete JSON rows from all six preexisting application tables and complete prior Flyway metadata unchanged; existing patient sequence value is preserved. New order tables start empty and the order sequence starts at 1. Earlier V4/legacy compatibility cases also pass through V7. |
| Focused migration/persistence tests pass | Both new suites pass all 14 cases on the independently verified isolated target. Catalog changes and cancellation retain snapshots/items/keys; 100 maximum prices sum exactly to 999999999999.00 in Java and JPQL. Failed item insertion rolls back the header/items/key, permitting a subsequent retry. Repository lock modes are exercised. |

Current evidence covers **141 distinct passing tests across nine suites** from
the three scoped invocations above, with the failed fixture invocation and its
correction explicitly retained. This is not a complete-suite run. Git diff review
and git diff --check passed. V1-V6, dependencies, security, Maven configuration,
the test isolation guard and local exclusions are unchanged. The preexisting
order-contract/database-design work is retained and updated for persistence status.
The local plan remains excluded; no files were staged or committed.

Task 7 is DONE. Tasks 8-11 remain TODO: service-level bounded/nonempty aggregate
validation, active catalog admission, authorization/ownership, canonical request
hash construction, retry recovery in fresh transactions, cancellation semantics
and HTTP/query behavior remain later work. SQL rollback/uniqueness and mapped
lock modes do not establish those service behaviors or full concurrency handling.
The complete suite, live HTTP, development/production migrations and deployment
were not run or claimed. No frontend, Postman artifacts, future workflow or AI
work was added.

## Task 8 order creation verification (2026-10-28)

Scope: Stage 2 Task 8; R-ORD-01/R-NFR-01, S2-ORD-R01/R04/R05 and
ORDERS_API.md sections 3-6/8-9. Reviewed the linked my-orders.jpeg reference,
patient identity/linking contract, catalog contract and storage/transaction design.
Implemented only POST /api/orders/me and POST /api/orders, validated DTOs, detail
mapping, scoped error advice, transactional creation/replay, exact security
matchers and the Idempotency-Key CORS header. V1-V7 and Task 7 mappings/repositories
are unchanged. No patient GET or cancellation endpoint is implemented.

Before execution, independently reconfirmed the disposable PostgreSQL 16.15 target
with psql, the listener, process command line and saved cluster directory:

- jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression; test-only postgres
  user and empty password. Listener 127.0.0.1:55432 belongs to postgres PID 17864.
- Actual data_directory and process -D match the saved SMARTLIMS_TEST_POSTGRES_DATA:
  C:/Users/hmood/AppData/Local/Temp/smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df.
- The separate development service uses PID 5788 and
  C:/Program Files/PostgreSQL/16/data; it was not accessed by tests.
- Existing machine-local Maven/Surefire URL mapping and IsolatedPostgresTest guard
  remain unchanged. All data is synthetic; external email is mocked. Rollback
  injection uses a test-owned trigger/function in this isolated database only,
  removed in finally. The order sequence expansion fixture also uses this target.

All commands ran directly from Backend on backend-hmood. Initial compilation
attempts exposed a checked UnsupportedEncodingException in the new response test
helper; no tests ran in those attempts. Reading response bytes fixed the helper.

| Preliminary command | Finished (+02:00) | Maven time | Outcome |
|---|---|---|---|
| .\mvnw.cmd '-Dtest=OrderRequestTest' test | 22:55:40 | 14.928 s | exit 1, test compilation failed |
| .\mvnw.cmd '-Dtest=OrderRequestTest' test | 22:56:14 | 14.261 s | exit 1, test compilation failed; the Charset overload also declared the checked exception |
| .\mvnw.cmd '-Dtest=OrderCreationTest' test | 22:57:02 | 9.487 s | exit 1, same helper compilation error before the byte-based correction |

Focused request/creation execution:

```powershell
.\mvnw.cmd '-Dtest=OrderRequestTest,OrderCreationTest' test
```

**26 tests, 0 failures, 2 errors, 0 skips; BUILD FAILURE**, exit 1,
finished 2026-10-28 22:57:53 +02:00, Maven time 38.437 seconds.
OrderRequestTest passed all 4 cases; OrderCreationTest passed 20 of 22 cases.
Both errors were new test setup: the CSRF endpoint returns its token in the
XSRF-TOKEN cookie, not a JSON token property; the derived Spring Data query is
abstract and cannot be used with Mockito doCallRealMethod. Corrected the cookie
lookup and forced-missed-precheck fixture. No production code or assertions were
weakened. Added one current-eligibility case for disabled, unverified, passwordless
and unaccepted-invitation accounts through both HTTP and direct service calls.

Reran only the two affected cases and the new eligibility case:

```powershell
.\mvnw.cmd '-Dtest=OrderCreationTest#cookieWritesRequireCsrfAndBearerTakesPrecedence+uniqueCollisionRollsBackBeforeWinnerLookupInANewTransaction+creationRejectsEveryIneligibleAccountStateUsingCurrentStoredData' test
```

**3 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 2026-10-28 23:00:34 +02:00, Maven time 29.184 seconds.
The collision test forces one missed precheck, then executes the real PostgreSQL
unique violation/rollback and a real winner read in the fresh replay transaction.
It verifies both proxied transaction names and the unchanged complete winner.
The query precheck is spied for this case only; normal/concurrent request tests
use the real repository. Current evidence is **27 distinct passing new cases**
(23 creation + 4 request), accumulated across the initial run and targeted rerun;
no single green 27-case invocation is claimed. The latest creation XML contains
only the targeted three cases; it does not represent the earlier twenty passes.

Affected regression execution:

```powershell
.\mvnw.cmd '-Dtest=AuthenticationRegressionTest,BrowserSecurityTest,PatientProfileLinkingTest,LabTestManagementTest' test
```

**67 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 2026-10-28 23:02:20 +02:00, Maven time 40.134 seconds.
Counts: authentication 20, browser security 3, patient linking 26, catalog 18.
Existing tests were not edited. Total current Task 8 evidence is **94 distinct
passing cases across six suites** from scoped invocations, not a full-suite run.

Task 8 acceptance evidence:

| Criterion | Execution evidence |
|---|---|
| Complete orders without partial writes | Patient and both staff roles create PENDING aggregates for linked/unlinked existing profiles with retained actors, IDs, exact item count and snapshots. Missing/inactive selections leave no header/items. A forced failure on the final item rolls back earlier items, header and retry key, then the original key successfully retries. |
| No trusted client identity, prices or status | Separate self/staff DTOs reject unknown patientId/userId, price/currency/total/status/actor and future-workflow fields. Strict JSON rejects scalar coercion and incorrect containers/elements. Self creation uses the authenticated account's locked profile; absence yields PATIENT_PROFILE_NOT_LINKED with no automatic creation/link. Staff must select an existing profile. |
| Validation and authorization | Real signed JWTs exercise both role matrices; direct service calls recheck stored roles/eligibility rather than trusting authorities alone. Required/null/blank/malformed UUIDs, duplicates including case variants, 1-100 bounds, missing/padded/comma/repeated retry headers and wrong JSON types return the documented field/error envelope. Cookie writes require CSRF, bearer precedence is retained, anonymous requests reaching authentication return 401, and CORS allows the retry header only for configured origins. Future read/cancel routes stay denied. |
| Transactions and retries | Same actor/key/intent replays 200 without repricing or timestamp/item changes; different intent conflicts, new keys create intentional repeats and different actors have independent namespaces. Canonical SHA-256 bytes are checked against the documented JSON shape. Replays return stored processing/completed/cancelled state while retaining cancellation history. Role/eligibility/link changes are rechecked. Concurrent matching requests produce one created order and one identical replay; conflicting requests produce one complete winner/conflict; distinct keys/actors get distinct numbers. A catalog writer blocks snapshot admission until its commit, then the new availability is honored. The real uniqueness rollback/fresh winner lookup passes. |
| Totals and response contract | Zero-priced uncategorized active tests are admitted; 100 maximum prices sum exactly to 999999999999.00. Numbering expands beyond six digits. Detail contains only documented fields, sorted snapshot items, UTC instants, ILS, canCancel and visitDetailsAvailable=false; self gets Location and staff does not. |

Reviewed the diff and passed git diff --check. All changes remain inside Backend.
No applied migration, dependency, authentication strategy, isolation guard or
local exclusion was changed; local planning files remain excluded. No Postman
artifacts, frontend changes, commit, push or deployment were made.

Task 8 is DONE with no remaining acceptance gap. Tasks 9-11 remain TODO for
patient list/detail, cancellation and complete-stage verification. Historical
Task 7 migration/persistence checks were not rerun. The complete suite, live
network HTTP server, manual Postman checks and development/production execution
were not run or claimed; HTTP evidence is MockMvc with real security and the
verified isolated PostgreSQL database.

## Task 9 patient order read verification (2026-10-28)

Scope: R-ORD-01/R-NFR-01; S2-ORD-R02/R04. Implemented patient-only
GET /api/orders/me and GET /api/orders/me/{id}, validated query DTOs, ownership
specification/lookup, page summaries, batched grouped item totals and read-only
service mapping. Reviewed ORDERS_API.md, DATABASE_DESIGN.md sections 4.7-4.8,
patient identity/catalog contracts and my-orders.jpeg. Prior Task 8 working-tree
changes were preserved. Task 10 had not started during this verification.

Independently reconfirmed the isolated PostgreSQL 16.15 instance before testing:
jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression, test-only postgres
user/empty password. The listener belongs to PID 17864; psql data_directory,
the process -D and saved SMARTLIMS_TEST_POSTGRES_DATA agree on
C:/Users/hmood/AppData/Local/Temp/smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df.
The development service remains separate, PID 5788, using
C:/Program Files/PostgreSQL/16/data. No development database was tested.
Synthetic fixtures and mocked email only; existing Maven URL mapping, Surefire
mapping and isolation guard are unchanged.

Commands executed directly from Backend on backend-hmood:

```powershell
.\mvnw.cmd '-Dtest=OrderQueryRequestTest,OrderReadTest,OrderCreationTest#creationAndPatientReadsHaveExactRolesWhileOtherRoutesStayDenied' test
```

Result: **15 tests, 1 failure, 0 errors, 0 skips; BUILD FAILURE**, exit 1,
finished 23:35:02 +02:00, Maven time 53.121 seconds. Query validation (4) and
updated creation/read role boundary (1) passed; reads passed 9 of 10 cases.
The maximum-page case found Spring Page.isLast overflow at page 2147483647.
Order page mapping now computes last using long arithmetic; totals/content
were already correct. No assertion was weakened.

```powershell
.\mvnw.cmd '-Dtest=OrderReadTest' test
```

First rerun: **10 tests, 0 failures, 10 errors, 0 skips; BUILD FAILURE**,
exit 1, finished 23:36:26 +02:00, Maven time 42.355 seconds. Before test bodies,
Spring's classpath scan reported NoSuchFileException for generated
target/classes/com/smartlims/orders/mapper and scanned only five repositories,
so TestOrderRepository could not be injected. An IntelliJ build process was
active; concurrent generated-output rebuilding is the inferred cause. The
mapper/repository classes were present again before retry. No generated file,
IDE setting or build configuration was manually changed.

Same focused command retried: **10 tests, 0 failures, 0 errors, 0 skips;
BUILD SUCCESS**, exit 0, finished 23:37:25 +02:00, Maven time 32.259 seconds.
Together with the four query cases and role case from the first run, all
**15 distinct focused cases pass cumulatively**; no single green 15-case run
is claimed. Latest read reports contain the ten corrected passing cases.

Acceptance evidence:

- Unique owned results/counts and original item totals pass with multiple items
  per order and other-patient/unlinked orders excluded. All four statuses combine
  with literal case-insensitive order-number-only search before paging/counts;
  percent, underscore and backslash remain literal. Every supported query's
  repetition/syntax/bounds and every documented sort/direction are checked.
- UUID ascending ties, page navigation, empty pages/filters, page 2147483647 and
  filtered totals/first/last metadata pass. One hundred maximum-price snapshots
  retain exact 999999999999.00 totals in summary and detail.
- Patient ownership uses the profile/account link even for staff-created orders;
  another patient's orders/missing/unlinked detail all use ORDER_NOT_FOUND.
  Query patientId/userId cannot override ownership. Newly linked historical staff
  orders become visible. Empty linked list differs from an unlinked profile.
- Catalog rename/reprice/deactivation and cancelled stored state retain item
  IDs/snapshots, prices, count and amount. Detail/summary field sets, ordering,
  cancellation metadata, canCancel and visitDetailsAvailable=false pass.
- Roles, anonymous/invalid JWT, cookie reads, bearer precedence and current stored
  role/eligibility checks pass. Exact GET matchers leave staff browsing denied.

Diff review/git diff --check passed. Task 9 is DONE; all four acceptance criteria
pass. Task 10 remains TODO at this record and will be implemented next under the
same user request. Task 11 is not started. No complete suite, deployment, live
network HTTP, manual Postman, commit or push was performed; HTTP evidence is
MockMvc with real signed JWT/security and the verified isolated PostgreSQL target.

## Task 10 order cancellation verification (2026-10-28)

Scope: R-ORD-01/R-NFR-01; S2-ORD-R03/R04/R05 and ORDERS_API.md section 7.
Task 9 was verified and marked DONE before Task 10 implementation began. Added
only POST /api/orders/{id}/cancel, a strict validated reason DTO and a service
transaction using the existing V7 cancellation fields/order write lock. Reviewed
the linked contract/design and my-orders.jpeg; no clinical or processing policy
was inferred. The same independently verified disposable PostgreSQL 16.15 cluster
from the Task 9 record was used throughout (loopback 127.0.0.1:55432,
smartlims_auth_regression; separate temporary data directory/PID 17864).
Application datasource defaults/development data were never fallback targets.
Fixtures are synthetic; external email is mocked. A test-owned failure trigger
and function are created only on that target and removed in finally.

Executed directly from Backend on backend-hmood:

```powershell
.\mvnw.cmd '-Dtest=CancelOrderRequestTest,OrderCancellationTest,OrderCreationTest#creationAndPatientReadsHaveExactRolesWhileOtherRoutesStayDenied' test
```

**19 tests, 1 failure, 0 errors, 0 skips; BUILD FAILURE**, exit 1,
finished 23:43:03 +02:00, Maven time 49.752 seconds. Reason DTO cases (3) and the
updated exact-route case (1) passed. Cancellation passed 14 of 15 cases,
including all concurrency/rollback tests. The failing case required updatedAt
not to precede cancelledAt. Added exact timestamp diagnostics and investigated
without weakening the assertion:

```powershell
.\mvnw.cmd '-Dtest=OrderCancellationTest#patientCancellationRetainsEveryOriginalItemAndRecordsServerMetadataWithOptionalReasons' test
```

**1 test, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 23:44:45 +02:00, Maven time 40.339 seconds. The failure was intermittent;
synthetic stored rows showed some event/update times equal to the microsecond.
Inspected the installed Hibernate timestamp generator, which uses a clock adjusted
to mapped precision. The inferred edge was independently rounded nanoseconds on
the event timestamp versus the ORM precision-adjusted update clock. Cancellation
now truncates its server event time to database microseconds before persistence,
preventing rounding forward beyond that later update time. No entity mapping,
schema, timestamp assertion or test isolation setting was changed.

Reran the complete affected cancellation suite:

```powershell
.\mvnw.cmd '-Dtest=OrderCancellationTest' test
```

**15 tests, 0 failures, 0 errors, 0 skips; BUILD SUCCESS**, exit 0,
finished 23:46:33 +02:00, Maven time 49.277 seconds. All cancellation cases,
including chronology, repeat equality, rollback and concurrency, passed on the
final source. Together with the earlier DTO/route cases, Task 10 covers
**19 distinct focused passing cases cumulatively**; no single green 19-case
invocation is claimed. Latest cancellation reports contain all fifteen passes.

Acceptance evidence:

- Only eligible PATIENT owners and ADMIN/RECEPTIONIST can cancel. Stored current
  role/eligibility, forged authorities, all four ineligible account conditions,
  anonymous/invalid JWT, bearer precedence, cookie CSRF and repeat authentication
  are checked. LAB_TECHNICIAN is forbidden. Existing non-cancellation status/delete
  routes remain denied. Canonical path syntax accepts uppercase UUID hex.
- Staff require a trimmed nonblank reason, including on repeats; patient omitted,
  null/blank reasons become null. Strict JSON/unknown fields, missing body,
  non-string reasons and the trimmed 1000-character bound are verified. Denied
  reason/state/ownership requests leave headers/items unchanged.
- Only PENDING becomes CANCELLED. Processing/completed states return 409 with
  unchanged data; missing, unowned and unlinked patient orders return identical
  404 semantics for all stored states. Actor and event/update times are stored;
  creation identity/timestamp, immutable items, count, amount and currency remain.
- Authorized repeats by patient or another staff actor return the same complete
  original record, including first actor/time/reason/updatedAt. A patient blank
  reason remains null even when staff later supply a valid different reason.
  Another patient cannot replay that cancellation.
- A forced update failure produces a sanitized 500, rolls back all cancellation
  metadata and preserves items; a subsequent valid retry succeeds. Cancellation
  is reflected in owned list/detail and creation retry responses with the original
  value/snapshots and canCancel=false.
- Concurrent patient/staff cancellation returns one identical retained record,
  with actor matching the winning reason. Cancellation waits for a processing
  order lock, then rejects the committed IN_PROGRESS state. It can complete while
  another transaction holds the patient write lock, confirming no inverted
  order-to-patient write lock path. No processing endpoint was added for the test.

Diff review and git diff --check passed. Task 10 is DONE; all four acceptance
criteria pass. Tasks 9/10 were implemented sequentially, with 15 and 19 distinct
focused passing cases respectively (their updated route case is shared). Existing
Task 8 working-tree work is preserved. V1-V7, dependency versions, isolation guard,
machine-local Maven/Surefire database mapping and exclusions remain unchanged.
No commit/push, Postman artifact, frontend, AI or unrelated workflow work was done.
Task 11 remains TODO and was not started: no complete-suite run or stage-wide
verification, manual Postman acceptance, deployment or production readiness is
claimed. HTTP verification uses MockMvc with real signed JWT/security and isolated
PostgreSQL, rather than a live network HTTP server.

## Task 11 full stage verification (2026-10-28)

Scope: Stage 2 patient orders, R-ORD-01/R-NFR-01 and S2-ORD-R01-R05.
Reviewed the Task 11 acceptance criteria, ORDERS_API.md, storage/transaction
design, final controller/DTO/service/repository/mapper/security code and focused
Tasks 7-10 evidence before running the complete suite. The current user request
explicitly excludes Postman, another stage and commit/push. No Postman skill,
tool, CLI, application, resource sync or artifact generation was used. Manual
client scenarios are documented as an unexecuted HTTP checklist below.

Isolation was independently verified again before this execution, beyond the URL:

- PostgreSQL 16.15, listener 127.0.0.1:55432, postgres process PID 17864.
- psql confirmed smartlims_auth_regression, current user postgres, loopback server
  address/port and actual data_directory. The empty password is test-only.
- Actual data_directory, process -D and saved SMARTLIMS_TEST_POSTGRES_DATA matched
  C:/Users/hmood/AppData/Local/Temp/smartlims-test-postgres-ea570e6002674f4aa37c53dd81d813df.
- The development service was distinct, PID 5788, using
  C:/Program Files/PostgreSQL/16/data. It was not a test target.
- The unchanged .mvn/maven.config/Surefire mapping supplied
  jdbc:postgresql://127.0.0.1:55432/smartlims_auth_regression. The isolation guard
  was preserved. Compatibility/migration tests created/dropped only their own
  guarded smartlims_migration_* databases on this verified disposable cluster.
- Synthetic fixtures and mocked email were used. Application datasource defaults
  were never a fallback. No development/shared database migration was executed.

After the recorded focused checks had passed, ran the complete suite directly
from Backend, branch backend-hmood:

```powershell
.\mvnw.cmd test
```

Result: **236 tests across 27 suites, 0 failures, 0 errors, 0 skips;
BUILD SUCCESS**, exit 0. Finished **2026-10-28 23:55:37 +02:00**; Maven reported
**2 minutes 13 seconds**. All 27 Surefire XML reports were freshly written by
this invocation and independently sum to 236/0/0/0. This is **one green full
invocation on the final code**, rather than cumulative targeted evidence.
No failure investigation, code/test fix, targeted rerun or second complete run
was needed. Earlier focused-run failures remain documented in their own records;
they were not failures of this full invocation.

| Suite group | Suites | Passing cases |
|---|---:|---:|
| Orders: creation 23, cancellation 15, reads 10, persistence 7, migration 7, request validation 4, query validation 4, cancellation DTO 3 | 8 | 73 |
| Authentication, registration, provisioning, browser security and password/constraint policy | 7 | 55 |
| Patient management, linking, request/token and migration compatibility | 5 | 64 |
| Catalog API/service/validation/errors, category persistence and migration | 6 | 43 |
| Application context | 1 | 1 |
| Total | 27 | 236 |

Stage acceptance review:

| Acceptance | Outcome and evidence |
|---|---|
| Creation, reads, filtering, ownership and cancellation verified | PASS. All 73 order cases pass in the full invocation: patient/staff identity and role checks, linked/unlinked profiles, strict input/header validation, exact totals/snapshots, query combinations and counts, deterministic paging/sorts including maximum offsets, ownership privacy, atomic rollback, durable retry identity/recovery and cancellation concurrency/retained metadata. |
| Existing auth, patient linking and catalog remain functional | PASS. All 163 preexisting cases pass in this same invocation, including JWT/cookie/CSRF/CORS behavior, verified linking, catalog visibility/categories and legacy migration compatibility. |
| Documentation matches implementation | PASS. Reviewed all five implemented method/path mappings, access rules, request/response fields, errors, retry/locking design and tests against ORDERS_API.md. Updated current status/evidence in the plan, API contract and database design; historical focused evidence is preserved. No additional functional mismatch was identified. |
| Future workflow boundaries remain explicit | PASS. No processing/completion endpoint, arbitrary status update, staff browsing, visit link, appointment/payment/sample/result side effect or AI module is added. visitDetailsAvailable remains false; cancelled amount is historical value, not a balance/refund. |

Task 11 and Stage 2 are **DONE**, with all four acceptance criteria satisfied
by the recorded passing evidence. On 2026-10-29 the owner clarified that committing
is a separate handoff, not an acceptance criterion; the earlier completion gate
was corrected in the plan and linked documentation. This correction did not
rerun tests or change any execution result recorded above.

Owner handoff: working-tree changes remain uncommitted and the owner decides when
to commit them. No Git write/publish operation or next stage was authorized or
performed. Task/stage completion does not claim deployment readiness.

Manual HTTP scenarios — documented, not executed:

Use only synthetic accounts/data in an appropriate test environment. Prerequisites
are an eligible linked patient, a second patient, eligible ADMIN/RECEPTIONIST and
LAB_TECHNICIAN accounts, existing linked/unlinked profiles and known active test
UUIDs. Creation writes require Content-Type: application/json and exactly one
fixed canonical UUID Idempotency-Key. Bearer requests use the caller's JWT;
cookie writes instead require access_token, the XSRF-TOKEN cookie from
GET /api/auth/csrf-token and its value in X-XSRF-TOKEN. Never record raw tokens.

| Scenario | HTTP action / expected outcome |
|---|---|
| Patient creation | POST /api/orders/me with {"testIds":["<active-test-uuid>"]}. Expect 201, own linked patient, PENDING, backend snapshot/count/ILS total and Location: /api/orders/me/{id}. No patientId, price or status input. |
| Staff creation | POST /api/orders with {"patientId":"<existing-profile-uuid>","testIds":["<active-test-uuid>"]}. ADMIN/RECEPTIONIST may target an unlinked profile; expect 201 detail and no staff Location. PATIENT/LAB_TECHNICIAN receive 403. |
| Retry versus new intent | Resend as the same actor with the same key/selection: 200 same order and snapshots, including current state. Different selection or staff target with that key: 409 IDEMPOTENCY_KEY_REUSED. A new key permits a deliberate new order. |
| Input and availability | Missing/repeated/malformed key or invalid/duplicate/empty/oversized UUID selection: 400 VALIDATION_ERROR on the documented field. Client price/status/actor or other unknown properties: 400 INVALID_JSON. Missing/inactive selected tests: 409 ORDER_TEST_UNAVAILABLE with no partial order. |
| Owned list and detail | GET /api/orders/me; combine search, exact status, page, size and permitted sort once each. Expect unique owned content/accurate totals, stable UUID ties and snapshots. GET /api/orders/me/{id} returns owned detail; unknown/unowned detail returns the same 404 ORDER_NOT_FOUND. Query patientId cannot change ownership. |
| Literal search and identity absence | search=%25, search=_ and search=%5C remain literal rather than wildcard matches. An unlinked patient list receives 404 PATIENT_PROFILE_NOT_LINKED; an empty linked profile receives an empty 200 page. |
| Snapshots and visit boundary | After an authorized catalog change, existing order name/code/price/count/total remain original. visitDetailsAvailable=false for every state; no visit URI is fabricated. |
| First cancellation and repeat | POST /api/orders/{id}/cancel with {} for the owner or a trimmed nonblank reason for staff. PENDING becomes CANCELLED, retaining items/value and storing actor/time/reason. Repeat with a valid body returns the same original cancellation metadata/updatedAt; staff still require a reason. |
| Rejected cancellation | Another patient's order: 404; LAB_TECHNICIAN: 403; invalid staff reason: 400. If legitimate existing IN_PROGRESS/COMPLETED records are available, cancellation returns 409 without mutation. There is no API to manufacture those processing states in this stage. |
| Transport and error envelope | Cookie write without matching CSRF: 403. Invalid/ineligible bearer authentication: 401; explicit bearer takes precedence over cookies. Check {code,message,fieldErrors,requestId}, matching X-Request-Id, and Cache-Control: no-store on API errors. |

These scenarios are a manual follow-up reference, not new execution evidence.
No HTTP client or Postman was used. Automated HTTP evidence is MockMvc with real
signed JWT/security and isolated PostgreSQL; a live network server/client flow,
real email delivery, development/production application of V7 and deployment
readiness were not verified by this run.

Only IMPLEMENTATION_PLAN.md, docs/TESTING.md, docs/ORDERS_API.md and
docs/DATABASE_DESIGN.md were edited for Task 11. Pre-task source/test/configuration
hashes were captured to preserve existing work; final comparison and diff review
confirm application/test code, V1-V7, POM, security, isolation guard and local Maven
mapping are unchanged from the start of Task 11. git diff --check passes. Existing
working-tree work and local exclusions are retained; no files were staged,
committed, pushed or deployed.
