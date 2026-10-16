/**
 * SpeakerMeshesコンポーネント
 *
 * 筐体・バッフル面・ドライバーコーン・ブラケットで構成し、DBに既にある
 * `direction_x/y/z`（音響の指向性計算と同じソース）の向きへ向ける。
 *
 * 旧実装は `kind === 'ceiling' ? [Math.PI, 0, 0] : [0, 0, 0]` で向きを出し分けて
 * いたが、対称な `RoundedBoxGeometry` をX軸まわりに180°回しても見た目は変わらず、
 * 「向きの出し分け」は視覚的に何も起きていなかった。壁掛けサラウンドも +Z
 * （スクリーン方向）を向いたままで客席を向いていなかった。
 *
 * 根本原因は「向きを示す面」がジオメトリに無いこと。箱がスピーカーに見えるのは
 * バッフル面とドライバーコーンが見えるからなので、造形と向きはセットで入れている。
 */

'use client';

import { memo } from 'react';
import { Edges } from '@react-three/drei';

import type { TheaterSpeaker } from '../../types';
import { directionToEuler } from '../../utils/speakerAiming';
import {
  getSpeakerKind,
  getSpeakerSize,
  isSpeakerVisible,
  type SpeakerKind,
} from '../../utils/speakerKinds';
import type { InteriorTheme } from '../../utils/theaterPalette';

/** バッフル板の厚み (m) */
const BAFFLE_THICKNESS = 0.02;
/** ドライバーコーンの厚み (m) */
const DRIVER_THICKNESS = 0.015;
/** ドライバーコーンの半径を筐体短辺の何倍にするか */
const DRIVER_RADIUS_RATIO = 0.33;
/** ブラケット（壁との間の取付金具）の寸法 (m) */
const BRACKET = { width: 0.06, height: 0.06, depth: 0.12 };
/**
 * 筐体の背面側の絞り率。
 * 参考写真（TCX の側壁サラウンドを拡大）では筐体が明確に楔形で、前面（バッフル側）が
 * 広く背面が狭い。四角錐台で表現するため、背面の半径を前面の何倍にするかを持つ。
 */
const CABINET_TAPER = 0.62;

export interface SpeakerMeshesProps {
  /** スピーカーデータ一覧 */
  speakers: TheaterSpeaker[];
  /** 内装テーマ（筐体・バッフル・ドライバーの色） */
  theme: InteriorTheme;
}

/**
 * スピーカー1台。
 *
 * ローカル +Z をバッフル面（正面）とし、`directionToEuler` が返すオイラー角で
 * DBの指向方向へ向ける。
 */
const SpeakerUnit = memo<{
  speaker: TheaterSpeaker;
  kind: SpeakerKind;
  theme: InteriorTheme;
}>(function SpeakerUnit({ speaker, kind, theme }) {
  const size = getSpeakerSize(kind);
  const rotation = directionToEuler(
    speaker.direction_x,
    speaker.direction_y,
    speaker.direction_z,
  );
  const driverRadius = Math.min(size.width, size.height) * DRIVER_RADIUS_RATIO;

  return (
    <group
      position={[speaker.position_x, speaker.position_y, speaker.position_z]}
      rotation={rotation}
    >
      {/*
        筐体（四角錐台の楔形）。
        CylinderGeometry の radialSegments=4 は半径を外接円とする正方形断面になるため、
        一辺を筐体幅に合わせるには半径を 1/√2 倍する。軸は +Y なので [π/2,0,0] で
        +Z（バッフル側）へ倒し、前面を広く・背面を狭くする。
      */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry
          args={[
            (size.width / Math.SQRT2) * CABINET_TAPER,
            size.width / Math.SQRT2,
            size.depth,
            4,
          ]}
        />
        <meshStandardMaterial
          color={theme.speaker.cabinet}
          roughness={0.6}
          metalness={0.2}
          flatShading
        />
        <Edges color={theme.speaker.driver} lineWidth={1.2} />
      </mesh>

      {/* バッフル板（筐体前面。一段明るくして正面を示す） */}
      <mesh position={[0, 0, size.depth / 2 + BAFFLE_THICKNESS / 2]}>
        <boxGeometry
          args={[size.width * 0.9, size.height * 0.9, BAFFLE_THICKNESS]}
        />
        <meshStandardMaterial
          color={theme.speaker.baffle}
          roughness={0.5}
          metalness={0.3}
        />
      </mesh>

      {/* ドライバーコーン（バッフル中央の円盤。向きを視覚的に意味づける） */}
      <mesh
        position={[
          0,
          0,
          size.depth / 2 + BAFFLE_THICKNESS + DRIVER_THICKNESS / 2,
        ]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry
          args={[driverRadius, driverRadius, DRIVER_THICKNESS, 12]}
        />
        <meshStandardMaterial
          color={theme.speaker.driver}
          roughness={0.75}
          metalness={0.1}
        />
      </mesh>

      {/*
        ブラケット（取付金具）。サラウンドのみ。参考写真では壁から張り出して
        取り付けられている。天井chは天井面に接して配置されるため不要。
      */}
      {kind === 'surround' && (
        <mesh position={[0, 0, -size.depth / 2 - BRACKET.depth / 2]}>
          <boxGeometry args={[BRACKET.width, BRACKET.height, BRACKET.depth]} />
          <meshStandardMaterial
            color={theme.speaker.cabinet}
            roughness={0.5}
            metalness={0.4}
          />
        </mesh>
      )}
    </group>
  );
});
SpeakerUnit.displayName = 'SpeakerUnit';

export const SpeakerMeshes = memo<SpeakerMeshesProps>(function SpeakerMeshes({
  speakers,
  theme,
}) {
  return (
    <group>
      {speakers.map((speaker) => {
        const kind = getSpeakerKind(speaker.channel);
        // スクリーンch（L/C/R/LFE）は幕裏想定で描画しない（幕手前への露出を解消）
        if (!isSpeakerVisible(kind)) return null;

        return (
          <SpeakerUnit
            key={speaker.id}
            speaker={speaker}
            kind={kind}
            theme={theme}
          />
        );
      })}
    </group>
  );
});

SpeakerMeshes.displayName = 'SpeakerMeshes';
