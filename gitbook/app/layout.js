import "@fontsource-variable/dm-sans";
import { DOCS_IDENTITY } from "@/constants/identity.mjs";
import { createDocsMetadata } from "@/lib/metadata.mjs";
import { socialImageUrl } from "@/lib/urls.mjs";
import "./globals.css";

export const metadata = createDocsMetadata();

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffefa" },
    { media: "(prefers-color-scheme: dark)", color: "#211c19" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Keep the share image site-relative until an operator assigns an
            origin. Next's image metadata otherwise invents a localhost host. */}
        <meta property="og:image" content={socialImageUrl()} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={`${DOCS_IDENTITY.name} — ${DOCS_IDENTITY.tagline}`} />
        <meta name="twitter:image" content={socialImageUrl()} />
        <meta name="twitter:image:alt" content={`${DOCS_IDENTITY.name} — ${DOCS_IDENTITY.tagline}`} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
