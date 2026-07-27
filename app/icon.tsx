import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Same lens/aperture mark as opengraph-image.tsx, rasterized. Replaced a
// static icon.svg with this because SVG-only favicons are unreliable in
// Chrome/Edge in practice despite being spec-supported — a PNG favicon
// renders consistently everywhere. Brand blue (#3457d5, --color-roles-primary)
// hardcoded for the same reason noted there: standalone asset, no access to
// app CSS custom properties.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: "3px solid #3457d5",
          }}
        >
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              backgroundColor: "#3457d5",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
