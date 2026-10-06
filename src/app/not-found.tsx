import ar from "../../messages/ar.json";
import en from "../../messages/en.json";

// 404 outside /ar and /en (e.g. /fr). There is no locale here, so show both languages.
export default function RootNotFound() {
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white font-sans text-gray-900 antialiased">
        <h1 className="text-2xl font-semibold">{ar.NotFound.title}</h1>
        <p lang="en" dir="ltr" className="text-gray-500">
          {en.NotFound.title}
        </p>
      </body>
    </html>
  );
}
