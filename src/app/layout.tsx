import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartMenu",
};

// Arabic is the default. Locale routing (/ar, /en) will set lang/dir per request in a later iteration.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
