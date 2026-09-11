import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand blue (#3457d5, --color-roles-primary) hardcoded — this route renders
// a standalone PNG for social crawlers and can't read the app's CSS custom
// properties. Uses the platform default sans font (no external font fetch)
// to keep image generation dependency-free; revisit with the real Fraunces
// file if the brand wordmark needs to appear pixel-exact here.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#3457d5",
          color: "#ffffff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 120,
            height: 120,
            borderRadius: "50%",
            border: "10px solid #ffffff",
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              backgroundColor: "#ffffff",
            }}
          />
        </div>
        <div style={{ display: "flex", fontSize: 72, fontWeight: 700 }}>
          UXLens AI
        </div>
        <div style={{ display: "flex", fontSize: 32, marginTop: 20, opacity: 0.85 }}>
          Turn research into findings you can trust
        </div>
      </div>
    ),
    { ...size }
  );
}
