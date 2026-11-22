import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Figtree } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Granaa",
  description:
    "Acompanhe cada centavo que entra e sai, organize gastos, cartões de crédito e metas de economia.",
  applicationName: "Granaa",
  appleWebApp: { capable: true, title: "Granaa", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme é aplicado pelo script antes da hidratação
    <html lang="pt-BR" className={`${figtree.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
