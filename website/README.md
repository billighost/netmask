# NetMask website

The selected **Field Atlas** direction is implemented as a React 18 and Vite site with client-side navigation.

```sh
npm run site:dev
npm run site:typecheck
npm run site:build
```

Routes:

- `/` — local-first product story and overview
- `/story/` — history, data use, Going live, presets, digests, evidence, alerts, naming, and restoration
- `/downloads/` — platform-aware direct downloads and installation notes
- `/project/` — creator, open-source project, principles, and architecture
- `/motion-preview/` — isolated scroll, pointer, hover, and responsive-motion study

Internal navigation uses the History API and does not reload the page. Each route also has an HTML entry so direct visits and refreshes work on static hosting. The production build is written to `dist-site/`.

The motion study is deliberately isolated behind a body class and unlinked from the public navigation. Its motion can be paused in-page, and `prefers-reduced-motion` disables the animated treatment.

The public site uses packaged assets and static project statements. It does not load remote fonts, analytics, telemetry, or live third-party counters. Download and source links leave the site only after the visitor chooses them.
