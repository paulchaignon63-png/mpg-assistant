import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Le 11 parfait",
    short_name: "11 parfait",
    description: "Ton meilleur 11, chaque journée, sans prise de tête",
    start_url: "/",
    display: "standalone",
    background_color: "#0A1F1C",
    theme_color: "#0A1F1C",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
