/**
 * TheaterCanvasコンポーネント
 * R3F Canvasのラッパー、dynamic importでSSR無効化
 * アイソメトリック ドールハウススタイル + シネマ質感のポストプロセス（Bloom/Vignette）
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
        gl={{
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: true,
          toneMapping: ACESFilmicToneMapping,
        }}
      >
        <color attach='background' args={['#f5f3ee']} />
        {children}
        {/*
          ポストプロセス（シネマ質感）:
          - Bloom: 通路灯・段差LED等の HDR 発光体（toneMapped=false）だけを滲ませる。
            luminanceThreshold=0.9 は明るい背景(#f5f3ee, ACES後≈0.8)を超える値で、
            背景をブルームさせず（ハロ/かすみを防ぎ）発光体のみ光らせるための設定。
            これにより #464 で自作していた加算合成グロー球が不要になり削除できる。
          - Vignette: 画面周縁をわずかに落とし、スクリーンへ視線を集めるシネマ感を付与。
          mipmapBlur で低コストに広がりを出し、E2E(WebGL)を重くしない。
        */}
        {/*
          multisampling={0}: MSAA レンダーターゲットを持たせず GPU メモリを抑える。
          CIのソフトウェアWebGL(SwiftShader)で EffectComposer のマルチサンプル用
          レンダーターゲットがメモリ/コンテキストを圧迫し、大席数(IMAX)でクラッシュ
          （E2Eの net::ERR_ABORTED）する事象を避けるための設定。
        */}
        <EffectComposer multisampling={0}>
          <Bloom
            luminanceThreshold={0.9}
            luminanceSmoothing={0.08}
            intensity={0.8}
            mipmapBlur
          />
          <Vignette offset={0.32} darkness={0.5} />
        </EffectComposer>
      </Canvas>
    </div>
  );
});

TheaterCanvas.displayName = 'TheaterCanvas';
