import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The picture shown when the site's link is shared in a message or on social media.
export const alt = "NFL Season Simulator: odds, what-ifs and a football game";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public", "nfl-logo.png"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 80px",
          background: "linear-gradient(135deg, #10224f 0%, #08122a 60%, #0b1a3d 100%)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 30, letterSpacing: 8, color: "#7fb0ff", textTransform: "uppercase", fontWeight: 700 }}>2026 season</div>
          <div style={{ display: "flex", fontSize: 104, fontWeight: 800, lineHeight: 1.02, marginTop: 14 }}>NFL Season</div>
          <div style={{ display: "flex", fontSize: 104, fontWeight: 800, lineHeight: 1.02, color: "#3b82f6" }}>Simulator</div>
          <div style={{ display: "flex", fontSize: 34, color: "#c7d2e8", marginTop: 26, maxWidth: 640, lineHeight: 1.3 }}>
            Super Bowl odds from 20,000 simulated seasons, what-ifs, and a football game you can play.
          </div>
        </div>
        <img src={logo} width={330} height={330} alt="" />
      </div>
    ),
    size,
  );
}
