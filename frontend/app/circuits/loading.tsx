/**
 * The loading screen for `/circuits` and `/circuits/[slug]`. Only the dynamic routes carry one.
 *
 * At the root this wrapped every page in a Suspense boundary, and React 19 streams a large finished
 * boundary *outlined* and reveals it no sooner than 300ms after first paint — so on Next 16 seven
 * static routes opened on this spinner. Here it earns its place: a client navigation to a
 * `force-dynamic` route shows it at once while the server renders. It also streams the response,
 * which is why an alias slug's redirect and an unknown slug's 404 both land as HTTP 200.
 */
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
