// Doubles as the canonical site URL (metadataBase, robots.txt, sitemap.xml)
// until a production domain is confirmed. Update NEXTAUTH_URL at deploy time
// — this file intentionally has no separate env var to avoid two sources of
// truth for the same value.
export const SITE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
