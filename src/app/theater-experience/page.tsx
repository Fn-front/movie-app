import type { Metadata } from 'next';

import {
  DEFAULT_THEATER_SLUG,
  THEATER_QUERY_PARAM,
} from '@/constants/theaters';

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
  const raw = params[THEATER_QUERY_PARAM];
  // 重複指定(?theater=a&theater=b)等で配列になった場合は不正として既定劇場にフォールバック
  const initialSlug =
    typeof raw === 'string' && raw.length > 0 ? raw : DEFAULT_THEATER_SLUG;
  return <TheaterExperiencePageLoader initialSlug={initialSlug} />;
}
