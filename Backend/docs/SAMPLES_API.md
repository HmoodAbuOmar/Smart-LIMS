# Samples API Contract — Stage 4

Stage 4 DONE, 2026-10-30; final isolated suite 319/319, zero failures/errors/skips.
Evidence: TESTING.md#stage-4-verification-2026-10-30. No deployment claim. Minimum
specimen foundation for RESULTS_API.md, linked to real VISITS_API.md records.

LAB_TECHNICIAN or explicitly authorized laboratory ADMIN manages specimens.
Ordinary technical ADMIN and RECEPTIONIST have no clinical specimen write access.
Catalog sampleType remains descriptive; suitability is never inferred from it.

| Method/path | Behavior |
|---|---|
| POST /api/samples | {visitId,sampleType,containerType nullable,collectedAt nullable,replacesSampleId nullable}; Idempotency-Key; server barcode; 201/200 replay. |
| GET /api/samples?orderId={id} | Laboratory staff paginated same-order specimens; page/size. |
| GET /api/samples/{id} | Laboratory staff complete specimen record. |
| POST /api/samples/{id}/receive | {expectedVersion}; record actual receipt actor/server time. |
| POST /api/samples/{id}/attestations | {orderItemId}; explicit positive suitability attestation, original actor/time retained; safe repeat. |
| POST /api/samples/{id}/reject | {expectedVersion,reason}; required trimmed nonblank reason <=1000. |

Initial state REGISTERED asserts only record creation. Optional supplied collection
time is stored separately, never invented from receipt/visit time; must not be
future and may precede arrival (no invented collection-location policy).
REGISTERED→RECEIVED or REJECTED;
RECEIVED→REJECTED; rejected specimens cannot be received or used for approval.
Receipt time server-derived and >=known collection. Record author is not claimed
to be actual collector when collector identity was not supplied.

Positive suitability requires RECEIVED and an order item explicitly included in
that specimen's real visit. Retain one attestation per specimen/item with actor/
time. No automatic compatibility rules, ranges or clinical seed values. Rejection
is retained and requires a reason; no deletion or revival. Creating a replacement
requires an existing REJECTED original from the same order, may use a new real
visit, and retains original/replacement IDs. New records only point to existing
parents, preventing cycles; no parent rewrite. Replacements require their own
receipt and attestation. A result may use multiple eligible specimens; each must
have the same order/item and traceable visit membership.

Samples referenced by APPROVED/PUBLISHED versions are protected evidence: reject
with 409 SAMPLE_IN_USE rather than rewriting approved/publication history. An
unpublished approval can first be invalidated via draft edit. Post-publication
recall/withdrawal is not inferred. Publication stores full immutable specimen,
visit-reference, collection/receipt and attestation snapshots; later profile/
catalog changes cannot rewrite the report.

sampleType trimmed nonblank <=40; containerType optional <=60. Strict UUIDs,
timestamps (offset, seconds, <=6 fractional digits) and JSON types; unknown keys,
bad pagination/duplicate queries→400. Same standard page envelope, createdAt
descending/UUID ascending; no patient generic specimen endpoint (patient-safe
specimen data is projected through authorized visit/result details).

Responses: id,barcode,visitId/visitNumber,orderId,status,version,sampleType,
containerType,collectedAt nullable,receivedAt/receivedBy nullable,rejectedAt/
rejectedBy/rejectionReason nullable,replacesSampleId,attestations,createdAt,
createdBy and retained lifecycle events for staff. Patient projections omit
internal events/notes. Error envelope and auth transport follow RESULTS_API.md.
404 SAMPLE_NOT_FOUND; 409 SAMPLE_STATE_CONFLICT, SAMPLE_CHANGED, SAMPLE_IN_USE,
SAMPLE_RELATIONSHIP_CONFLICT, IDEMPOTENCY_KEY_REUSED. All writes lock the existing
order before specimen/result checks; approval/publication/rejection serialize.
Execution evidence is in TESTING.md; exact end-to-end examples are in
RESULTS_API.md#manual-http-verification.
