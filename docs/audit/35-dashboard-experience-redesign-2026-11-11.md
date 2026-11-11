# Dashboard experience redesign — 2026-11-11

## Scope

Base source: `b9da5096dc30d9121c602d87cc98dc3ce899931e` (1.0.8).
Working branch: `feat/dashboard-experience-redesign`.

This is a source-level redesign of the complete dashboard route surface: all
24 page entrypoints, including provider/tool/media details, pricing, settings,
analytics and chat. `/dashboard` continues to share the endpoint screen. This
work does not assert a published package/container, production deployment or
live provider availability. Historical tags and release versions remain intact.

The goals were to reduce stacked decorative frames and repeated introductions,
make the main action/data hierarchy clearer, contain long content on narrow
screens, and keep navigation usable during loading and motion.

## Shared composition and navigation

- Replaced the floating, nested desktop frame with one canvas, a 244px task rail
  and a 64px base header. Settings/documentation stay available in the footer;
  the full mobile drawer and quick-navigation dock retain their roles.
- Kept a neutral light/dark semantic palette and the existing ember identity.
  Common cards now use 14px corners, 16px mobile/20px desktop padding, quiet
  borders and restrained elevation. Dialogs and drawers carry stronger depth.
- Standardized page headings, action rows, toolbars, section headings and metric
  strips. Reduced hover-only actions and kept controls reachable by keyboard.
- Reworked breadcrumbs for provider/tool/media details, chat, PXPIPE and pricing.
  Header search remains controlled and survives same-route URL changes.
- Router-owned Link pending state drives inline and header feedback after a 120ms
  visual delay. The progress line follows the actual header height, including
  mobile search. No invented progress percentage or navigation click timer.
- Shortened route arrival/departure to 220/120ms; retained one live page tree and
  native snapshot transitions. The non-native fallback animates arrival only.
  Reduced motion keeps content and pending states visible without movement.
- Added inherited regional loading/error boundaries and detail placeholders.
  Shared loading no longer blanks the whole viewport. Route scroll/focus updates
  preserve same-route searches, hash destinations and available history scroll.

## Page coverage

| Route family | Main changes |
| --- | --- |
| `/dashboard`, `/dashboard/endpoint` | Compact access overview; endpoint/tunnel controls and gateway-key management side by side on wide screens; wrapping actions and contained key lists. |
| `/dashboard/providers` | Search/status/category workflow, smaller official banner, uniform catalog grids, links separated from switches, compact mobile intro and one-row category scroller. |
| `/dashboard/providers/[id]`, `/new` | Clear connection/model sections, anchored navigation, readable IDs, visible row actions, wrapped controls and structural loading. |
| `/dashboard/cli-tools`, `/[toolId]` | Search and Connected filtering with reset; consistent directory tiles; separate MITM area and focused configuration detail across all tool cards. |
| `/dashboard/media-providers/[kind]`, `/web` | Clear category headings and catalog sections. |
| `/dashboard/media-providers/[kind]/[id]`, `/combo/[id]` | Responsive reference/example columns and editor settings/provider structure. |
| `/dashboard/usage` | One divided metric surface; chart/activity, consumption breakdown, then routing context. Quieter tables, grouped request details and accurate empty/loading states. |
| `/dashboard/quota` | Visible wrapping toolbar labels, responsive account headers/actions and readable quota content. |
| `/dashboard/profile` | In-page section index and vertical settings panels; removed uneven masonry; account actions use a bounded responsive grid. |
| `/dashboard/settings/pricing` | Moved into the dashboard route group at the same public URL; shell applies once; overview metrics precede expandable explanatory content. |
| `/dashboard/combos` | Routes/adapters stay primary; strategy reference becomes a contextual aside; active Fusion billing explanation remains available. |
| `/dashboard/token-saver` | Separate RTK, Headroom and output-style sections; preserved experimental visibility and paid-intent semantics. |
| `/dashboard/proxy-pools` | Summary, consistent actions and readable pool rows. |
| `/dashboard/pxpipe` | Balanced savings/history areas, contained wide data, wrapping period controls at 320px. |
| `/dashboard/skills` | Setup guidance beside a compact catalog. |
| `/dashboard/translator` | Numbered stages with accessible expansion controls. |
| `/dashboard/console-log` | Compact heading and bounded log viewport. |
| `/dashboard/mitm` | Server/configuration areas and keyboard-operated tool accordions. |
| `/dashboard/basic-chat` | Replaced hardcoded dark colors with shared theme tokens; full-width toolbar, bounded conversation/composer, responsive pickers and explicit action names. |

