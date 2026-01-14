export default function CreditsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="text-4xl font-bold mb-2">
          <span className="text-f1-red">Credits</span> & Attributions
        </h1>
        <p className="text-zinc-400 mb-12">
          Acknowledgments for the technologies and assets used in this project
        </p>

        {/* 3D Model Credits */}
        <section className="mb-12 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-f1-red mb-4">3D Model</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold mb-2">F1 2026 Release Car</h3>
              <p className="text-zinc-300 mb-2">
                <a 
                  href="https://skfb.ly/oWL8J" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  "F1 2026 Release Car"
                </a>
                {' '}by{' '}
                <a 
                  href="https://sketchfab.com/Nimaxo" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Nimaxo
                </a>
                {' '}is licensed under{' '}
                <a 
                  href="http://creativecommons.org/licenses/by/4.0/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Creative Commons Attribution
                </a>
              </p>
              <div className="flex gap-2 mt-3">
                <span className="px-3 py-1 bg-zinc-800 rounded text-sm">CC BY 4.0</span>
                <span className="px-3 py-1 bg-zinc-800 rounded text-sm">Sketchfab</span>
              </div>
            </div>
          </div>
        </section>

        {/* Technologies */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-f1-red mb-4">Technologies</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <h3 className="text-xl font-semibold mb-3">Frontend</h3>
              <ul className="space-y-2 text-zinc-300">
                <li>• React & Next.js 14</li>
                <li>• TypeScript</li>
                <li>• Three.js</li>
                <li>• React Three Fiber</li>
                <li>• React Three Drei</li>
                <li>• Tailwind CSS</li>
              </ul>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <h3 className="text-xl font-semibold mb-3">Backend</h3>
              <ul className="space-y-2 text-zinc-300">
                <li>• Python & FastAPI</li>
                <li>• LangChain & LangGraph</li>
                <li>• Claude Sonnet 4 (Anthropic)</li>
                <li>• FastF1</li>
                <li>• Tavily API</li>
                <li>• OpenWeather API</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Data Sources */}
        <section className="mb-12 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-f1-red mb-4">Data Sources</h2>
          <ul className="space-y-3 text-zinc-300">
            <li>
              <strong className="text-white">FastF1:</strong> F1 telemetry, timing, and session data
            </li>
            <li>
              <strong className="text-white">Tavily:</strong> Web search and F1 news aggregation
            </li>
            <li>
              <strong className="text-white">OpenWeather:</strong> Weather forecast data for race locations
            </li>
          </ul>
        </section>

        {/* License */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-f1-red mb-4">License</h2>
          <p className="text-zinc-300 mb-4">
            This project is licensed under the MIT License.
          </p>
          <p className="text-zinc-400 text-sm">
            <strong>Note:</strong> The 3D model (F1 2026 Release Car) is separately licensed 
            under CC BY 4.0 and requires attribution as stated above.
          </p>
        </section>

        {/* Back Link */}
        <div className="mt-12 text-center">
          <a 
            href="/"
            className="inline-block px-6 py-3 bg-f1-red hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
          >
            ← Back to Briefing Agent
          </a>
        </div>
      </div>
    </div>
  );
}
