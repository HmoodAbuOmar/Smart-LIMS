# Smart-LIMS — Frontend Implementation Plan

> **Scope:** Frontend only (`Frontend/`). Do not modify `Backend/`.
>
> **Stack:** React 19 + Vite + JSX. Backend: Java 21, Spring Boot, PostgreSQL, Spring Security, JWT.
>
> **Status:** UI preview in progress — mock data and custom client router (no new npm deps yet). Backend integration pending verified API docs.
>
> **Source of truth:** The approved Smart-LIMS Database and API Documentation, together with the actual backend implementation for already implemented modules.

---

## 1. Repository Status and Integration Rules

The frontend is built with React 19 and Vite. The current application starts from `main.jsx` and `App.jsx`. The frontend still needs its routing, API client, authentication state, layouts, and feature modules.

The backend branch available for frontend development may contain only a skeleton. Do not assume that every planned backend module or endpoint is implemented.

Authentication and User Management endpoints may be integrated only after checking the actual backend controllers, DTOs, security configuration, and current branch.

### Integration rules

1. Do not modify any files inside `Backend/`.
2. Do not invent API endpoints, request fields, response fields, enum values, or permissions.
3. Use the approved Database and API Documentation for domain modules.
4. Verify existing Auth and User Management endpoints against the actual backend source code.
5. If an endpoint is documented but not implemented, keep the frontend feature mocked until the backend is ready.
6. If the documentation and backend implementation disagree, report the discrepancy to the team instead of silently changing either contract.
7. Use API DTOs for frontend requests and responses. Do not assume that database column names are identical to JSON property names.
8. Do not install dependencies or implement features until the team approves the implementation phase.

---

## 2. Recommended React Folder Structure

```text
Frontend/
  src/
    app/
      App.jsx
      routes.jsx
      providers.jsx

    pages/
      public/
      admin/
      patient/
      receptionist/
      lab/
      shared/

    features/
      auth/
      users/
      patients/
      laboratory-tests/
      test-parameters/
      reference-ranges/
      test-orders/
      order-items/
      appointment-slots/
      appointments/
      payments/
      samples/
      sample-tests/
      test-results/
      result-values/
      notifications/
      audit-logs/
      symptom-assessments/
      suggested-tests/

    components/
      ui/
      layout/
      feedback/
      data-display/

    lib/
      api/
      auth/
      constants/

    mocks/
    hooks/
    assets/
    styles/

  docs/
    DATABASE_API_DOCUMENTATION.md
```

Each feature should contain its API functions, relevant hooks, components, and mock data where needed.

Keep pages focused on layout and page-level composition. Reusable business logic belongs in the relevant feature folder.

The documentation file path above is a proposed location. If the approved documentation already exists elsewhere in the repository, use its actual location instead of creating a duplicate.

---

## 3. User Roles

The planned roles are:

* `ADMIN`
* `PATIENT`
* `RECEPTIONIST`
* `LAB_TECHNICIAN`

Confirm the final role names against the approved documentation and backend enum before implementation.

Frontend route guards improve navigation and user experience, but the backend must enforce authorization for every protected operation.

---

## 4. Application Pages

### Public pages

* Landing page
* Login
* Patient registration
* Forgot password
* Reset password
* Email confirmation
* Set password

### Shared authenticated pages

* Role-based dashboard redirect
* Account profile
* Notifications inbox, according to documented permissions
* Forbidden page (403)
* Not found page (404)

### ADMIN

* Dashboard
* User list, creation, details, and editing
* Laboratory test management
* Test parameter management
* Reference range management
* Appointment slot management
* Audit log viewing

### PATIENT

* Patient dashboard
* Symptom assessment and history
* Suggested tests
* Laboratory test catalog
* Test order creation and history
* Appointment booking and history
* Payment history and payment status
* Published test results
* Order and sample tracking
* Notifications
* Account profile

### RECEPTIONIST

* Reception dashboard
* Patient search and registration
* Patient details and permitted updates
* Test order creation and management
* Order item management within the order workflow
* Appointment scheduling
* Payment recording and history
* Account profile
* Notifications

Sample collection and laboratory processing should primarily belong to the `LAB_TECHNICIAN` workflow. Receptionists should only receive the sample-related access explicitly allowed by the approved documentation.

### LAB_TECHNICIAN

* Laboratory dashboard
* Worklist
* Sample list and details
* Sample test management
* Draft result entry and editing
* Result publication, only if explicitly permitted by the documented workflow
* Result value entry
* Notifications
* Account profile

