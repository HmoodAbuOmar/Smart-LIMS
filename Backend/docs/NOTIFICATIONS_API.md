# Patient in-app Notifications API

Status: DONE, 2026-10-31. Final direct isolated wrapper suite: **404 tests / 52
suites, zero failures/errors/skips**. [Actual execution evidence](TESTING.md#patient-notifications-verification-2026-10-31).

Task NOTIF-38, requirements NOTIF-R01-R06. Source: patient-notifications.jpeg.
Orders, appointments, results/publication and patient-linking contracts remain
the authority for underlying workflows. No external delivery or system producer.

## Access and routes

All routes require a current eligible PATIENT and resolve the linked profile
from authentication. No patient/account selector. Anonymous/ineligible: 401;
staff: 403; unlinked: 404 PATIENT_PROFILE_NOT_LINKED. Unknown or foreign
notification UUIDs share 404 NOTIFICATION_NOT_FOUND. Malformed UUID/query: 400
VALIDATION_ERROR; malformed/unknown JSON fields: 400 INVALID_JSON. Existing error
envelope, request ID, bearer/cookie precedence and cookie-write CSRF apply.
All responses are JSON, Cache-Control: no-store; no read triggers auto-marking.

| Method/path | Request | 200 response |
|---|---|---|
| GET /api/notifications/me | category, unread, page, size optional | Existing `{content,page,size,totalElements,totalPages,first,last}` envelope of notification DTOs. |
| GET /api/notifications/me/unread-count | No query parameters | `{unreadCount:0}` (actual visible unread total, independent of list filters). |
| POST /api/notifications/me/{id}/read | No query; required JSON `{}` | Notification DTO; first readAt retained on repeat/concurrent calls. |
| POST /api/notifications/me/read-all | No query; required JSON `{}` | `{updatedCount:N}`; marks all currently visible owned unread rows, across categories/pages. Repeat returns 0 without rewriting timestamps. |

category is exactly ORDERS, RESULTS, APPOINTMENTS or SYSTEM; omit for All.
SYSTEM is supported as a filter but has no producer and remains empty. No welcome
message is fabricated from the screenshot. unread is exactly true/false; omit
for both states. Filters combine with AND before pagination/counting. Defaults
page=0, size=20; digits only, page>=0, size=1..100. Unknown/repeated queries and
invalid enums/booleans rejected. Sort createdAt descending then notification UUID
ascending. Distant pages are empty with accurate totals. An empty linked inbox
returns content=[], totalElements=0, totalPages=0, first/last=true; unread count 0.
Read-all on an empty inbox returns updatedCount=0. Lists/counts share a read-only
REPEATABLE_READ snapshot. Read-all is one conditional UPDATE at its statement
snapshot; notifications committed afterward remain unread. Safe retries need no
Idempotency-Key; marking read never changes createdAt or navigation data.

DTO: `id,category,eventType,title,message,createdAt,read,readAt,orderId,
appointmentId,resultId,orderItemId,navigationUrl`. Inapp content uses fixed server
templates with order numbers/retained test names, never clinical values, internal
notes, correction reasons, auth credentials or unpublished result identities.
Timestamps are UTC instants; display in Asia/Jerusalem using real DST rules.
read equals readAt!=null. orderId is always present; appointmentId only for
appointment events; resultId/orderItemId only for published result events.
navigationUrl selects the existing owned order, appointment or published result
detail endpoint. Notification reads do not grant access to target data: those
endpoints retain their own authorization. Prior publications remain navigable as
published history after corrections; working corrections are never visible.

## Real event generation and persistence

V25__patient_notifications.sql creates exactly one new table, with FKs, check
constraints, a unique event key and patient/time/unread indexes; no backfill.
New events belong to the underlying patient profile, including legitimate staff
work for an unlinked profile. They become accessible only after authorized linking
to that profile; linking itself creates no historical/welcome notification.

| Category | eventType | Trigger (actual transition only) |
|---|---|---|
| ORDERS | ORDER_CREATED | Successful new PENDING order, self or authorized staff. |
| ORDERS | ORDER_CANCELLED | First successful cancellation. |
| ORDERS | ORDER_IN_PROGRESS | First actual arrival changes PENDING to IN_PROGRESS. |
| ORDERS | ORDER_COMPLETED | Existing completion checks actually change IN_PROGRESS to COMPLETED. |
| APPOINTMENTS | APPOINTMENT_CONFIRMED | Successful new booking. |
| APPOINTMENTS | APPOINTMENT_RESCHEDULED | Real slot move; no-op same-slot/replay creates none. One per appointment revision. |
| APPOINTMENTS | APPOINTMENT_CANCELLED | First direct cancellation or required order-cancellation cascade. |
| APPOINTMENTS | APPOINTMENT_CHECKED_IN | Actual recorded arrival with appointment. |
| APPOINTMENTS | APPOINTMENT_COMPLETED | Actual administrative visit completion. |
| APPOINTMENTS | APPOINTMENT_NO_SHOW | Actual authorized no-show transition. |
| RESULTS | RESULT_PUBLISHED | First successful initial result publication. |
| RESULTS | RESULT_CORRECTED | Successful publication of a corrected version, not correction creation/approval. |

Notification inserts participate in the **same transaction** as the source change
(MANDATORY propagation). No asynchronous/after-commit separate write or external
queue: commit exposes both, rollback exposes neither. Notification failure rolls
back the workflow too. Existing source locks/retry checks remain; a database unique
event key also protects duplicates: event type + order/result UUID, and for slot
moves appointment UUID + committed revision. Other appointment events happen at
most once per appointment. Insert conflict does nothing and preserves read state.
No events on failed validation, authorization, replay, approval, draft/edit,
definition/catalog/profile changes or bare reads; no historical event synthesis.
Patient ownership and PUBLISHED visibility are also checked on inbox reads,
unread counts and read mutations. A publication notification may remain after it
is superseded because the exact published version remains patient-readable.

## Screen and Dashboard mapping

All / Unread / category tabs use GET list filters. Cards show title/category/time,
read state and the actual navigationUrl/IDs. Clicking a card may explicitly POST
its read action before navigating; GET list alone never marks it read. Mark all
as read uses the global read-all action. Bell/unread badge and Dashboard use the
same visible unread count. Dashboard notifications becomes
`{available:true,unreadCount:N}`; empty is a real 0. System tab has no synthetic
content. Search catalog, profile menu, sidebar destinations and breadcrumbs reuse
the already documented Dashboard destination APIs/client navigation.

Examples (existing patient credentials; cookie writes need existing CSRF header):

```http
GET /api/notifications/me?category=RESULTS&unread=true&page=0&size=20
GET /api/notifications/me/unread-count
POST /api/notifications/me/{notificationId}/read
Content-Type: application/json

{}
```

POST /api/notifications/me/read-all uses the same empty body. No client notification
creation, deletion, text editing, read-reset, email/SMS/push or system announcements
are provided. Existing notifications are retained. Verification belongs in
TESTING.md; no deployment or real-delivery claim follows from source inspection.

Illustrative one-row response (synthetic UUIDs; runtime fields come from persisted
source events, never screenshot placeholders):

```json
{
  "content": [{
    "id": "00000000-0000-0000-0000-000000000001",
    "category": "ORDERS",
    "eventType": "ORDER_CREATED",
    "title": "Order created",
    "message": "Order ORD-000001 is PENDING.",
    "createdAt": "2026-10-31T08:00:00Z",
    "read": false,
    "readAt": null,
    "orderId": "00000000-0000-0000-0000-000000000002",
    "appointmentId": null,
    "resultId": null,
    "orderItemId": null,
    "navigationUrl": "/api/orders/me/00000000-0000-0000-0000-000000000002"
  }],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1,
  "first": true,
  "last": true
}
```
