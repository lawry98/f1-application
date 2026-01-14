import BriefingChat from '@/components/BriefingChat'

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8 text-center">
          <h1 className="text-5xl font-bold mb-2">
            <span className="text-f1-red">F1</span> Briefing Agent
          </h1>
          <p className="text-zinc-400 text-lg">
            AI-powered race weekend analysis powered by Claude
          </p>
        </header>
        
        <BriefingChat />
      </div>
    </main>
  )
}
