import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LOREEN Medical Clinic",
    short_name: "LOREEN",
    description: "نظام إدارة عيادة لورين للتجميل",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f8f5f1",
    theme_color: "#c8a15a",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/loreen-logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
