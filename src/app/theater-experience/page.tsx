import type { Metadata } from 'next';

import { DEFAULT_THEATER_SLUG } from '@/constants/theaters';

import { TheaterExperiencePageLoader } from './loader';

export const metadata: Metadata = {
  title: 'シアター体験 | Movie App',
  description:
    '3Dシアター体験。座席位置による視野占有率・音響分布をリアルタイムで確認できます。',
};

export default function TheaterExperience() {
  return <TheaterExperiencePageLoader slug={DEFAULT_THEATER_SLUG} />;
}
