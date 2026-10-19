import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import type { Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/lib/session";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Signature HACCP",
  description: "La conformité HACCP, avec élégance.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#14110F",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${display.variable} ${sans.variable}`}>
      <body className="bg-ivory-50 font-sans text-ink-900 antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}