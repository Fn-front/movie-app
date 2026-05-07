/**
 * SpeakerMeshesコンポーネント
 * RoundedBox + メタリックマテリアルでスピーカーを描画
 * 天井スピーカーは下向き、壁/床スピーカーは水平向きで視覚的に区別
 */

'use client';

import { memo, useRef, useMemo, useEffect } from 'react';
import {
  Object3D,
  Color,
  type InstancedMesh as InstancedMeshType,
} from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import { extend } from '@react-three/fiber';

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

/** LFEチャンネル判定 */
const LFE_CHANNELS: ReadonlySet<SpeakerChannel> = new Set(['LFE']);

const COLOR_CEILING = new Color('#5090e0');
const COLOR_WALL = new Color('#404050');
const COLOR_LFE = new Color('#7040b0');

export interface SpeakerMeshesProps {
  /** スピーカーデータ一覧 */
  speakers: TheaterSpeaker[];
}

export const SpeakerMeshes = memo<SpeakerMeshesProps>(function SpeakerMeshes({
  speakers,
}) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!meshRef.current) return;

    speakers.forEach((speaker, i) => {
      tempObject.position.set(
        speaker.position_x,
        speaker.position_y,
        speaker.position_z,
      );

      // 天井スピーカーは下向きに回転
      if (CEILING_CHANNELS.has(speaker.channel)) {
        tempObject.rotation.set(Math.PI, 0, 0);
      } else {
        tempObject.rotation.set(0, 0, 0);
      }

      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);

      // チャンネル種別で色分け
      let color: Color;
      if (CEILING_CHANNELS.has(speaker.channel)) {
        color = COLOR_CEILING;
      } else if (LFE_CHANNELS.has(speaker.channel)) {
        color = COLOR_LFE;
      } else {
        color = COLOR_WALL;
      }
      meshRef.current!.setColorAt(i, color);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [speakers, tempObject]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, speakers.length]}
      frustumCulled={false}
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
      <meshStandardMaterial
        roughness={0.4}
        metalness={0.3}
        emissive='#4060a0'
        emissiveIntensity={0.6}
      />
    </instancedMesh>
  );
});

SpeakerMeshes.displayName = 'SpeakerMeshes';
