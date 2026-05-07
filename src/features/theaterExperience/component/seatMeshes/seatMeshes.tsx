/**
 * SeatMeshesコンポーネント
 * InstancedMeshで座席を効率的に描画、クリック選択に対応
 * GLTFモデル使用（フォールバック: RoundedBox）
 *
 * Theatre Seat by Cormac White [CC-BY] via Poly Pizza
 * https://poly.pizza/m/b0nT_HhiCM4
 */

'use client';

import {
  Suspense,
  memo,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  useState,
} from 'react';
import {
  Object3D,
  Color,
  RepeatWrapping,
  type InstancedMesh as InstancedMeshType,
  type Mesh,
} from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import { extend } from '@react-three/fiber';
import { useTexture, useGLTF } from '@react-three/drei';

import type { TheaterSeat } from '../../types';

// R3FにRoundedBoxGeometryを登録
extend({ RoundedBoxGeometry });

// JSX型定義: extend()で登録したRoundedBoxGeometryのR3F型
declare module '@react-three/fiber' {
  interface ThreeElements {
    roundedBoxGeometry: {
      args?: ConstructorParameters<typeof RoundedBoxGeometry>;
      attach?: string;
    };
  }
}

/** 座席テクスチャのリピート回数 */
const SEAT_TEXTURE_REPEAT = 2;

/** 座席パーツのサイズ定義（フォールバック用） */
const SEAT_CUSHION = { width: 0.55, height: 0.12, depth: 0.45 };
const SEAT_BACK = { width: 0.55, height: 0.5, depth: 0.08 };
const ARMREST = { width: 0.05, height: 0.2, depth: 0.4 };

const COLOR_DEFAULT = new Color('#8b3030');
const COLOR_SELECTED = new Color('#e8c840');
const COLOR_HOVER = new Color('#a04030');
const COLOR_FRAME = new Color('#303038');

/** GLTFモデルパス */
const SEAT_MODEL_PATH = '/models/theater/seat.glb';

/**
 * GLTFモデルのスケール・位置調整
 * モデルサイズ: 幅0.22 × 高さ0.35 × 奥行0.18（72頂点）
 * 既存座席サイズ: 幅0.65 × 高さ0.7 × 奥行0.55 に合わせてスケーリング
 * Y軸+90度回転で背もたれを+Z方向（フォールバックと同じ配置）に向ける
 */
const SEAT_SCALE = 2.5;
/** Y軸回転（モデルの-X方向の背もたれを-Z方向＝反スクリーン側に向ける） */
const SEAT_ROTATION_Y = -Math.PI / 2;
/** モデル原点オフセット（回転後のモデル中心を座席位置に合わせる） */
const MODEL_CENTER_X = -0.023;
const MODEL_BOTTOM_Y = 0.245;
const MODEL_CENTER_Z = 0.068;
/** GLTFモデル内の布地マテリアル名 */
const FABRIC_MATERIAL_NAME = 'mat8';

export interface SeatMeshesProps {
  /** 座席データ一覧 */
  seats: TheaterSeat[];
  /** 選択中の座席ID */
  selectedSeatId: string | null;
  /** 座席クリック時コールバック */
  onSeatClick: (seat: TheaterSeat) => void;
}

/**
 * GLTFモデルベースの座席InstancedMesh
 * モデル内の各メッシュに対してInstancedMeshを生成
 */
