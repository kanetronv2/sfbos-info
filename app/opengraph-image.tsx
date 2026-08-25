import { ImageResponse } from "next/og";

export const alt = "SF BOS Search homepage: search San Francisco Board of Supervisors public records";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ink = "#151713";
const paper = "#f3f1ea";
const panel = "#faf9f4";
const muted = "#686a63";
const line = "#c7c6bd";
const accent = "#e3482f";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: paper,
        backgroundImage:
          "linear-gradient(rgba(21, 23, 19, .035) 1px, transparent 1px), linear-gradient(90deg, rgba(21, 23, 19, .035) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        color: ink,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <header
        style={{
          height: 68,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 42,
          borderBottom: `1px solid ${ink}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11, fontFamily: "monospace", fontSize: 16, fontWeight: 700 }}>
          <span style={{ color: accent, fontSize: 22 }}>&gt;_</span>
          <span>sfbos.info</span>
        </div>

        <nav style={{ height: "100%", display: "flex", fontFamily: "monospace", fontSize: 11, letterSpacing: ".08em" }}>
          {["DOCUMENTS", "SUPERVISORS", "API", "FOR MODELS"].map((item) => (
            <span
              key={item}
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                padding: "0 19px",
                borderLeft: `1px solid ${line}`,
                borderRight: item === "FOR MODELS" ? `1px solid ${line}` : "none",
              }}
            >
              {item}
            </span>
          ))}
        </nav>
      </header>

      <main
        style={{
          width: 980,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignSelf: "center",
          justifyContent: "center",
          padding: "28px 28px 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            marginBottom: 18,
            color: muted,
            fontFamily: "monospace",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".15em",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: accent }} />
          PUBLIC RECORD SEARCH
        </div>

        <h1
          style={{
            margin: 0,
            display: "flex",
            flexDirection: "column",
            fontSize: 68,
            lineHeight: 0.98,
            letterSpacing: "-.055em",
            fontWeight: 750,
          }}
        >
          <span>Search the San Francisco</span>
          <span>Board of Supervisors.</span>
        </h1>

        <div
          style={{
            height: 70,
            marginTop: 30,
            display: "flex",
            alignItems: "center",
            padding: "8px 8px 8px 20px",
            background: panel,
            border: `2px solid ${ink}`,
            boxShadow: `7px 7px 0 ${ink}`,
          }}
        >
          <span style={{ width: 43, fontFamily: "monospace", fontSize: 30, transform: "rotate(-20deg)" }}>⌕</span>
          <span style={{ flex: 1, color: "#8e8f88", fontSize: 17 }}>
            Search names, votes, legislation, addresses…
          </span>
          <span
            style={{
              padding: "4px 8px",
              border: `1px solid ${line}`,
              borderRadius: 3,
              background: paper,
              color: muted,
              fontFamily: "monospace",
              fontSize: 11,
            }}
          >
            /
          </span>
          <span
            style={{
              height: 52,
              marginLeft: 14,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "0 22px",
              background: accent,
              color: "white",
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".08em",
            }}
          >
            SEARCH <span style={{ fontSize: 15 }}>↵</span>
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 28, padding: "19px 2px 0" }}>
          <Filter label="YEAR" value="All years" />
          <Filter label="DOCUMENT" value="Agenda + minutes" width={150} />
          <div style={{ marginLeft: "auto", paddingBottom: 6, display: "flex", color: muted, fontFamily: "monospace", fontSize: 10 }}>
            <b style={{ color: ink }}>2,131</b> documents <span style={{ margin: "0 9px" }}>•</span>
            <b style={{ color: ink }}>SINCE 1996</b>
          </div>
        </div>
      </main>

      <footer
        style={{
          minHeight: 62,
          padding: "0 42px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: `1px solid ${line}`,
          color: muted,
          fontFamily: "monospace",
          fontSize: 9,
          letterSpacing: ".04em",
        }}
      >
        <span>Independent public-interest index. Not affiliated with the City and County of San Francisco.</span>
        <span>JSON&nbsp;&nbsp;&nbsp; MARKDOWN&nbsp;&nbsp;&nbsp; UTF-8</span>
      </footer>
    </div>,
    size,
  );
}

function Filter({ label, value, width = 112 }: { label: string; value: string; width?: number }) {
  return (
    <div style={{ width, display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ color: muted, fontFamily: "monospace", fontSize: 9, letterSpacing: ".12em" }}>{label}</span>
      <span
        style={{
          display: "flex",
          justifyContent: "space-between",
          paddingBottom: 7,
          borderBottom: `1px solid ${line}`,
          fontFamily: "monospace",
          fontSize: 12,
        }}
      >
        {value} <span style={{ color: muted }}>⌄</span>
      </span>
    </div>
  );
}
