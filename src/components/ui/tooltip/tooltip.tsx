/**
 * Tooltipコンポーネント
 */

'use client';

import { type ReactNode, memo } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/utils/cn';

import styles from './tooltip.module.scss';

/**
 * Tooltipコンポーネントのプロパティ
 */
export interface TooltipProps {
  /** ホバー・フォーカスで開く対象 */
  trigger: ReactNode;
  /** 吹き出しの中身 */
  children: ReactNode;
  /** 吹き出しを出す向き */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** カスタムクラス名 */
  className?: string;
}

/** 開くまでの待ち時間（ミリ秒）。誤ホバーで出続けないよう少し置く */
const DELAY_DURATION = 200;

/**
 * Tooltipコンポーネント
 *
 * Provider を内包しているため、使う側は置くだけでよい。
 * Radix が aria-describedby の付与・フォーカス対応・ESC での閉じを担保する。
 *
 * 中身にリンクを置く場合は `trigger` をフォーカス可能な要素にすること
 * （Radix はトリガーに tabIndex を補わない）。
 */
export const Tooltip = memo<TooltipProps>(function Tooltip({
  trigger,
  children,
  side = 'bottom',
  className,
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={DELAY_DURATION}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className={cn(styles.c_tooltip, className)}
          >
            {children}
            <TooltipPrimitive.Arrow className={styles.c_tooltip__arrow} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
});

Tooltip.displayName = 'Tooltip';
