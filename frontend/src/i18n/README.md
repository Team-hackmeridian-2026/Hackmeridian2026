# Frontend translations

English is the default. The header switches between English, French and Portuguese;
the preference is stored under `biolicensing.lang` in localStorage. Unsupported
preferences or unavailable storage fall back to English.

Keep the same nested keys and interpolation placeholders in `en.json`, `fr.json`
and `pt.json`. Use `useTranslation()` in React components and the shared i18n
instance in non-React helpers. Translate UI labels, not user-entered patent data,
Stellar addresses, contract names or standards such as EURC, SEP-24 and IP-NFT.

From `frontend/`:

```bash
npm install
npm run test:i18n
npm run build
npm run dev
```

For manual review, switch EN/FR/PT on the marketplace, patent listing form, an
existing licence detail page, cash-out and administration. Check that a reload
preserves the language and switching languages preserves partially entered form
data. Also check the navigation on a narrow mobile viewport. External wallet and
anchor interfaces control their own translations.

Dependencies are pinned: i18next 26.4.3 (published 2026-10-10) and react-i18next
17.0.16 (published 2026-10-06), both at least two weeks old on 2026-10-25.
