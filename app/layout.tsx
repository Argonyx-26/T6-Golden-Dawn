import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ModelProvider } from "@/components/ModelProvider";
import DemoBanner from "@/components/DemoBanner";
import AuthGate from "@/components/AuthGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OraTrace",
  description: "Offline oral lesion screening and 14-day follow-up for dentists.",
};

export const viewport: Viewport = {
  themeColor: "#f3f5f6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DemoBanner />
        <ModelProvider>
          <AuthGate>{children}</AuthGate>
        </ModelProvider>
      </body>
    </html>
  );
}
