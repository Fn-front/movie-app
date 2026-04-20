/**
 * AudioHeatmapPlaneコンポーネント
 * ShaderMaterialとDataTextureでオーディオヒートマップを描画
 * 色: 紫(低強度) → 青 → シアン → 緑 → 黄 → 赤(高強度)
 */

'use client';

import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ShaderMaterial as ShaderMaterialType } from 'three';

import type { AudioShaderUniforms } from '../../hooks/useAudioShader';

/** 頂点シェーダー: UV座標をフラグメントに渡すパススルー */
const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** フラグメントシェーダー: スピーカー音響強度ヒートマップ */
const fragmentShader = /* glsl */ `
precision mediump float;
varying vec2 vUv;

uniform sampler2D uSpeakerData;
uniform float uSpeakerCount;
uniform float uFrequency;
uniform float uAbsorption;
uniform float uTime;
uniform vec2 uRoomSize;
uniform vec2 uRoomOffset;

const float PI = 3.14159265359;
const float SPEED_OF_SOUND = 343.0;
const float REF_DISTANCE = 1.0;

vec2 uvToWorld(vec2 uv) {
  return vec2(
    uv.x * uRoomSize.x + uRoomOffset.x,
    uv.y * uRoomSize.y + uRoomOffset.y
  );
}

void getSpeakerData(int index, out vec3 pos, out float power) {
  float u = (float(index) + 0.5) / uSpeakerCount;
  vec4 data = texture2D(uSpeakerData, vec2(u, 0.5));
  pos = data.xyz;
  power = data.w;
}

float calcDistanceAttenuation(float distance) {
  float d = max(distance, REF_DISTANCE);
  return 1.0 / (d * d);
}

float calcAbsorptionLoss(float distance) {
  return pow(10.0, -uAbsorption * distance / 10.0);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 intensityToColor(float intensity) {
  float t = clamp(intensity, 0.0, 1.0);
  float hue = mix(0.75, 0.0, t);
  float sat = 0.7 + 0.3 * t;
  float val = 0.4 + 0.6 * t;
  return hsv2rgb(vec3(hue, sat, val));
}

void main() {
  vec2 worldPos = uvToWorld(vUv);
  float wavelength = SPEED_OF_SOUND / uFrequency;
  float totalIntensity = 0.0;

  for (int i = 0; i < 32; i++) {
    if (float(i) >= uSpeakerCount) break;

    vec3 speakerPos;
    float power;
    getSpeakerData(i, speakerPos, power);

    float dx = worldPos.x - speakerPos.x;
    float dz = worldPos.y - speakerPos.z;
    float distance = sqrt(dx * dx + dz * dz);

    float amplitude = sqrt(power)
      * calcDistanceAttenuation(distance)
      * calcAbsorptionLoss(distance);

    float spatialPhase = 2.0 * PI * distance / wavelength;
    float timePhase = uTime * 2.0;
    float wave = 0.5 + 0.5 * cos(spatialPhase + timePhase);

    totalIntensity += amplitude * wave;
  }

  float avgIntensity = totalIntensity / max(uSpeakerCount, 1.0);
  float normalizedIntensity = pow(clamp(avgIntensity * 2.5, 0.0, 1.0), 1.8);

  vec3 color = intensityToColor(normalizedIntensity);
  float alpha = smoothstep(0.02, 0.5, normalizedIntensity) * 0.55;

  gl_FragColor = vec4(color, alpha);
}
`;

export interface AudioHeatmapPlaneProps {
  /** シェーダーuniforms */
  uniforms: AudioShaderUniforms;
  /** 平面の幅 (m) */
  width: number;
  /** 平面の奥行 (m) */
  depth: number;
  /** prefers-reduced-motionが有効か */
  reducedMotion?: boolean;
}

export const AudioHeatmapPlane = memo<AudioHeatmapPlaneProps>(
  function AudioHeatmapPlane({
    uniforms,
    width,
    depth,
    reducedMotion = false,
  }) {
    const materialRef = useRef<ShaderMaterialType>(null);

    // フレームごとにuTimeを更新
    useFrame((_, delta) => {
      if (materialRef.current && !reducedMotion) {
        materialRef.current.uniforms.uTime.value += delta * 0.5;
      }
    });

    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[width, depth, 128, 128]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms as unknown as Record<string, { value: unknown }>}
          transparent
          depthWrite={false}
        />
      </mesh>
    );
  },
);

AudioHeatmapPlane.displayName = 'AudioHeatmapPlane';
