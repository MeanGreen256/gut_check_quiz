import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "600"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "What's your gut health type? — Whitness Nutrition",
  description:
    "Answer 10 questions about your symptoms, diet, and lifestyle. Get a scored result — Thriving, Sensitive, Struggling, or Distressed — with next steps written by a registered dietitian.",
  metadataBase: new URL("https://gutcheck.whitnessnutrition.com"),
  openGraph: {
    title: "What's your gut health type?",
    description:
      "A free 3-minute gut health check from Whitness Nutrition, written by a registered dietitian.",
    url: "https://gutcheck.whitnessnutrition.com",
    siteName: "Whitness Nutrition",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
