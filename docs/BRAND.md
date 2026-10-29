# Kitsune Router brand

Kitsune Router is a ByKitsune product: a provider-neutral, self-hosted AI gateway.
The approved product and organization names come from the owner. The neutral
tagline is **Your models. Your routes.**

`branding/identity.mjs` holds public identity strings consumed by the UI.
Never place a secret, private account identifier or runtime option there.

## Relationship to ByKitsune

The existing ByKitsune source was reviewed at `/root/ByKitsuneV2`. Its established
ink (`#30241d`), paper (`#fffefa`), ember (`#a63f23`), and geometric sans-serif
typography form the shared family. Kitsune Router now uses the official
ByKitsune character artwork for its logo and application icons. ByKitsune is
acknowledged as maintainer and sponsor, not as a mandatory API supplier. Use equal treatment for every provider.

## Visual language

- The official ByKitsune character is the only current app/logo artwork; do not
  reintroduce the former custom routing-fox vector.
- Warm neutral surfaces, ember actions, readable dark-mode counterparts. Use
  semantic surface, border, text and status tokens so every view supports both
  themes; see [the UI design guide](UI-DESIGN.md).
- Rounded cards and controls use restrained elevation. Blur separates transient
  navigation and dialogs from their backdrop without reducing content contrast.
- Language controls identify languages with names and locale codes rather than
  treating a national flag as a language. Mobile navigation respects safe areas
  and remains reachable without covering page actions.
- Locally packaged DM Sans with system fallbacks; code uses the existing monospace.
  Font loading must not depend on a Google Fonts request during builds.
- Motion should clarify a selection, update or navigation change. Avoid ambient
  movement; honor reduced-motion preferences in CSS and JavaScript. Initial
  server-rendered content must stay readable when animation is unavailable.
- A visible focus outline, comfortable targets, honest empty/loading/error
  states, semantic headings, and reduced-motion support are required.
- No fake customer counts, invented performance charts or unsupported savings.
- The page's live route example is labeled as a local demonstration, never a
  live provider benchmark or an actual inference request.

The earlier landing-page stage used a geometric fox-ear motif. That historical
layout direction does not authorize keeping its old product mark in active app
icons. Current application artwork follows the owner's request to use the
ByKitsune site identity consistently.

## Assets and attribution

- `public/brand/bykitsune-favicon.png` is the canonical, unmodified official
  192px artwork copied from `/root/ByKitsuneV2/public/favicon-192x192.png` in the
  preceding brand work. Its provenance was already recorded in this repository.
- A fresh request to `https://bykitsune.com/` was denied by the current cloud
  egress proxy (HTTP 403). This update reuses the existing authentic site artwork;
  it does not claim a newly downloaded or independently refreshed website logo.
- `public/icons/logo.svg`, `public/icons/icon-192.svg`, `icon-512.svg`, and
  `public/favicon.svg` are self-contained SVG containers of that official PNG.
  Their stable paths preserve existing application/launcher references. They
  contain no geometry from the former custom product mark.
- `node scripts/generate-brand-assets.mjs` reproduces these containers plus PWA,
  Apple, tray, browser ICO, and social-card exports from the canonical artwork.
  It also synchronizes the static documentation site's logo/social SVG snapshot.
  The larger exports retain the 192px raster source's resolution; they are not
  represented as newly drawn vector artwork.
- `public/brand/social-card.svg` and its PNG derivative use the same official
  character alongside the product name and provider-neutral tagline.
- `images/kitsune-router.png` is an earlier packaged-candidate dashboard capture
  using isolated synthetic state. Historical screenshots remain identified in
  `images/README.md`, not relabeled as captures of the current redesign.
- Existing provider marks belong to their respective publishers and are not
  redrawn or relabeled as Kitsune Router assets.
- Preserve upstream MIT copyright and notice requirements. Product sponsorship
  does not replace historical authorship or turn this project into a corporation.

## Previous rendered review

The earlier desktop/tablet/mobile inspector on the rebuilt candidate reported zero
blocking findings, including the loaded Plus Jakarta Sans face. Its three
remaining advisory warnings are intentional: the warm-paper palette is the
approved ByKitsune family palette, and this software page demonstrates real UI
controls/fragments instead of unrelated stock photography or decorative video.
These choices do not substitute for responsive, keyboard and reduced-motion
verification; the exact final source/evidence belongs in `REBRANDING.md`.

The previous rendered review above predates the current dashboard redesign and
artwork replacement. It does not establish visual or responsive validation of
the current change; use the new build and browser checks for that evidence.
