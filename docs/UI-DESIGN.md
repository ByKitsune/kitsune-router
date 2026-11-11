# Dashboard design and review

This guide describes the current source UI. It does not identify a published
package, container image or hosted deployment. Release records and immutable
tags remain in [the changelog](../CHANGELOG.md).

## Shared visual language

- Use the semantic tokens in `src/app/globals.css` for backgrounds, surfaces,
  borders, text, focus, status and ember accents. Every state must work in light
  and dark themes; a surface color alone must not convey status.
- DM Sans is installed through `@fontsource-variable/dm-sans` and bundled with
  application and documentation assets. Build-time Google Fonts access is unnecessary. Keep system
  fallbacks for scripts outside the packaged font's coverage and retain monospaced
  code, endpoint and identifier text.
- Reuse `Card`, `Button`, `Input`, `Select`, `Toggle`, `Badge` and `Modal` rather
  than building a different control family for each page. Preserve existing
  accessible labels, validation descriptions, disabled and loading behavior.
- Shared tooltips use Radix UI for focus/keyboard behavior and viewport-aware
  placement. Keep an accessible name on the trigger: a tooltip is supplemental
  help, not a replacement for a control's label. Tooltip portals must remain
  visible inside a native dialog's top layer.
- Rounded surfaces and soft shadows establish hierarchy. Use stronger elevation
  and backdrop blur for transient overlays, not every nested panel. Text and
  controls still need adequate contrast over the underlying content.
- Use the official artwork documented in [BRAND.md](BRAND.md). Regenerate icons
  with `node scripts/generate-brand-assets.mjs`; do not recreate the former
  product mark or replace provider-owned logos.

## Layout and navigation

The desktop shell groups the full navigation by task. Below the 1024px desktop
breakpoint, the quick-navigation dock provides Gateway, Providers and Usage;
More opens the complete native-dialog drawer. The dock occupies layout space,
including device safe-area padding, so it does not cover page controls.

Keep page headings, filters and primary actions usable at narrow widths. Allow
toolbars to wrap, apply `min-width: 0` to flexible/grid children, and contain
wide tables or code in their own scrolling region. Avoid hiding important
columns or truncating an identifier without a way to inspect/copy its value.
The main page should not require horizontal scrolling.

The navigation drawer must support close, Escape, focus return and a transition
back to the desktop layout. Keep touch targets comfortable at small sizes and
provide an accessible name for every icon-only button. Account actions and
language selection must remain reachable when the full desktop header does not
fit.

## Language selection

Language controls use a language symbol, locale code and native language name.
Country flags are not language identifiers. The picker searches native and English
names and locale codes, ignoring diacritics; RTL labels retain their own text
direction. It uses a bottom sheet on mobile and a compact layout on short
landscape screens. ArrowDown moves from search into the choices; arrows and
Home/End navigate the choices, while native dialog Escape and focus return remain
available. Applying and failed selection states are visible, and a failed request
can be retried. Preserve locale normalization, the existing preference cookie
and runtime translation behavior without requiring a page reload.

Review long native-language labels and right-to-left scripts independently of
the page's surrounding language. A supported locale does not by itself prove
that every new UI sentence has a translated dictionary entry.

## Motion and live data

Use CSS entrances for initial page/section composition and Motion for dynamic
selection, drawer, dialog and notification feedback. Server-rendered content
must be visible without waiting for a JavaScript animation to initialize.
Avoid conditional server/client initial transforms that produce hydration
mismatches. CSS must honor `prefers-reduced-motion`; JavaScript and chart
animation should honor the same preference.

Usage numbers animate from their last displayed value when a measurement
changes. Request rows keep stable identities. The chart is memoized so an
unrelated activity-stream update does not restart its animation. A period
change keeps the old plot while the next request is pending, aborts obsolete
requests and ignores late successes and errors.

Keep measurement semantics intact through the visual layer: unknown prices
are not zero, known subtotals are not complete totals, and estimates are not
invoices. A chart gap for unspecified pricing must remain a gap. Empty, loading,
disconnected and failed states must accurately describe what is known.

## Development and validation

Install the locked application and test dependencies from the repository root:

```bash
npm ci
npm --prefix tests ci
```

Use private installation settings for real development, or isolated synthetic
state for automated checks as described in [tests/README.md](../tests/README.md).
Do not run UI verification with production provider credentials or spend tokens
merely to populate a screenshot. Label synthetic fixtures as test data in the
evidence, and keep real empty states honest.

```bash
npm run lint -- --max-warnings=0
npm run check:brand
(umask 022; npm test -- --maxWorkers=4)
npm run test:compat
npm run build
```

Run the browser suite against the production build:

```bash
# Use an installed Chromium, or install the runner's matching browser first:
# npm exec playwright install chromium
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:ui
```

