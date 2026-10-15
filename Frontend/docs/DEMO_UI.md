# Smart-LIMS frontend demo

## Run

```bash
cd Frontend
npm install
npm run dev
```

Open `http://localhost:5173/`

## Demo login (not real security)

Password for all demo accounts: **`demo`**

| Role | Email |
|------|--------|
| Admin | `admin@smartlims.demo` |
| Patient | `patient@smartlims.demo` |
| Reception | `reception@smartlims.demo` |
| Lab | `lab@smartlims.demo` |

## Mock data

- Stored in `sessionStorage` key `smart_lims_demo_state_v2` when you create orders, patients, payments, etc.
- Admin dashboard **Reset demo data** restores the initial fictional dataset.
- Orange banner in app areas reminds you that nothing is sent to a backend.

## Public website

- `/` Home
- `/about` About
- `/tests` Catalog with search & pagination
- `/tests/:testId` Details
- `/tests/:testId/preparation` Preparation instructions

## Backend

No backend files are modified. API paths are listed in `src/services/endpoints.js` for future integration.