## Dialog and keyboard behavior

The request-detail drawer now uses a native top-layer dialog. Its panel fits a
phone, keeps the scroll inside the panel, handles Escape/backdrop dismissal and
returns focus to the actual row action. An explicit Tab/Shift+Tab cycle keeps
focus on its visible controls, including a one-control dialog; nested dialogs
own their own key handling. Existing native confirmation/modals retain their
confirmation and focus behavior. Raw private errors are not displayed by the
new route retry boundary.

The new browser checks exercise integration filtering/reset, narrow detail
layouts, keyboard MITM accordions, drawer containment, repeated Tab, Escape and
focus return. Existing navigation tests still verify persistent header/live
wrapper identity, fallback/reduced-motion behavior and no full-page animation
for query, period or SSE refreshes.

## Validation

Final outcomes are recorded in
[data/dashboard-redesign-20261111.json](data/dashboard-redesign-20261111.json),
including source-file hashes, route inventory, production build ID and local
synthetic visual receipts. These results use the final app source, including the
explicit drawer keyboard cycle; the 90 changed app/locale file hashes match the
production build checked by both browser runs.

| Gate | Final result |
| --- | --- |
| Complete Vitest run and strict regression-report gate | 11,262 passed; 99 skipped/todo; 880 files; zero failed assertions or suites. |
| Production Playwright suite | 36 passed; zero failed; no retries. |
| Independent production route tour | 24 representative routes returned HTTP 200 and settled. |
| Responsive layout checks | 96 checks at 1440, 768, 390 and 320px; no document/main horizontal overflow or mobile dock overlap. |
| Direct hash destinations / long chat fixtures | Four checks each; targets/composer remained visible with no horizontal overflow. |
| JavaScript, hydration, console and HTTP errors | Zero in the independent tour; cancelled prefetch/SSE requests recorded separately. |
| Production build, composed strict lint, brand, i18n, CJS HTTP/2 compatibility | Passed. |

Production build ID: `OQRwwqsl5KhKcS0AJ-8Fa`. The local tour retains 60 screenshots,
including dark and reduced-motion views. This is responsive evidence for the
listed routes/viewports, rather than an exhaustive device certification.

Earlier verification found and corrected real overflow in Settings (two
nonshrinking full-width buttons in one flex row) and 320px PXPIPE period controls.
The provider mobile banner/introduction were further compacted after screenshot
review. A failed Indonesian heading assertion was updated to the new translated
page heading, with its counter/code/identifier assertions retained. The provider
speed test VM now executes the new actual shared component rather than failing
to resolve its new relative import. All existing state/race assertions remain.

A pre-existing reactive-refresh cancellation test used a 40ms clock race to guess
when refresh had started. Under concurrent build load it could cancel before
refresh began. The fixture now aborts when the second relay request actually
arrives and relies on the runner deadline; the 499/two-attempt assertions remain.
Production transport code was not changed for this test stabilization.

An earlier full run overlapping a build and other Chromium checks also exceeded
the synthetic usage fixture's default one-second poll deadline. Its isolated
19-test run passed, then the complete final run passed without concurrent build
or QA jobs. Usage/SSE logic and all timing/order assertions were retained.

## Security and evidence boundaries

Authentication, credential masking, endpoint/key validation, destructive-action
confirmations, quotas and accounting semantics remain in force. This work does
not change inference routing, provider identities, entitlement or crypto inputs.
Unknown values and actual zero counters remain distinct. Existing credential
validation, fractional pricing, stale-response and redacted-content tests remain.

Browser validation uses loopback production servers with fresh private temporary
state, random runtime secrets and a synthetic password. Catalog, request and chat
fixtures are explicitly local; no real provider accounts or inference are used.
Expected aborted prefetch/SSE requests are distinguished from genuine network
failures. Screenshots do not establish live-provider access or deployment.

English source registration, Indonesian coverage and template checks pass;
other locale dictionaries retain their explicit pre-existing partial coverage.
This is not a claim of complete linguistic or universal assistive-device testing.
The landing page and upstream inference engine are outside this dashboard layout
redesign. Dynamic routes were checked through representative valid local entries,
not by creating every possible provider/account configuration.
