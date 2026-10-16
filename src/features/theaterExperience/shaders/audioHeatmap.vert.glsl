/**
 * オーディオヒートマップ頂点シェーダー
 * UV座標をフラグメントシェーダーに渡すパススルー
 */

varying vec2 vUv;
varying float vWorldY;

void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldY = worldPosition.y;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
