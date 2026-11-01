import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/context/LanguageContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CureRoute — AI Health Triage & Pharmacy Finder",
  description:
    "AI-powered health triage that analyzes your symptoms, suggests over-the-counter remedies, and maps you to the nearest local pharmacies. Built with safety-first medical disclaimers.",
  keywords: [
    "health triage",
    "AI symptoms",
    "pharmacy finder",
    "OTC remedies",
    "medical AI",
    "CureRoute",
  ],
  authors: [{ name: "CureRoute Team" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-200">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
