# Kitsune Router brand

Kitsune Router is a ByKitsune product: a provider-neutral, self-hosted AI gateway.
The approved product and organization names come from the owner. The neutral
tagline is **Your models. Your routes.**

`branding/identity.mjs` holds public identity strings consumed by the UI.
Never place a secret, private account identifier or runtime option there.

## Relationship to ByKitsune

The existing ByKitsune source was reviewed at `/root/ByKitsuneV2`. Its established
ink (`#30241d`), paper (`#fffefa`), ember (`#a63f23`), and geometric sans-serif
typography form the shared family. Kitsune Router uses the same approved
ByKitsune mascot as the main website. ByKitsune is acknowledged as maintainer and sponsor, not
as a mandatory API supplier. Use equal treatment for every provider.

## Visual language

- The approved fox mascot and its recognizable ears anchor the product mark.
- Flat paper/ink fields, ember actions, readable dark-mode counterparts.
- Plus Jakarta Sans with system fallbacks; code uses the existing monospace.
- A visible focus outline, comfortable targets, honest empty/loading/error
  states, semantic headings, and reduced-motion support are required.
- No fake customer counts, invented performance charts or unsupported savings.
- The page's live route example is labeled as a local demonstration, never a
  live provider benchmark or an actual inference request.

The landing direction was selected from the `one-motif` direction sheet,
seed `1762466234`. On this page, the Kitsune fox's ear notch becomes the shaped
stage for routing controls. The existing family colors are intentionally kept,
including the warm-paper/ember combination; this is a brand constraint rather
than a newly invented default palette.

## Assets and attribution

- `public/icons/logo.svg`, `icon-192.svg`, `icon-512.svg`, and `public/favicon.svg`: stable URLs containing the approved ByKitsune mascot.
- `public/brand/social-card.svg`: editable share/repository image source.
- `public/brand/bykitsune-favicon.png`, `bykitsune-favicon-512.png`, and
  `bykitsune-favicon.ico`: original mascot assets from the ByKitsune website,
  used consistently in the dashboard, app icons, documentation and tray.
- `public/brand/bykitsune-wordmark.webp`: the original ByKitsune wordmark; use
  it on a light backing so it remains legible in dark mode.
- `images/kitsune-router.png`: real packaged-candidate dashboard capture using
  isolated synthetic state. Historical screenshots are identified in
  `images/README.md`, not relabeled as current builds.
- `node scripts/generate-brand-assets.mjs` creates app and tray variants, stable
  SVG wrappers, and 1200×630 app/documentation share images from those originals.
- Existing provider marks belong to their respective publishers and are not
  redrawn or relabeled as Kitsune Router assets.
- Preserve upstream MIT copyright and notice requirements. Product sponsorship
  does not replace historical authorship or turn this project into a corporation.

## Rendered review

The desktop/tablet/mobile inspector on the rebuilt candidate reported zero
blocking findings, including the loaded Plus Jakarta Sans face. Its three
remaining advisory warnings are intentional: the warm-paper palette is the
approved ByKitsune family palette, and this software page demonstrates real UI
controls/fragments instead of unrelated stock photography or decorative video.
These choices do not substitute for responsive, keyboard and reduced-motion
verification; the exact final source/evidence belongs in `REBRANDING.md`.
