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
 *
 * UV座標に加え、頂点の**ワールドY**をフラグメントシェーダーへ渡す。
 * ヒートマップ面は傾斜床に沿って頂点変位させてあるため、音響計算で使う聴取点の
 * 高さも面の実高さに追従させる必要がある（固定値だと後列ほど実態とずれる）。
 */

varying vec2 vUv;
varying float vWorldY;

void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldY = worldPosition.y;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;