Omit the executable override when using the Playwright-managed browser. The
runner starts a dedicated loopback standalone server with temporary state and
generated test credentials; it does not reuse an existing signed-in server.
Its reports and traces are written under ignored `verification/ui-playwright/`.
Review [the browser configuration](../tests/browser/playwright.config.mjs) and
[the isolated server helper](../scripts/ui-test-server.mjs) before changing the
test environment or its port.

The test subshell's `umask 022` allows permission fixtures to request their
documented 0644/0640 modes; it does not change private runtime-state requirements.
Stop a development server before building into the same `.next` directory:
the production build clears that directory, including nested development
outputs. Use a separate build output if concurrent workflows are required.

For browser review, exercise the production standalone server as well as the
development server. Verify the application health endpoint with a real database
read, then authenticate and visit the changed pages. Check:

- Narrow phone widths, tablet widths, desktop, ultrawide and landscape/short
  viewports; test long content and scroll positions as well as an empty database.
- Light/dark modes, locally loaded fonts, reduced motion and normal motion.
- Drawer and menu keyboard behavior, focus return, language search/selection,
  wrapping toolbars and dialogs near the viewport edge.
- Usage chart tokens/cost toggles, period changes, null-price gaps, request-detail
  and live-log views, with both empty and explicitly synthetic populated data.
- Browser exceptions, hydration warnings, failed local requests and accidental
  whole-page horizontal overflow.

Record the exact source revision and test outcomes for the current run. A local
build, browser check or Git push does not establish CI success, registry
publication, live-provider availability or production deployment.

## Dashboard composition (November 11 refactor)

The desktop frame is a 264px task rail (80px in compact mode) beside a single content canvas, with a 64px
header and a 1440px maximum reading width. Mobile search may add a second header
row; pending navigation feedback stays at the actual header's bottom edge.
Shared cards use 14px corners, 16px mobile/20px desktop padding and quiet borders.
Reserve strong elevation for dialogs/drawers. Avoid nesting ornamental cards
around another page header, filter bar or metric card.

Use the shared `page-heading`, `page-title`, `page-description`, `page-actions`,
`workspace-toolbar`, `section-heading` and `metric-strip` composition classes.
Give main work (accounts, routes, configuration, charts/tables) priority over
promotional introductions and long explanations. Provider categories and
integration search/filter controls reduce the visible catalog; setup and
configuration actions remain available. Mobile provider introductions and the
official provider banner stay compact so real catalog entries reach the first
screen. Settings use an in-page section index and readable vertical sections,
not masonry. Analytics flows from metrics to chart/activity, breakdown, then
routing context. Preserve internal scrolling for genuine wide data/code.

`dashboard/loading.js` provides a shell-contained structural fallback inherited
by all child routes; provider, tool and media detail routes have dedicated
fallbacks. Do not blank or overlay the navigation while content loads. Shared
`PageLoading` stays inside its content region. Native dialog drawers provide
focus trapping, Escape, backdrop dismissal and invoker focus restoration. The
route error boundary shows a public retry state without exposing raw errors.

Route snapshots arrive in 220ms and depart in 120ms. Keep one live page tree;
never hold an outgoing form or subscription open to wait for an exit animation.
The non-native fallback animates only arrival. Router-owned `useLinkStatus`
provides delayed inline and header feedback on pending sidebar/mobile links;
there are no invented progress percentages or click-capture navigation timers.
Path changes manage the content scroll/focus; query/filter updates do not reset
focused fields. Preserve hash destinations and history scroll where available.
Reduced-motion users get immediate content and static pending/skeleton states.

Pricing now lives in the dashboard route group at the unchanged public URL
`/dashboard/settings/pricing`, so its shell and navigation are consistent with
the rest of the application. The existing pathname authentication guard remains
in force. This layout refactor does not change provider credential policies,
request routing, billing arithmetic or the meaning of unknown/zero usage.

## Shared navigation directory (November 11 follow-up)

Use `navigation/dashboardNavigation.js` for destination labels, groups, route
matching and page context across the sidebar, header, page finder and mobile
dock. Secondary pages remain discoverable; keep the Translator visibility flag
and existing supported media categories. The compact rail must preserve named
links and a keyboard-accessible media menu. Current destinations should be
revealed within the menu scrollport without changing content focus.

Mobile uses five stable destinations: Gateway, Providers, Chat, Usage and More.
Keep the dock in layout flow with safe-area padding and at least 44px targets.
The full menu has independent scrolling and persistent preferences/documentation.
Test short landscape screens as well as narrow portrait widths.

Find a page is available from the header/sidebar and Ctrl/Cmd+K. Its searchable
results are actual links, preserve modified clicks, use translated labels, and
respect IME composition. Preserve focus across Escape, drawer handoff and route
commits; avoid opening navigation over a credential or confirmation dialog.
The page finder and each page's controlled search serve distinct scopes.
