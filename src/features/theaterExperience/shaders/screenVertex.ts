/**
 * スクリーン頂点シェーダー（インライン）
 *
 * UV座標をフラグメントシェーダーにパススルー
 */
export const screenVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