Do not assume that every role has access to every operation within a module.

---

## 5. Reusable Components

| Area           | Components                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Layout         | `AppShell`, `Sidebar`, `TopBar`, `PageHeader`, `RoleNav`, `Breadcrumbs`                        |
| Authentication | `ProtectedRoute`, `GuestOnlyRoute`, `RequireRole`                                              |
| Forms          | `FormField`, `TextInput`, `Select`, `DateTimePicker`, `FormErrorSummary`                       |
| Data display   | `DataTable`, `FilterBar`, `Pagination`, `EmptyState`, `LoadingSkeleton`                        |
| Workflow       | `StatusBadge`, `OrderTimeline`, `ConfirmDialog`                                                |
| Laboratory     | `TestCatalogPicker`, `OrderItemsEditor`, `SlotPicker`, `ReferenceRangeHint`, `ResultValueGrid` |
| API feedback   | `ApiErrorBanner`, `FieldError`, `LoadingState`                                                 |

Only introduce components when they are needed by an approved feature.

---

## 6. Routing Structure

Use React Router after the team approves the dependency.

```text
/
  /login
  /register
  /forgot-password
  /reset-password
  /confirm-email
  /set-password

/app
  /dashboard
  /profile

  /admin
    /dashboard
    /users
    /users/new
    /users/:id
    /tests
    /test-parameters
    /reference-ranges
    /appointment-slots
    /audit-logs

  /patient
    /dashboard
    /assessments/new
    /assessments/:id
    /suggested-tests
    /catalog
    /orders
    /orders/new
    /orders/:id
    /appointments
    /payments
    /results
    /results/:id
    /notifications

  /reception
    /dashboard
    /patients
    /patients/new
    /patients/:id
    /orders
    /orders/new
    /orders/:id
    /appointments
    /payments

  /lab
    /dashboard
    /worklist
    /samples
    /samples/:id
    /sample-tests
    /results/:id/edit
    /notifications

/forbidden
*
```

These are proposed frontend routes, not backend API endpoints.

Redirect authenticated users according to their role. Deny access to pages outside their permitted role. Enforce actual data access and permissions on the backend as well.

---

## 7. API Integration Plan

### 7.1 Authentication and User Management

Before integration, verify the following endpoints against the actual backend implementation.

The current planning reference lists:

| Method | Endpoint                             | Purpose                          |
| ------ | ------------------------------------ | -------------------------------- |
| POST   | `/api/auth/register`                 | Register an account              |
| GET    | `/api/auth/confirm-email`            | Confirm email                    |
| POST   | `/api/auth/login`                    | Authenticate and receive a token |
| POST   | `/api/auth/cookie-login`             | Authenticate using cookies       |
| GET    | `/api/auth/me`                       | Retrieve the current account     |
| POST   | `/api/auth/logout`                   | Log out                          |
| POST   | `/api/auth/forgot-password`          | Request password reset           |
| POST   | `/api/auth/reset-password`           | Reset password                   |
| POST   | `/api/auth/set-password`             | Set an account password          |
| GET    | `/api/users`                         | List accounts                    |
| GET    | `/api/users/{id}`                    | Retrieve an account              |
| POST   | `/api/users`                         | Create an account                |
| PUT    | `/api/users/{id}`                    | Update an account                |
| PUT    | `/api/users/{id}/role`               | Change account role              |
| PATCH  | `/api/users/{id}/block`              | Block an account                 |
| PATCH  | `/api/users/{id}/unblock`            | Unblock an account               |
| DELETE | `/api/users/{id}`                    | Delete an account                |
| POST   | `/api/users/{id}/set-password-email` | Send a set-password email        |

Treat this table as a verification checklist, not as proof that every endpoint is available on the current branch. Confirm HTTP methods, request bodies, responses, and authorization before using them.

### 7.2 Authentication mode

The team must choose one primary authentication strategy for the frontend.

**Option A: Bearer JWT**

* Send the access token using the documented `Authorization: Bearer` header.
* Follow the backend's token storage and expiration rules.
* Handle expired sessions and logout consistently.
* Never expose credentials or tokens in logs.

**Option B: Cookie-based authentication**

* Use the backend's documented cookie configuration.
* Configure credentialed requests where required.
* Obtain and send the CSRF token for protected state-changing requests if required by the backend.
* Confirm allowed frontend origins and local development settings.

Do not implement both flows in parallel unless the team explicitly requires both.

The actual backend security configuration determines which option is supported and how it must be implemented.

### 7.3 Domain modules

The planned domain modules are:

