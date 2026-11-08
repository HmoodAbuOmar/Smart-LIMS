# Smart-LIMS frontend

A responsive React + Vite landing page with Lucide icons, local medical photography, and an interactive health trend preview.

## Development

```sh
npm install
npm run dev
```

## Checks

```sh
npm run build
npm run lint
npm run test:i18n
npm run test:auth
```

## Content and integration

- `src/App.jsx`: page sections, capability data, chart controls, and authentication navigation.
- `src/App.css`: responsive page styles.
- `src/index.css`: design tokens, typography, accessibility defaults.
- `public/images/`: locally bundled Unsplash photographs.
- Google Fonts supplies IBM Plex Sans (400–700) for English and Alexandria (400–800) for Arabic, with system font fallbacks. Font families and semantic weights are centralized in `src/index.css` and follow the existing i18n language setting.
- Get Started opens Sign Up; Login opens the Login dialog. Both use the shared emerald modal styling and support Arabic/English, required-field validation, password visibility controls, and keyboard dismissal.
- Authentication is not connected to an API in this frontend. A visible message explains that no account is created and no login takes place. Credentials stay in component memory and are cleared when closing or switching forms; they are never emailed, persisted, or sent to a guessed endpoint.
- The regular footer contact email is `smart-lims@gmail.com`. The security section also retains its privacy contact link.
- The testimonial and chart data are clearly labeled illustrative. Replace the testimonial with approved customer feedback when available.

Photo sources:
- Laboratory: https://images.unsplash.com/photo-1579154204601-01588f351e67
- Medical professional: https://images.unsplash.com/photo-1622253692010-333f2da6031d

## Localization

- `src/i18n.js` initializes i18next and react-i18next before React renders. English is the default; the selected language is restored from `localStorage` using `smart-lims.language`. Blocked storage falls back gracefully.
- `src/locales/{en,ar}/common.json` contains shared navigation and UI labels. `landing.json` contains page-specific copy, form text, chart labels, accessibility descriptions, and metadata. `auth.json` contains Sign Up/Login copy and validation messages.
- `src/components/LanguageSwitcher.jsx` changes language immediately without navigation or reloading. The document `lang`, `dir`, title, and description update together.
- Direction-aware CSS uses logical spacing. The wordmark, email address, and chronological chart retain their natural left-to-right order inside Arabic layouts.
- For a new frontend page, add matching namespace JSON files in both language folders, register them in `src/i18n.js`, and use `useTranslation('yourNamespace')`. Reuse `common` for shared controls. Keep state values independent of translated display labels.
- `npm run test:i18n` checks translation parity, interpolation, saved preferences, direction, metadata, rendered copy, stable chart values, and switching with blocked storage.

