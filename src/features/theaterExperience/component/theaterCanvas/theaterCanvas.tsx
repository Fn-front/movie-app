/**
 * TheaterCanvasコンポーネント
 * R3F Canvasのラッパー、dynamic importでSSR無効化
 * ACESFilmicToneMappingとポストプロセス（Bloom/Vignette）で映画的な描画
 */

'use client';

import { memo, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { ACESFilmicToneMapping } from 'three';

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
        camera={{ position: [0, 15, -20], fov: 50 }}
        gl={{
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: true,
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
      >
        {children}
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.9}
            luminanceSmoothing={0.2}
            intensity={0.1}
            mipmapBlur
          />
          <Vignette eskil={false} offset={0.35} darkness={0.35} />
        </EffectComposer>
      </Canvas>
    </div>
  );
});

TheaterCanvas.displayName = 'TheaterCanvas';