1. Patients
2. Laboratory Tests
3. Test Parameters
4. Reference Ranges
5. Test Orders
6. Order Items
7. Appointment Slots
8. Appointments
9. Payments
10. Samples
11. Sample Tests
12. Test Results
13. Result Values
14. Notifications
15. Audit Logs
16. Symptom Assessments
17. Suggested Tests

Authentication and User Management are handled separately.

For each domain module, document and verify:

* API endpoint paths
* HTTP methods
* Request DTOs
* Response DTOs
* Validation rules
* Enum values and status transitions
* Role permissions
* Pagination and filtering
* Error response format
* Whether the endpoint is implemented or planned

Do not fill missing contracts with guessed values.

---

## 8. Module-Specific Business Rules

### Patients

* A patient may or may not have a user account, depending on the approved data model.
* Use the documented relationship and identifiers.
* Restrict patient self-service access to the patient's own records.
* Do not assume that `patientId` and `userId` are interchangeable.

### Laboratory Tests

* Support the documented create, read, and update operations.
* If tests can be deactivated, use the documented activation/status operation instead of assuming hard deletion.
* Preserve historical references required by existing orders and results.
* Do not invent a status endpoint such as `/status` unless it exists in the API contract.

### Test Parameters and Reference Ranges

* Follow the documented relationship between laboratory tests, parameters, and reference ranges.
* Preserve historical ranges used to interpret existing results.
* Respect effective dates, units, age/sex applicability, and other criteria only where defined by the documentation.
* Do not assume a hard-delete operation is safe.

### Test Orders and Order Items

* Follow the documented order creation and item management workflow.
* Validate selections and prices using backend-provided data.
* Do not calculate authoritative totals solely on the frontend.
* Follow the documented order status transitions and cancellation rules.

### Symptom Assessments and Suggested Tests

* Display recommendations returned by the backend.
* Allow the patient to review and select recommended tests.
* Create an order only through the documented order workflow after the patient confirms their selections.
* Do not automatically create orders merely because recommendations were generated.

### Appointments

* Display only the slots returned by the backend.
* Respect the documented booking, cancellation, and rescheduling rules.
* Do not assume a slot is available based solely on frontend state.
* The backend must validate capacity and prevent conflicting bookings.

### Payments

* Initially support payment history, payment status, and any payment recording operations defined in the documentation.
* Do not assume online checkout, a payment gateway, or card processing is available.
* Add online payment functionality only after the team confirms the payment provider and backend API contract.
* Prevent duplicate submissions in the UI, while relying on backend validation for transaction integrity.

### Samples and Sample Tests

* Follow the documented sample creation, collection, rejection, and replacement workflow.
* Keep sample operations primarily within the laboratory workflow unless the permission matrix explicitly grants other roles access.
* Display documented identifiers and statuses.
* Do not invent barcode generation or sample assignment behavior.

### Test Results and Result Values

* Use the result lifecycle defined by the backend.
* Under the planned workflow, draft results may be edited by authorized laboratory staff.
* Published results must be read-only through ordinary editing operations.
* Corrections to published results must follow the documented correction/versioning workflow.
* Patients may view published results only when the documented release rules permit access.
* Reference ranges and result flags must follow backend rules.

### Notifications

* Support listing notifications, unread counts, and marking notifications as read where documented.
* Support marking all notifications as read only if the API provides this operation.
* Notifications should normally be generated by backend events such as order changes or result publication.
* Do not assume the frontend can create notifications manually.
* Use polling, WebSocket, or SSE only as specified by the backend contract.

### Audit Logs

* Treat audit logs as read-only.
* Support listing, viewing, and filtering only where documented.
* Do not provide normal create, edit, or delete actions.
* Use the actual audit log fields and filter parameters from the API documentation.

---

## 9. Mock Data vs Real API

Use the real API only for endpoints verified as implemented and available in the target backend environment.

Use mock data for domain modules that have not yet been implemented or whose contracts are not finalized.

Recommended configuration:

```text
VITE_API_BASE_URL=
VITE_USE_MOCKS=true
```

These variables are proposed for a future `.env.example`. Do not add configuration or dependencies until implementation is approved.

Mock fixtures must match the approved DTO definitions. Keep mock and real API access behind the same feature-level interface so that mocks can be replaced without rewriting the page components.

Do not use mock data to imply that an endpoint exists on the backend.

---

## 10. Error Handling and Security

