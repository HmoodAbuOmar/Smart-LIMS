# Shared role sidebar

`WorkspaceSidebar.jsx` and `WorkspaceSidebar.css` are the single presentation source for the existing Admin, Patient and Receptionist sidebars. The design is extracted from Admin → Patients: 256px desktop width, 28px/18px/18px padding, 158×64px logo, 46.4px navigation rows, 14px semibold text, 18px icons, 6px menu gaps and the original mint active edge. Footer geometry follows the original divider, Logout row and segmented language control.

Layouts supply their authorized menu items, labels, icons, active ID and navigation callbacks. Groups are supported without changing the Admin Catalog guard. Optional `dataPage`, badge, disabled and description fields preserve the Patient and Receptionist contracts. Legacy CSS classes are passed only as hooks for existing checks; their competing sidebar styles have been removed.

Language changes call the owning layout's existing preference handler. Admin retains its separate Admin preference; Patient and Receptionist retain the app-wide preference. Logout delegates to each existing callback; failures stay visible and no success is invented. The current real transport is unavailable. Patient development exit remains its original local login navigation.

At 900px and below, every role uses the Admin inline, scrollable mobile sidebar rather than the former Patient/Receptionist slide-out. The common 65dvh slot and footer spacing keep footer controls aligned despite different menu lengths. Header, navigation contents and services remain owned by their roles.

There is no Lab Technician layout or menu/route implementation in this checkout. No fake Lab menu or permissions are created. The component is role-independent and can accept the existing Lab menu when that source is provided.

Run from `Frontend/`:

```text
npm run build
npm run lint
node src/components/check-role-sidebars-browser.mjs
node src/admin/patients/check-patients-management-browser.mjs
node src/receptionist/today/check-today-browser.mjs
```

The role comparison uses 1440px and 390px viewports at 100% zoom in English and Arabic. It checks geometry, menu and footer typography, language behavior, Catalog expansion, role navigation, disabled Receptionist links, logout handling and mobile scrolling. Screenshots, measurements and comparison HTML are written to a temporary directory. Lab Technician is explicitly excluded from verification until its layout exists.
