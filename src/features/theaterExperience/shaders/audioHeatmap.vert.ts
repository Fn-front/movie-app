/**
 * オーディオヒートマップ頂点シェーダー（インライン）
 *
 * Turbopack の raw loader が .glsl を正しくバンドルしない問題の回避策として
 * GLSL ソースをテンプレートリテラルで保持する。
 * 正規ソースは audioHeatmap.vert.glsl を参照。
 */
export const vertexShader = /* glsl */ `
/**
 * オーディオヒートマップ頂点シェーダー
 * UV座標をフラグメントシェーダーに渡すパススルー
 */

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
