import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Credits & Attributions',
  description: 'Acknowledgments for the technologies and assets used in the F1 Briefing Agent.',
};

export default function CreditsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="container mx-auto max-w-4xl px-4 py-16">
        <h1 className="mb-2 text-4xl font-bold">
          <span className="text-f1-red">Credits</span> &amp; Attributions
        </h1>
        <p className="mb-12 text-zinc-400">
          Acknowledgments for the technologies and assets used in this project
        </p>

        <section className="mb-12 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-4 text-2xl font-bold text-f1-red">3D Model</h2>
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-xl font-semibold">F1 2026 Release Car</h3>
              <p className="mb-2 text-zinc-300">
                <a
                  href="https://skfb.ly/oWL8J"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  &ldquo;F1 2026 Release Car&rdquo;
                </a>{' '}
                by{' '}
                <a
                  href="https://sketchfab.com/Nimaxo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  Nimaxo
                </a>{' '}
                is licensed under{' '}
                <a
                  href="http://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  Creative Commons Attribution
                </a>
              </p>
              <div className="mt-3 flex gap-2">
                <span className="rounded bg-zinc-800 px-3 py-1 text-sm">CC BY 4.0</span>
                <span className="rounded bg-zinc-800 px-3 py-1 text-sm">Sketchfab</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-bold text-f1-red">Technologies</h2>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
              <h3 className="mb-3 text-xl font-semibold">Frontend</h3>
              <ul className="space-y-2 text-zinc-300">
                <li>• React &amp; Next.js 14</li>
                <li>• TypeScript</li>
                <li>• Three.js / React Three Fiber</li>
                <li>• Tailwind CSS</li>
              </ul>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
              <h3 className="mb-3 text-xl font-semibold">Backend</h3>
              <ul className="space-y-2 text-zinc-300">
                <li>• Python &amp; FastAPI</li>
                <li>• LangChain &amp; LangGraph</li>
                <li>• Claude Sonnet 4 (Anthropic)</li>
                <li>• FastF1</li>
                <li>• Tavily API</li>
                <li>• OpenWeather API</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-12 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-4 text-2xl font-bold text-f1-red">Data Sources</h2>
          <ul className="space-y-3 text-zinc-300">
            <li>
              <strong className="text-white">FastF1:</strong> F1 telemetry, timing, and session data
            </li>
            <li>
              <strong className="text-white">Tavily:</strong> Web search and F1 news aggregation
            </li>
            <li>
              <strong className="text-white">OpenWeather:</strong> Weather forecast data for race
              locations
            </li>
          </ul>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-4 text-2xl font-bold text-f1-red">License</h2>
          <p className="mb-4 text-zinc-300">This project is licensed under the MIT License.</p>
          <p className="text-sm text-zinc-400">
            <strong>Note:</strong> The 3D model (F1 2026 Release Car) is separately licensed under
            CC BY 4.0 and requires attribution as stated above.
          </p>
        </section>

        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-block rounded-lg bg-f1-red px-6 py-3 font-semibold text-white transition-colors hover:bg-red-700"
          >
            ← Back to Briefing Agent
          </Link>
        </div>
      </div>
    </div>
  );
}
