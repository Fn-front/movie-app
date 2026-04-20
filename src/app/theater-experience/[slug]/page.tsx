import type { Metadata } from 'next';

import { TheaterExperiencePageLoader } from '../loader';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `シアター体験 - ${slug} | Movie App`,
    description:
      '3Dシアター体験。座席位置による視野占有率・音響分布をリアルタイムで確認できます。',
  };
}

export default async function TheaterExperienceBySlug({ params }: Props) {
  const { slug } = await params;
  return <TheaterExperiencePageLoader slug={slug} />;
}