* Handle loading, empty, success, and error states.
* Use the backend's actual error response contract.
* Display field validation errors next to the relevant inputs.
* Do not rely on frontend role checks as the only authorization mechanism.
* Do not expose password hashes, tokens, internal secrets, or sensitive backend details.
* Do not store or log unnecessary patient or laboratory information.
* Restrict patient data to authorized users and documented ownership rules.
* Avoid placing sensitive medical information in URLs or browser logs.
* Confirm that authentication, CORS, CSRF, and session expiration behavior match the selected authentication strategy.

---

## 11. Recommended Implementation Order

### Phase 1 — Foundation

* Confirm repository structure.
* Agree on the official documentation location.
* Agree on authentication mode.
* Approve routing and folder structure.
* Add the minimum approved dependencies.
* Create shared layouts and global styles.

### Phase 2 — Authentication

* Implement approved login and registration flows.
* Implement session initialization and logout.
* Implement password recovery and email confirmation.
* Add protected routes and role-based navigation.
* Verify behavior against the running backend.

### Phase 3 — User Management

* Implement admin user management using verified endpoints.
* Handle loading, validation, errors, and permissions.

### Phase 4 — Mocked Domain Features

* Build reusable mock infrastructure.
* Implement domain pages using DTOs from the approved documentation.
* Keep unsupported operations unavailable rather than inventing endpoints.

### Phase 5 — Core Laboratory Workflow

Recommended dependency order:

1. Patients
2. Laboratory Tests
3. Test Parameters
4. Reference Ranges
5. Test Orders
6. Order Items
7. Appointment Slots
8. Appointments
9. Payments
10. Samples
11. Sample Tests
12. Test Results
13. Result Values

### Phase 6 — Supporting Features

* Symptom Assessments
* Suggested Tests
* Notifications
* Audit Logs
* Dashboards and workflow tracking

### Phase 7 — Incremental API Integration

Replace mocks module by module as the corresponding backend endpoints become available and verified.

### Phase 8 — Testing and Hardening

* Test authentication and authorization flows.
* Test one end-to-end patient journey.
* Test one reception workflow.
* Test one laboratory result workflow.
* Verify validation, loading, error, and empty states.
* Check responsive layout and accessibility.

---

## 12. Questions for the Backend Team

Resolve these questions before implementing dependent features:

### Documentation and API contracts

* Where is the approved Database and API Documentation stored?
* Are OpenAPI specifications available?
* What are the exact request and response DTOs for each module?
* What is the role-permission matrix?
* What pagination, filtering, and sorting parameters are supported?

### Authentication

* Is Bearer JWT or cookie-based authentication the primary frontend strategy?
* What are the token expiration and refresh rules, if applicable?
* What are the allowed development origins?
* What are the email confirmation and blocked-account rules?
* Can users update their own profiles?

### Domain workflow

* How is a patient linked to a user account?
* Which roles can create and manage samples?
* What are the valid order status transitions?
* Are order items nested inside orders or managed separately?
* How are prices and totals calculated?
* Is online payment supported, or are payments recorded by staff?
* How are samples linked to order items?
* Who may enter, review, publish, and correct results?
* How are reference ranges selected?
* What is the exact symptom assessment and recommendation contract?
* How are notifications delivered?
* Which audit log filters are supported?

### Delivery

* Which backend modules are implemented?
* Which branch and environment should the frontend use?
* When will each remaining module be available?

---

## 13. Documentation Alignment Checklist

| Item                       | Required action                                             |
| -------------------------- | ----------------------------------------------------------- |
| Authentication endpoints   | Verify against current controllers and DTOs                 |
| User Management endpoints  | Verify HTTP methods, request bodies, and permissions        |
| Domain endpoints           | Use the approved Database and API Documentation             |
| DTO field names            | Match actual API request/response contracts                 |
| Role permissions           | Match the approved permission matrix                        |
| Order and sample workflows | Confirm valid transitions with the backend team             |
| Payments                   | Confirm whether online payment is supported                 |
| Results                    | Confirm publication and correction rules                    |
| Notifications              | Confirm supported operations and delivery mechanism         |
| Audit logs                 | Confirm fields, filters, and read-only behavior             |
| Mock data                  | Match approved DTOs; do not imply unsupported endpoints     |
| Implementation status      | Clearly distinguish implemented endpoints from planned ones |

---

## 14. Final Implementation Rule

This document is a frontend implementation plan, not proof that every backend endpoint exists.

The frontend team must first align the plan with the approved Database and API Documentation, confirm the authentication strategy, and agree on the first implementation phase.

Until approval is given, do not modify application code, install dependencies, or change backend files.

Update this document whenever the approved API contract or implementation status changes.
