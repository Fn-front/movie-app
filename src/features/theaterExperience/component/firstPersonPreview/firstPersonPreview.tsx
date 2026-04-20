/**
 * FirstPersonPreviewコンポーネント
 * 選択座席からの一人称視点プレビュー
 */

'use client';

import { memo, useMemo } from 'react';
import { PerspectiveCamera } from '@react-three/drei';

import type { TheaterSeat } from '../../types';

export interface FirstPersonPreviewProps {
  /** 選択中の座席 */
  seat: TheaterSeat;
}

export const FirstPersonPreview = memo<FirstPersonPreviewProps>(
  function FirstPersonPreview({ seat }) {
    // 着席時の目の高さ（座席Y + 座高1.2m程度）
    const eyeHeight = seat.position_y + 1.2;

    const cameraPosition = useMemo<[number, number, number]>(
      () => [seat.position_x, eyeHeight, seat.position_z],
      [seat.position_x, eyeHeight, seat.position_z],
    );

    return (
      <PerspectiveCamera
        makeDefault={false}
        position={cameraPosition}
        fov={60}
        near={0.1}
        far={100}
      />
    );
  },
);

FirstPersonPreview.displayName = 'FirstPersonPreview';
