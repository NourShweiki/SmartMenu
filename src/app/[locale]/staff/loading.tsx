import { LoadingStatus } from "@/interface/web/components/loading-status";

// Shown instantly while a staff page loads, so every click gets immediate feedback.
// No server-side translations here: loading.tsx has no locale (see LoadingStatus).
export default function StaffLoading() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div role="status" className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
        <LoadingStatus />
        <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-white ring-1 ring-gray-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-white ring-1 ring-gray-200" />
      </div>
    </main>
  );
}
