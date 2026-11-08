# Premium landing-page enhancement pass

This pass extends the existing landing page. It keeps the original marketing copy, image files, compact role-card dimensions, language dropdown, authentication components, and backend behavior.

## Phase 0: pre-edit backup

Exact location:

`C:\Users\hp\Desktop\Smart-LIMS\Frontend-backups\Frontend-20261017-180419-b02707e4`

The `Frontend/` subdirectory preserves the pre-edit source, public assets, scripts, configuration, and build output, including all 32 untracked project files. All 57 backed-up files were verified against their original SHA-256 hashes. Generated `node_modules` dependencies and browser caches were excluded. `manifest.json`, `git-status-before.txt`, and `branch-before.txt` record the snapshot. Do not overwrite this or earlier backups.

## Phases and independent rollback

Paths below are relative to `Frontend/`. Before restoring any file, compare it against the backup so later work is not overwritten. No reset, clean, branch change, or file deletion is needed.

| Phase | Enhancement | Revert this phase |
| --- | --- | --- |
| 1 — Hero | Balanced container/gap, a clearer supporting description, aligned CTAs; original image and headline preserved. | Comment out only `@import './09-hero-balance.css';` in `src/styles/refinements/index.css`. |
| 2 — Typography/spacing | Retained the existing responsive bilingual scale; centralized control height/radius, preview radius, and hover distance. | Keep shared tokens loaded for other phases. Control dimensions can be adjusted using `--lp-control-height` and `--lp-control-radius` in `tokens.css`; the earlier 52px CTA height remains in the backup. |
| 3 — Feature cards | Existing padding/alignment retained, hover lift reduced to 3px with restrained highlighting and reduced-motion support. | Restore only `02-feature-cards.css` from this backup. |
| 4 — User roles | Compact sizing, typography, two-column desktop grid and mobile stack preserved; hover lift unified to 3px. | Restore only `03-role-cards.css`. Its only change in this pass is hover distance. |
| 5 — Analytics | Uniform control heights, clearer focus states, tabular numbers and quieter chart grid; original illustrative chart/data retained. | Restore only `04-analytics.css`. |
| 6 — Security | Slightly larger, clearer existing shield outline; original copy and dark navy composition preserved. | Restore only `05-security.css`. |
| 7 — Laboratory team | Slightly wider image column balanced against the existing quote; image/crop, rounded corners, text and mobile stacking retained. | Restore only `06-laboratory-team.css`. |
| 8 — CTA | Main action height/radius aligned with the hero; original emerald card, copy, heartbeat, gap and signup behavior retained. | Restore only `07-cta.css`. |
| 9 — Footer | Existing columns protected against content sizing; subtle link-underlining feedback; exact email/mailto retained. | Restore only `08-footer.css`. |
| 10 — Product showcase | New read-only Samples/Reports/Patients tabs after User Roles, with fictional records, bilingual copy and an explicit illustrative/no-live-connection notice. | Follow the showcase rollback checklist below. |
| 11 — Interactions | Shared 3px lift, 220ms transitions, clear keyboard focus, RTL-aware tabs and reduced-motion support. | Interaction styles remain local to their stage/component. Adjust the shared motion tokens or restore the relevant stage file. |
| 12 — Validation | Translation parity/render checks extended for the showcase; browser layout, tab/keyboard, navigation, chart and authentication regression checks completed. | Restore `scripts/check-localization.mjs` if removing the showcase namespace/component. |

All numbered stage stylesheets are in `src/styles/refinements/`. The pre-existing global typography stage remains unchanged. Keep `tokens.css` loaded when disabling individual visual stages.

## Showcase-only rollback checklist

1. Remove the `ProductShowcase` import and `<ProductShowcase />` from `src/App.jsx`.
2. Remove only `['platform-preview', 'showcase']` from the navbar link array. Existing links are unchanged.
3. Remove the showcase imports/resource registrations/namespace from `src/i18n.js` if no remaining frontend page uses it.
4. Remove the optional `navigation.showcase` key from both `common.json` files.
5. Restore `scripts/check-localization.mjs` from this backup, or remove only its showcase-specific assertions and namespace entry.

The new component, stylesheet, and translation files can remain unused; there is no need to delete anything. They are isolated from real records and authentication.

## Exact source file inventory for this pass

Modified existing files:

- `src/App.jsx`
- `src/i18n.js`
- `src/components/Navbar.jsx`
- `src/locales/en/common.json`
- `src/locales/ar/common.json`
- `src/styles/refinements/index.css`
- `src/styles/refinements/tokens.css`
- `src/styles/refinements/02-feature-cards.css`
- `src/styles/refinements/03-role-cards.css`
- `src/styles/refinements/04-analytics.css`
- `src/styles/refinements/05-security.css`
- `src/styles/refinements/06-laboratory-team.css`
- `src/styles/refinements/07-cta.css`
- `src/styles/refinements/08-footer.css`
- `scripts/check-localization.mjs`

New files:

- `src/components/ProductShowcase.jsx`
- `src/components/ProductShowcase.css`
- `src/locales/en/showcase.json`
- `src/locales/ar/showcase.json`
- `src/styles/refinements/09-hero-balance.css`
- `PREMIUM_ENHANCEMENT_PHASES.md`

The production build regenerates ignored `dist/` output. No packages were added.

## Validation and remaining limits

```sh
npm run build
npm run lint
npm run test:i18n
npm run test:auth
```

Real-browser checks cover English/LTR and Arabic/RTL at 1920, 1440, 1366, 1200, 1024, 768, 430, and 375 pixels, with the actual Google Fonts loaded. Checks include image loading, no page-level/content overflow, compact role geometry, all showcase tabs, RTL/LTR arrow-key navigation, Home/End/Tab, read-only/no-network behavior, internal links, sticky-header offsets, chart controls, authentication/CTA navigation, footer email, dropdown Escape, and reduced motion. Desktop/mobile screenshots are stored locally in ignored `node_modules/.cache/showcase-review/`.

The showcase is an illustrative frontend concept using fictional IDs and generic patient labels. It does not create/update records, access APIs, or demonstrate live data. No invented performance KPIs were added to analytics. Authentication remains disconnected and retains its existing honest unavailable-on-submit behavior. Existing marketing translations, auth components, language-dropdown source, package dependencies, and public assets match the pre-edit backup.
