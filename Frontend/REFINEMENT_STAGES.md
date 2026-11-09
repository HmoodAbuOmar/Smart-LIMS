# Landing-page refinement stages

The visual polish is additive. The only change to an existing application file is the final CSS import in `src/App.jsx`:

```js
import './styles/refinements/index.css'
```

The original layout styles, translations, navbar, authentication components, and image files are preserved. The refinements reuse the existing color and font tokens and add only `--lp-*` presentation tokens.

## Verified pre-edit backup

`C:\Users\hp\Desktop\Smart-LIMS\Frontend-backups\Frontend-20261017-173725-493f5fde`

The `Frontend/` subfolder contains the original source, public assets, scripts, configuration, hidden project files, and build output. `manifest.json` contains SHA-256 hashes, and `git-status-before.txt` records the pre-edit frontend status. All 21 untracked project files were preserved. Generated `node_modules` dependencies/browser caches were excluded. This backup was created before editing application files and must not be overwritten.

## Independent visual stages

| Import in `src/styles/refinements/index.css` | Scope |
| --- | --- |
| `tokens.css` | Shared responsive type, spacing, and restrained interaction tokens. Keep loaded when disabling individual stages. |
| `01-typography.css` | Landing-page type hierarchy, paragraph readability, natural Arabic wrapping, and section spacing. Excludes navbar and authentication. |
| `02-feature-cards.css` | Three workflow cards: padding, icon alignment, equal-height rows, readable details, and subtle 4px hover lift. |
| `03-role-cards.css` | Four existing roles: icon containers, hierarchy, consistently positioned capability tags, and matching hover feedback. |
| `04-analytics.css` | Existing illustrative chart: controls, labels, spacing, axis readability, and tablet/mobile presentation. No new metrics or data sources. |
| `05-security.css` | Clearer icons, aligned descriptions, and a faint decorative outline shield. No added security claims. |
| `06-laboratory-team.css` | Existing team image, quote, and product-vision attribution: stronger balance and a quieter quotation decoration. No image overlays. |
| `07-cta.css` | Existing CTA: 40px gap above, consistent heading spacing, readable support text, and a clearer primary button. |
| `08-footer.css` | Existing columns, branding, links, copyright, and `smart-lims@gmail.com`: improved text sizes and spacing. |

## Reverting one stage

1. Open `src/styles/refinements/index.css`.
2. Comment out only the relevant numbered `@import` line. Keep `tokens.css` and the other imports enabled.
3. Run `npm run build` and check the result in both languages.

The global typography stage intentionally applies across sections. For example, disabling the role-card stage restores its original card presentation while retaining the shared type improvements. Disable typography separately if those shared changes should also be reverted.

To disable all refinements, remove only the CSS import shown above from `src/App.jsx`. No files need to be deleted, and no Git reset/clean is needed. The backup can also be used for a manual file comparison; avoid copying it over future work without reviewing differences.

## Validation

```sh
npm run build
npm run lint
npm run test:i18n
npm run test:auth
```

Browser checks cover English/LTR and Arabic/RTL at 320, 390, 620, 768, 1024, 1200, and 1440 pixels; loaded fonts/images; content overflow; equal card heights; native section anchors; chart controls; authentication and CTA entry points; and reduced motion. Local review screenshots are generated under ignored `node_modules/.cache/polish-preview/`.

The existing authentication forms remain disconnected from a backend and retain their existing unavailable-on-submit behavior. This refinement does not add APIs, live analytics, performance claims, or demo requests.
