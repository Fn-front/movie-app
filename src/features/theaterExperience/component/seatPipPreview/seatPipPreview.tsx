/**
 * SeatPipPreviewコンポーネント
 * 選択された座席からの一人称視点プレビュー（PiP: Picture-in-Picture）
 * 右下隅にCSSで固定表示する小さなウィンドウ
 */

'use client';

import { memo, useEffect, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';

import type { TheaterSeat, Theater } from '../../types';

import styles from './seatPipPreview.module.scss';

/** 着座目線の高さ（座席Y座標からのオフセット） */
const SEATED_EYE_HEIGHT = 1.2;

/**
 * useThreeでcameraを取得しlookAt適用
 */
const CameraLookAtEffect = memo<{ target: [number, number, number] }>(
  function CameraLookAtEffect({ target }) {
    const { camera } = useThree();
    useEffect(() => {
      camera.lookAt(target[0], target[1], target[2]);
    }, [camera, target]);
    return null;
  },
);
CameraLookAtEffect.displayName = 'CameraLookAtEffect';

export interface SeatPipPreviewProps {
  /** 選択中の座席（null時は非表示） */
  seat: TheaterSeat | null;
  /** 劇場情報（スクリーン位置で注視点を決定） */
  theater: Theater;
  /** PiP内に描画するシーン要素（座席・スクリーン・スピーカー等） */
  children: ReactNode;
}

export const SeatPipPreview = memo<SeatPipPreviewProps>(function SeatPipPreview({
  seat,
  theater,
  children,
}) {
  if (!seat) return null;

  const cameraPosition: [number, number, number] = [
    seat.position_x,
    seat.position_y + SEATED_EYE_HEIGHT,
    seat.position_z,
  ];
  const lookAt: [number, number, number] = [
    seat.position_x,
    theater.screen_center_y,
    theater.screen_center_z,
  ];

  return (
    <div
      className={styles.c_seat_pip_preview}
      role='complementary'
      aria-label={`座席 ${seat.row_label}-${seat.seat_number} の視点プレビュー`}
    >
      <div className={styles.c_seat_pip_preview__label}>
        座席 {seat.row_label}-{seat.seat_number} の視点
      </div>
      <div className={styles.c_seat_pip_preview__canvas}>
        <Canvas
          shadows
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: false }}
        >
          <color attach='background' args={['#f5f3ee']} />
          <PerspectiveCamera
            makeDefault
            position={cameraPosition}
            fov={60}
            near={0.1}
            far={200}
          />
          <CameraLookAtEffect target={lookAt} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[10, 20, 5]} intensity={0.6} />
          {children}
        </Canvas>
      </div>
    </div>
  );
});

SeatPipPreview.displayName = 'SeatPipPreview';