const GLTFSeatInstances = memo<{
  seats: TheaterSeat[];
  selectedSeatId: string | null;
}>(function GLTFSeatInstances({ seats, selectedSeatId }) {
  const { nodes } = useGLTF(SEAT_MODEL_PATH);
  const textures = useTexture({
    map: '/textures/theater/seat_color.jpg',
    normalMap: '/textures/theater/seat_normal.jpg',
    roughnessMap: '/textures/theater/seat_roughness.jpg',
  });

  useMemo(() => {
    Object.values(textures).forEach((tex) => {
      tex.wrapS = RepeatWrapping;
      tex.wrapT = RepeatWrapping;
      tex.repeat.set(SEAT_TEXTURE_REPEAT, SEAT_TEXTURE_REPEAT);
    });
  }, [textures]);

  const meshNodes = useMemo(
    () =>
      Object.values(nodes).filter(
        (n): n is Mesh => (n as Mesh).isMesh === true,
      ),
    [nodes],
  );

  /** 各メッシュパーツ用のref配列 */
  const refs = useRef<(InstancedMeshType | null)[]>([]);
  /** マトリクス設定完了まで非表示（初回描画時の原点チラつき防止） */
  const [matricesReady, setMatricesReady] = useState(false);

  const tempObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    meshNodes.forEach((node, meshIndex) => {
      const mesh = refs.current[meshIndex];
      if (!mesh) return;

      const isFabric =
        node.material &&
        'name' in node.material &&
        node.material.name === FABRIC_MATERIAL_NAME;

      seats.forEach((seat, i) => {
        tempObject.position.set(
          seat.position_x + MODEL_CENTER_X * SEAT_SCALE,
          seat.position_y + MODEL_BOTTOM_Y * SEAT_SCALE,
          seat.position_z + MODEL_CENTER_Z * SEAT_SCALE,
        );
        tempObject.rotation.set(0, SEAT_ROTATION_Y, 0);
        tempObject.scale.setScalar(SEAT_SCALE);
        tempObject.updateMatrix();
        mesh.setMatrixAt(i, tempObject.matrix);

        if (isFabric) {
          const color =
            seat.id === selectedSeatId ? COLOR_SELECTED : COLOR_DEFAULT;
          mesh.setColorAt(i, color);
        } else {
          mesh.setColorAt(i, COLOR_FRAME);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    });
    setMatricesReady(true);
  }, [meshNodes, seats, selectedSeatId, tempObject]);

  return (
    <group visible={matricesReady}>
      {meshNodes.map((node, meshIndex) => {
        const isFabric =
          node.material &&
          'name' in node.material &&
          node.material.name === FABRIC_MATERIAL_NAME;

        return (
          <instancedMesh
            key={node.name}
            ref={(el) => {
              refs.current[meshIndex] = el;
            }}
            args={[node.geometry, undefined, seats.length]}
            frustumCulled={false}
            castShadow
          >
            {isFabric ? (
              <meshStandardMaterial
                {...textures}
                roughness={0.75}
                metalness={0.0}
                emissive='#1a0808'
                emissiveIntensity={0.8}
              />
            ) : (
              <meshStandardMaterial
                roughness={0.4}
                metalness={0.6}
                emissive='#060608'
                emissiveIntensity={0.5}
              />
            )}
          </instancedMesh>
        );
      })}
    </group>
  );
});
GLTFSeatInstances.displayName = 'GLTFSeatInstances';

// GLTFモデルのプリロード
useGLTF.preload(SEAT_MODEL_PATH);

/**
 * フォールバック: 座面のInstancedMesh（RoundedBox）
 */
const FallbackSeatCushions = memo<{
  seats: TheaterSeat[];
  selectedSeatId: string | null;
}>(function FallbackSeatCushions({ seats, selectedSeatId }) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!meshRef.current) return;
    seats.forEach((seat, i) => {
      tempObject.position.set(
        seat.position_x,
        seat.position_y + 0.3,
        seat.position_z,
      );
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
      const color = seat.id === selectedSeatId ? COLOR_SELECTED : COLOR_DEFAULT;
      meshRef.current!.setColorAt(i, color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [seats, selectedSeatId, tempObject]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, seats.length]}
      frustumCulled={false}
      castShadow
    >
      <roundedBoxGeometry
        args={[
          SEAT_CUSHION.width,
          SEAT_CUSHION.height,
          SEAT_CUSHION.depth,
          4,
          0.03,
        ]}
      />
      <meshStandardMaterial roughness={0.85} metalness={0.0} />
    </instancedMesh>
  );
});
FallbackSeatCushions.displayName = 'FallbackSeatCushions';

/**
 * フォールバック: 背もたれのInstancedMesh（RoundedBox）
 */
const FallbackSeatBacks = memo<{
  seats: TheaterSeat[];
  selectedSeatId: string | null;
}>(function FallbackSeatBacks({ seats, selectedSeatId }) {
  const meshRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!meshRef.current) return;
    seats.forEach((seat, i) => {
      tempObject.position.set(
        seat.position_x,
        seat.position_y + 0.6,
        seat.position_z + SEAT_CUSHION.depth / 2,
      );
      tempObject.rotation.set(-0.1, 0, 0);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
      const color = seat.id === selectedSeatId ? COLOR_SELECTED : COLOR_DEFAULT;
      meshRef.current!.setColorAt(i, color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [seats, selectedSeatId, tempObject]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, seats.length]}
      frustumCulled={false}
      castShadow
    >
      <roundedBoxGeometry
        args={[SEAT_BACK.width, SEAT_BACK.height, SEAT_BACK.depth, 4, 0.02]}
      />
      <meshStandardMaterial roughness={0.85} metalness={0.0} />
    </instancedMesh>
  );
});
FallbackSeatBacks.displayName = 'FallbackSeatBacks';

