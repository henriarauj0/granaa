import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Granaa",
    short_name: "Granaa",
    description: "Controle de gastos, cartões e metas de economia.",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#f4f5f1",
    theme_color: "#0b6b45",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
