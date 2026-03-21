import type { Metadata } from 'next';

import { AwardsPageLoader } from './loader';

export const metadata: Metadata = {
  title: '受賞作品 | Movie App',
  description: '映画賞の受賞作品・ノミネート作品一覧',
};

export default function Awards() {
  return <AwardsPageLoader />;
}
