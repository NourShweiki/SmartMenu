import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartMenu",
};

// <html lang dir> is rendered per locale in app/[locale]/layout.tsx (arabic-rtl skill).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
