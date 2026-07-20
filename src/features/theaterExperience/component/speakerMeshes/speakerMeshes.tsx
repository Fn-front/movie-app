/**
 * SpeakerMeshesコンポーネント
 * アイソメトリック ドールハウススタイル: フラットマテリアル + エッジ強調
 * 天井スピーカーは下向き、壁/床スピーカーは水平向きで視覚的に区別
 */

'use client';

import { memo } from 'react';
import { RoundedBoxGeometry } from 'three-stdlib';
import { extend } from '@react-three/fiber';
import { Edges } from '@react-three/drei';

// R3FにRoundedBoxGeometryを登録
extend({ RoundedBoxGeometry });

import type { TheaterSpeaker } from '../../types';
import {
  getSpeakerKind,
  getSpeakerSize,
  isSpeakerVisible,
} from '../../utils/speakerKinds';

export interface SpeakerMeshesProps {
  /** スピーカーデータ一覧 */
  speakers: TheaterSpeaker[];
}

export const SpeakerMeshes = memo<SpeakerMeshesProps>(function SpeakerMeshes({
  speakers,
}) {
  return (
    <group>
      {speakers.map((speaker) => {
        const kind = getSpeakerKind(speaker.channel);
        // スクリーンch（L/C/R/LFE）は幕裏想定で描画しない（幕手前への露出を解消）
        if (!isSpeakerVisible(kind)) return null;

        const size = getSpeakerSize(kind);
        // 天井は下向き、壁掛け（サラウンド）は水平向き
        const rotation: [number, number, number] =
          kind === 'ceiling' ? [Math.PI, 0, 0] : [0, 0, 0];

        return (
          <mesh
            key={speaker.id}
            position={[
              speaker.position_x,
              speaker.position_y,
              speaker.position_z,
            ]}
            rotation={rotation}
            castShadow
          >
            <roundedBoxGeometry
              args={[size.width, size.height, size.depth, 4, 0.03]}
            />
            <meshLambertMaterial color='#2a2a3a' />
            <Edges color='#0a0a14' lineWidth={1.2} />
          </mesh>
        );
      })}
    </group>
  );
});

SpeakerMeshes.displayName = 'SpeakerMeshes';
