/**
 * フィルターアイコン
 */

import { memo } from 'react';
import { LuFilter } from 'react-icons/lu';

import type { IconProps } from '@/lib/types';

/**
 * FilterIconコンポーネント
 */
export const FilterIcon = memo<IconProps>(function FilterIcon({
  size = 18,
  className,
}) {
  return <LuFilter size={size} className={className} aria-hidden='true' />;
});

FilterIcon.displayName = 'FilterIcon';
