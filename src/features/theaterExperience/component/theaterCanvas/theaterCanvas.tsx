/**
 * TheaterCanvasコンポーネント
 * R3F Canvasのラッパー、dynamic importでSSR無効化
 * アイソメトリック ドールハウススタイル: フラット背景・ポストプロセスなし
 */

'use client';

import { memo, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';

import { cn } from '@/utils/cn';

import styles from './theaterCanvas.module.scss';

export interface TheaterCanvasProps {
  /** Canvas内に描画するR3F要素 */
  children: ReactNode;
  /** 追加クラス名 */
  className?: string;
}

export const TheaterCanvas = memo<TheaterCanvasProps>(function TheaterCanvas({
  children,
  className,
}) {
  return (
    <div className={cn(styles.c_theater_canvas, className)} aria-hidden='true'>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: true,
        }}
      >
        <color attach='background' args={['#f5f3ee']} />
        {children}
      </Canvas>
    </div>
  );
});

TheaterCanvas.displayName = 'TheaterCanvas';
