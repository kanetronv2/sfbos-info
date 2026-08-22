import { ImageResponse } from "next/og";

export const alt = "SF BOS Search: San Francisco Board of Supervisors public records";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "68px 74px",
        backgroundColor: "#f1f0e9",
        backgroundImage:
          "linear-gradient(#d7d6cf 1px, transparent 1px), linear-gradient(90deg, #d7d6cf 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        color: "#161713",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "18px", fontSize: 30, fontWeight: 700 }}>
        <span style={{ color: "#e3482f", fontFamily: "monospace" }}>&gt;_</span>
        <span>sfbos.info</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1000px" }}>
        <div style={{ color: "#e3482f", fontFamily: "monospace", fontSize: 22, letterSpacing: "0.12em" }}>
          PUBLIC RECORD SEARCH
        </div>
        <div style={{ fontSize: 70, fontWeight: 800, lineHeight: 1.02, letterSpacing: "-0.045em" }}>
          San Francisco Board of Supervisors.
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 23, color: "#55584f" }}>
          Agendas · Minutes · Legislative files · Recorded votes · 2012 onward
        </div>
      </div>
    </div>,
    size,
  );
}
