import type { MetadataRoute } from "next";

// Lets a phone install the site to the home screen and open it like an app (no browser bars).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NFL Season Simulator",
    short_name: "NFL Sim",
    description: "Monte Carlo projections of the NFL season, plus a football game you can play.",
    start_url: "/play",
    display: "standalone",
    background_color: "#08122a",
    theme_color: "#08122a",
    icons: [{ src: "/nfl-logo.png", sizes: "500x500", type: "image/png", purpose: "any" }],
  };
}
