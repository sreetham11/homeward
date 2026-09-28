import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

// Body copy: plain, neutral, highly legible. Headlines (h1/h2, see globals.css)
// use Fraunces instead — a soft-optical serif for typographic contrast without
// tipping into decorative territory.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Homeward — recovery, tracked with you",
  description:
    "Turns a discharge summary into a day-by-day recovery plan and daily check-ins for patients and caregivers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-homeward-bg font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
