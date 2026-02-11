/**
 * フィルターアイコン
 */

import { memo } from 'react';
import { IoFilterOutline } from 'react-icons/io5';

import type { IconProps } from '@/lib/types';

/**
 * FilterIconコンポーネント
 */
export const FilterIcon = memo<IconProps>(function FilterIcon({
  size = 18,
  className,
}) {
  return (
    <IoFilterOutline size={size} className={className} aria-hidden='true' />
  );
});

FilterIcon.displayName = 'FilterIcon';
