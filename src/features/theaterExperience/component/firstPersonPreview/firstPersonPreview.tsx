/**
 * FirstPersonPreviewコンポーネント
 * 選択座席からの一人称視点プレビュー
 */

'use client';

import { memo, useMemo } from 'react';
import { PerspectiveCamera } from '@react-three/drei';

import type { TheaterSeat, Theater } from '../../types';

export interface FirstPersonPreviewProps {
  /** 選択中の座席 */
  seat: TheaterSeat;
  /** 劇場データ */
  theater: Theater;
}

export const FirstPersonPreview = memo<FirstPersonPreviewProps>(
  function FirstPersonPreview({ seat, theater }) {
    // 着席時の目の高さ（座席Y + 座高1.2m程度）
    const eyeHeight = seat.position_y + 1.2;

    const cameraPosition = useMemo<[number, number, number]>(
      () => [seat.position_x, eyeHeight, seat.position_z],
      [seat.position_x, eyeHeight, seat.position_z],
    );

    const lookAt = useMemo<[number, number, number]>(
      () => [
        theater.screen_center_x,
        theater.screen_center_y,
        theater.screen_center_z,
      ],
      [
        theater.screen_center_x,
        theater.screen_center_y,
        theater.screen_center_z,
      ],
    );

    return (
      <PerspectiveCamera
        makeDefault={false}
        position={cameraPosition}
        fov={60}
        near={0.1}
        far={100}
        // lookAt は PerspectiveCamera の props として直接渡せないため、
        // 呼び出し側で ref 経由で制御するか、View で囲んで使用する
      />
    );
  },
);

FirstPersonPreview.displayName = 'FirstPersonPreview';
