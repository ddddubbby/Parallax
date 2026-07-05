import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import "./globals.css";

// The three faces of the design system (DESIGN_GUIDELINES §4, V-9).
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: "Resonance",
  description: "Internal operator tool for AI visibility audits and evidence-conditioned simulation studies.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${plexMono.variable} ${inter.variable} ${instrumentSerif.variable}`}
    >
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
