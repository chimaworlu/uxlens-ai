import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfkit loads its standard-14 font metrics (.afm files) from disk via
  // __dirname at runtime — bundling it rewrites that path and breaks font
  // loading (ENOENT), so it must run un-bundled, straight from node_modules.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
