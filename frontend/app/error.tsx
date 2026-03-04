'use client';

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="max-w-md px-4 text-center">
        <h2 className="mb-4 text-2xl font-bold text-white">Something went wrong</h2>
        <p className="mb-6 text-zinc-400">{error.message}</p>
        <button
          onClick={reset}
          className="rounded-lg bg-f1-red px-6 py-3 font-semibold text-white transition-colors hover:bg-red-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
