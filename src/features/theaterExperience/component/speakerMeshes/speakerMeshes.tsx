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

import type { TheaterSpeaker, SpeakerChannel } from '../../types';

const SPEAKER_SIZE = { width: 0.6, height: 0.35, depth: 0.4 };

/** 天井チャンネル判定 */
const CEILING_CHANNELS: ReadonlySet<SpeakerChannel> = new Set([
  'LTF',
  'RTF',
  'LTM',
  'RTM',
  'LTR',
  'RTR',
]);

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
        const isCeiling = CEILING_CHANNELS.has(speaker.channel);
        const rotation: [number, number, number] = isCeiling
          ? [Math.PI, 0, 0]
          : [0, 0, 0];

        return (
          <mesh
            key={speaker.id}
            position={[speaker.position_x, speaker.position_y, speaker.position_z]}
            rotation={rotation}
            castShadow
          >
            <roundedBoxGeometry
              args={[
                SPEAKER_SIZE.width,
                SPEAKER_SIZE.height,
                SPEAKER_SIZE.depth,
                4,
                0.03,
              ]}
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