/**
 * フォールバック: 肘掛けのInstancedMesh（RoundedBox）
 */
const FallbackSeatArmrests = memo<{ seats: TheaterSeat[] }>(
  function FallbackSeatArmrests({ seats }) {
    const meshRef = useRef<InstancedMeshType>(null);
    const tempObject = useMemo(() => new Object3D(), []);

    useEffect(() => {
      if (!meshRef.current) return;
      seats.forEach((seat, i) => {
        // 左肘掛け
        tempObject.position.set(
          seat.position_x - SEAT_CUSHION.width / 2 - ARMREST.width / 2,
          seat.position_y + 0.35,
          seat.position_z + 0.03,
        );
        tempObject.rotation.set(0, 0, 0);
        tempObject.updateMatrix();
        meshRef.current!.setMatrixAt(i * 2, tempObject.matrix);
        meshRef.current!.setColorAt(i * 2, COLOR_FRAME);

        // 右肘掛け
        tempObject.position.set(
          seat.position_x + SEAT_CUSHION.width / 2 + ARMREST.width / 2,
          seat.position_y + 0.35,
          seat.position_z + 0.03,
        );
        tempObject.updateMatrix();
        meshRef.current!.setMatrixAt(i * 2 + 1, tempObject.matrix);
        meshRef.current!.setColorAt(i * 2 + 1, COLOR_FRAME);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) {
        meshRef.current.instanceColor.needsUpdate = true;
      }
    }, [seats, tempObject]);

    return (
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, seats.length * 2]}
        frustumCulled={false}
        castShadow
      >
        <roundedBoxGeometry
          args={[ARMREST.width, ARMREST.height, ARMREST.depth, 4, 0.015]}
        />
        <meshStandardMaterial roughness={0.4} metalness={0.6} />
      </instancedMesh>
    );
  },
);
FallbackSeatArmrests.displayName = 'FallbackSeatArmrests';

export const SeatMeshes = memo<SeatMeshesProps>(function SeatMeshes({
  seats,
  selectedSeatId,
  onSeatClick,
}) {
  /** 透明なクリック判定用InstancedMesh */
  const hitRef = useRef<InstancedMeshType>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!hitRef.current) return;
    seats.forEach((seat, i) => {
      tempObject.position.set(
        seat.position_x,
        seat.position_y + 0.45,
        seat.position_z,
      );
      tempObject.rotation.set(0, 0, 0);
      tempObject.updateMatrix();
      hitRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    hitRef.current.instanceMatrix.needsUpdate = true;
  }, [seats, tempObject]);

  const handlePointerOver = useCallback(
    (event: { instanceId?: number }) => {
      if (event.instanceId === undefined) return;
      const seat = seats[event.instanceId];
      if (seat && seat.id !== selectedSeatId) {
        document.body.style.cursor = 'pointer';
      }
    },
    [seats, selectedSeatId],
  );

  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = 'auto';
  }, []);

  const handleClick = useCallback(
    (event: { instanceId?: number; stopPropagation: () => void }) => {
      event.stopPropagation();
      if (event.instanceId === undefined) return;
      const seat = seats[event.instanceId];
      if (seat) {
        onSeatClick(seat);
      }
    },
    [seats, onSeatClick],
  );

  return (
    <group>
      {/* GLTFモデル座席（preload済みのため即時ロード、fallback不要） */}
      <Suspense fallback={null}>
        <GLTFSeatInstances seats={seats} selectedSeatId={selectedSeatId} />
      </Suspense>

      {/* 透明なクリック判定メッシュ */}
      <instancedMesh
        ref={hitRef}
        args={[undefined, undefined, seats.length]}
        frustumCulled={false}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <boxGeometry args={[0.65, 0.7, 0.55]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </instancedMesh>
    </group>
  );
});

SeatMeshes.displayName = 'SeatMeshes';
