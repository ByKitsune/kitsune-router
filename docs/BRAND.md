# Kitsune Router brand

Kitsune Router is a ByKitsune product: a provider-neutral, self-hosted AI gateway.
The approved product and organization names come from the owner. The neutral
tagline is **Your models. Your routes.**

`branding/identity.mjs` holds public identity strings consumed by the UI.
Never place a secret, private account identifier or runtime option there.

## Relationship to ByKitsune

The existing ByKitsune source was reviewed at `/root/ByKitsuneV2`. Its established
ink (`#30241d`), paper (`#fffefa`), ember (`#a63f23`), and geometric sans-serif
typography form the shared family. Kitsune Router uses its own compact fox mark
with a routing branch. ByKitsune is acknowledged as maintainer and sponsor, not
as a mandatory API supplier. Use equal treatment for every provider.

## Visual language

- One clear fox-ear notch appears in the mark and larger landing-page stages.
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

- `public/icons/logo.svg`: product mark, authored in source for this rebrand.
- `public/icons/icon-192.svg`, `icon-512.svg`, `public/favicon.svg`: app variants.
- `public/brand/social-card.svg`: editable share/repository image source.
- `images/kitsune-router.png`: real packaged-candidate dashboard capture using
  isolated synthetic state. Historical screenshots are identified in
  `images/README.md`, not relabeled as current builds.
- Bitmap variants are generated from the same SVG, not unrelated artwork.
  `node scripts/generate-brand-assets.mjs` creates app icons, tray PNG/ICO,
  browser favicon and a 1200×630 share image from the editable SVGs.
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
