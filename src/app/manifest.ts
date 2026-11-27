import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Forge — Fitness Command Center",
    short_name: "Forge",
    description: "Workouts, nutrition, hydration, sleep, habits and schedule in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#08090a",
    theme_color: "#08090a",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Add water", url: "/hydration?add=250" },
      { name: "Log food", url: "/nutrition?log=1" },
      { name: "Start workout", url: "/workout" },
      { name: "Today's schedule", url: "/calendar?view=day" },
    ],
  };
}
