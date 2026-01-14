import dynamic from 'next/dynamic'
import BriefingChat from '@/components/BriefingChat'

const F1HeroScene = dynamic(() => import('@/components/3d/F1HeroScene'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] bg-zinc-900 animate-pulse flex items-center justify-center">
      <p className="text-zinc-500">Loading 3D scene...</p>
    </div>
  ),
})

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950">
      <F1HeroScene teamColor="#dc2626" />
      
      <div className="container mx-auto px-4 py-8">
        <BriefingChat />
      </div>
    </main>
  )
}
