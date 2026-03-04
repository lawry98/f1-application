export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="text-center">
        <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-f1-red border-t-transparent" />
        <p className="text-zinc-400">Loading...</p>
      </div>
    </div>
  );
}
