# ROADMAP

Pending features và improvements đã thảo luận. Owner Nam quyết định priority.

## Deferred bugs (don't fix unless asked)

### Bug #11: Notifications schema flat vs rule-nested
- **Status**: Reviewed, intentionally deferred (Round 73-ish)
- **Reason**: App runs correctly despite inconsistency. Refactor cost not justified for ~50-user internal lab app.
- **Action**: Don't bring up unless owner explicitly asks to revisit.

## Discussed but deferred features

### Notification system improvements
- Real push notifications (Web Push API) — currently in-app toasts only
- Email digest cho overdue equipment maintenance
- Webhook integration cho lab leadership alerts

### Origin integration enhancements
- Auto-cleanup `.ogs` files in UFF after Origin loads them (currently accumulates)
- Support more file types: `.opj`, `.opju` direct open
- Multi-file batch open (select multiple attachments → 1 Origin session)

### Bundle optimization (rejected/deferred)
- **lightningcss CSS minifier**: Tested Round 103b, NO gain (Tailwind purge already optimal). Don't retry.
- **SVG sprite extraction**: 69 inline SVGs total only 16KB raw, sprite saves ~5KB after gzip. Not worth refactoring.
- **HTML minification**: 132KB HTML gzips to 22KB already. Optimal.
- **Replace pdfmake**: 975KB lib for monthly reports. Possible alternatives: jsPDF + custom layout (~200KB) — but loses Vietnamese font support.

### Performance migration ideas
- **Replace Chart.js (203KB)** with uPlot (40KB) — rejected Round 89 in favor of OffscreenCanvas. May reconsider if mobile perf becomes critical.
- **EIS-specific parser**: Currently parsers/index.ts covers CV/LSV/GCD only. EIS impedance spectroscopy needs separate logic.

## Active in production (don't break)

### CSP architecture (Round 55-58e)
- Strict CSP với `'unsafe-inline'` chỉ cho `style-src` (437 inline styles in index.html)
- Future phase to extract inline styles → external CSS classes (separate refactor effort)
- Mozilla Observatory 125/100 Grade A+

### Memory + plot system (Round 89-94)
- OffscreenCanvas + Web Worker cho PNG export (no main thread block)
- High-res PNG match preview exactly (Round 92-94)
- Worker file: `src/ts/services/plot/highres-png.worker.ts`

### Origin Lab integration (Round 95-102)
- Web → Browser → Protocol handler → Wrapper batch → Origin auto-execute
- See [.claude/skills/labbook/origin-integration.md](./.claude/skills/labbook/origin-integration.md)
