import type { NextConfig } from "next";

import { contentSecurityPolicy } from "./src/lib/csp";

// Cabeçalhos de segurança em todas as respostas. A política (CSP) e os motivos de
// cada regra estão em src/lib/csp.ts.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      dev: process.env.NODE_ENV === "development",
    }),
  },
  // ninguém pode abrir o Granaa dentro de um iframe (clickjacking), também em navegadores antigos
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
