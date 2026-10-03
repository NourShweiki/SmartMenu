import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartMenu",
};

// Locale routing (/ar, /en) and dir="rtl" come in a later iteration.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
