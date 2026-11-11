# Dashboard navigation revision — 2026-11-11

Base: `c658e436` (the full dashboard experience redesign), source version 1.0.8.
Branch: `feat/dashboard-experience-redesign`.

## Navigation structure

The sidebar, mobile shortcuts, contextual header and page finder now share
`src/shared/components/navigation/dashboardNavigation.js`. Destinations are
grouped into Gateway, Workspace, Observe & optimize, System and Preferences.
Chat, PXPIPE, MITM and Pricing are directly discoverable. The existing supported
media categories and combined web destination remain available, and Translator
remains conditional on its settings flag. The shared route matcher respects
segment boundaries, the `/dashboard` endpoint alias and media-combo ownership.

The desktop sidebar has a 264px expanded mode and an 80px icon mode. Both expose
the same destinations, selected state and router-owned pending feedback.
Compact labels use accessible names and portalled, collision-aware tooltips;
the media submenu uses a bounded native dialog. The current destination is
revealed within the sidebar's own scrolling region on opening, route changes,
mode changes and resizing without taking focus from page content.

Only the boolean compact preference is stored locally. Server rendering starts
expanded with a stable hydration snapshot. Blocked storage or failed quota
writes retain a session-local preference instead of disabling the control.

The mobile bar has five stable targets: Gateway, Providers, Chat, Usage and More.
It occupies layout space, includes device safe areas and keeps labels and focus
states visible. More opens the full grouped menu with persistent preferences and
documentation. A regional scroll area keeps long menus usable on short screens.

## Header and page finder

The header derives its section and parent context from the same catalog, with
provider/tool/media detail metadata. Detail screens have a parent link on mobile.
Breadcrumbs no longer duplicate the page's main heading. The existing controlled
page search, language picker, authenticated identity, logout and application menu
remain available.

Find a page opens a native dialog from the header/sidebar or Ctrl/Cmd+K. It
searches enabled destinations using source and translated labels, descriptions,
keywords and paths. Results are ordinary Next links with pending state; modified
clicks retain browser behavior. Arrow keys, Home/End and Enter support keyboard
navigation. IME composition keys remain owned by the input method and cannot
activate a page accidentally. Empty results retain a usable search and reset.

Escape/backdrop dismissal and Tab cycling keep focus predictable. A page-search
handoff from the mobile drawer closes the drawer first; dismissal returns to a
visible header trigger if the original opener was unmounted. Route navigation
retains the new content's focus. The global shortcut respects an already open
language, credential or confirmation dialog.

## Validation

Final command results, the built source hashes, build ID and browser receipts
are recorded in [data/navigation-revision-20261111.json](data/navigation-revision-20261111.json).
The production checks include expanded/compact persistence, blocked storage,
mobile target bounds, active-item reveal, compact media, page-search keyboard and
IME behavior, mobile handoff, feature visibility, localization and reduced motion.

| Gate | Final result |
| --- | --- |
| Complete Vitest run and strict regression-report gate | 11,266 passed; 99 skipped/todo; 881 files; zero failed assertions or suites. |
| Production Playwright suite | 45 passed, zero failed, no retries. |
| Independent instrumented production QA | 13 workflows and 50 responsive geometry checks passed; 20 screenshots retained. |
| Final instrumented browser errors | Zero JavaScript, console, HTTP and non-abort request errors; the earlier observation remains separately recorded below. |
| Production build, composed strict lint, brand, i18n and HTTP/2 compatibility | Passed. |

Final build: `LFIbTfMxtsl1CkVNZ9ynB`. All 16 changed app/locale source-file hashes
match the built source, and the standalone public dictionaries match the source
assets. The full regression run followed browser QA without concurrent build or
browser workloads. Synthetic fixtures do not establish live-provider access.

Exploratory production QA found the active PXPIPE item below the mobile menu's
scrollport and Console log below the compact desktop scrollport. The bounded
current-item reveal fixes both cases; regression assertions cover those states.
Static review also found the composition-key navigation problem, which now has
a production browser assertion retaining normal keyboard navigation checks.

The browser review also caught native search-input Escape clearing a query
instead of dismissing the finder; the explicit handler now dismisses in one
press while preserving composition input. Fully blocked browser storage exposed
an existing unguarded onboarding dismissal read/write. That optional persistence
is now guarded so the security prompt and its existing password-settings
navigation continue to work. The legacy `#password` destination remains valid
through Settings' existing password-section/input-focus handler.

One earlier visual run on the final build reported a single React #418 text
hydration error while its 13 workflows and 50 layout checks passed. That
collector did not retain the failing URL/stage, so its cause was not isolated.
The retained original report is separate from the instrumented complete repeat,
which passed with zero browser errors, and 12 additional Indonesian/English
reloads also reported none. No hydration warning suppression or speculative
runtime change was introduced. This records a non-reproduced observation rather
than claiming its cause was fixed; the final receipt preserves both runs.

## Security and evidence boundaries

Authentication, logout cache invalidation, credential handling, API validation,
gateway shutdown confirmation and updater copy-before-shutdown behavior remain
in force. The page finder only exposes navigation destinations and does not
execute account or server actions. Hiding Translator is a presentation setting,
not an access-control mechanism.

Checks use isolated loopback production servers, temporary state and synthetic
credentials; no live provider account or inference is exercised. English source
registration and Indonesian coverage are checked; other locale dictionaries
retain their pre-existing partial coverage. Local source/build verification does
not establish remote publication, deployment or CI status.
