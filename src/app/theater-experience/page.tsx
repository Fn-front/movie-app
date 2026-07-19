import type { Metadata } from 'next';

import { THEATER_QUERY_PARAM } from '@/constants';
import { resolveInitialTheaterSlug } from '@/features/theaterExperience/utils/resolveInitialTheaterSlug';

import { TheaterExperiencePageLoader } from './loader';

export const metadata: Metadata = {
  title: 'シアター体験 | Movie App',
  description:
    '3Dシアター体験。座席位置による視野占有率・音響分布をリアルタイムで確認できます。',
};

interface TheaterExperiencePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TheaterExperience({
  searchParams,
}: TheaterExperiencePageProps) {
  const params = await searchParams;
  const initialSlug = resolveInitialTheaterSlug(params[THEATER_QUERY_PARAM]);
  return <TheaterExperiencePageLoader initialSlug={initialSlug} />;
}
