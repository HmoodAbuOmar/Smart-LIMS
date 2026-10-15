# API and documentation gaps (frontend)

**Last updated:** Implementation start — repository inspection.

## Missing source of truth

| Expected artifact | Status |
| ----------------- | ------ |
| `Frontend/docs/DATABASE_API_DOCUMENTATION.md` (or equivalent) | **Not present** in this repository |
| OpenAPI / Swagger export | **Not found** |
| Backend controllers (auth, users, domain) | **Not implemented** on current `Backend/` branch (skeleton only) |

## What the frontend uses instead

- **UI structure and routes:** [FRONTEND_IMPLEMENTATION_PLAN.md](./FRONTEND_IMPLEMENTATION_PLAN.md)
- **Auth / user HTTP checklist:** Section 7.1 of the plan (treat as *unverified* until backend + docs exist)
- **Mock fixtures:** `Frontend/src/mocks/` — field names follow the plan’s module names and common LIMS shapes, marked with `UNVERIFIED` comments where DTOs are not documented

## Do not assume (until documented)

- Exact JSON property names for entities (patient, order, sample, result, etc.)
- Enum values and status transition graphs
- Role-permission matrix beyond the four planned roles
- JWT vs cookie auth mechanism and error response shape
- Pagination/filter query parameters

## When documentation arrives

1. Replace mock types in `src/mocks/` with documented DTOs.
2. Point `src/lib/api/` at real endpoints; set `VITE_USE_MOCKS=false`.
3. Update this file with verification notes per module.
