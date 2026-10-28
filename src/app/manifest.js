import { BRAND } from "../../branding/identity.mjs";

export default function manifest() {
  return {
    id: '/kitsune-router',
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.summary,
    start_url: '/',
    display: 'standalone',
    background_color: '#fffefa',
    theme_color: '#a63f23',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
