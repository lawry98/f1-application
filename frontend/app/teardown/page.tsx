import type { Metadata } from 'next';

import { TeardownPageClient } from '@/components/teardown/teardown-page-client';

export const metadata: Metadata = {
  title: 'Anatomy of an F1 Car',
  description:
    'A scroll-driven teardown that reveals the engineering hidden inside an F1 car — from carbon bodywork to the V6 turbo-hybrid power unit.',
};

export default function TeardownPage() {
  return <TeardownPageClient />;
}
