import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";
import { Providers } from "./providers";
// Self-hosted (fontsource), not next/font/google: the Google Fonts CSS
// endpoint (fonts.googleapis.com) resolves fine in this environment, but
// the font *files* it points to (fonts.gstatic.com) fail DNS resolution
// entirely — a persistent network restriction here, not a transient
// blip. next/font/google degraded to a silent fallback-font warning for
// most of this project's development, until Turbopack started hard-
// crashing the whole app on it instead. These packages ship the actual
// Fraunces/Inter font files inside node_modules (installed once via npm,
// which — unlike gstatic.com — is reachable here), so there's no runtime
// network dependency at all. design-tokens.css's --typography-*-fontfamily
// variables already reference the literal family names "Fraunces" and
// "Inter" directly, so registering @font-face under those same names is
// the only thing needed — nothing downstream changes.
import "@fontsource/fraunces/400.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/400-italic.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/500-italic.css";
import "./globals.css";

const TITLE = "UXLens AI - Turn Research Into Findings You Can Trust";
const DESCRIPTION =
  "Upload interview notes, surveys, and feedback. UXLens AI returns organized themes, pain points, and suggestions - every insight cited back to its source.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "UXLens AI",
    type: "website",
    locale: "en_NG",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "UXLens AI",
  url: SITE_URL,
  description: DESCRIPTION,
  areaServed: "NG",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
