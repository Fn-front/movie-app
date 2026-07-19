/**
 * オーディオヒートマップフラグメントシェーダー（インライン）
 *
 * Turbopack の raw loader が .glsl を正しくバンドルしない問題の回避策として
 * GLSL ソースをテンプレートリテラルで保持する。
 * 正規ソースは audioHeatmap.frag.glsl を参照。
 */
export const fragmentShader = /* glsl */ `
/**
 * オーディオヒートマップフラグメントシェーダー
 *
 * スピーカーからの音響強度をリアルタイムで可視化
 * - 距離減衰（振幅 ∝ 1/d, 逆二乗則ベース）
 * - 大気吸収（ISO 9613-1ベース, exp(-kd)）
 * - Phasor sum による時間平均干渉パターン
 * - カラーマッピング（viridis: 知覚均一・色覚多様性(CVD)セーフ）
 */

precision mediump float;

varying vec2 vUv;

// スピーカーデータテクスチャ（各ピクセル: x,y,z,power）
uniform sampler2D uSpeakerData;
// スピーカー数
uniform float uSpeakerCount;
// 周波数 (Hz)
uniform float uFrequency;
// 大気吸収係数 (1/m, Np/m)
uniform float uAbsorption;
// 時間（アニメーション用）
uniform float uTime;
// 劇場の物理サイズ
uniform vec2 uRoomSize; // (width, depth)
// 劇場のオフセット（ワールド座標の原点からの変換）
uniform vec2 uRoomOffset; // (x_offset, z_offset)
// スライスのY座標（ボリュメトリック表示用）
uniform float uSliceY;
// スライスのアルファ値（枚数に応じて調整）
uniform float uSliceAlpha;

const float PI = 3.14159265359;
const float SPEED_OF_SOUND = 343.0;
const float REF_DISTANCE = 1.0;

/**
 * UV座標をワールド座標に変換
 */
vec2 uvToWorld(vec2 uv) {
  return vec2(
    uv.x * uRoomSize.x + uRoomOffset.x,
    (1.0 - uv.y) * uRoomSize.y + uRoomOffset.y
  );
}

/**
 * スピーカーデータテクスチャから位置・パワー・方向・指向性を取得
 * row0 (v=0.25): [position_x, position_y, position_z, power_watts]
 * row1 (v=0.75): [direction_x, direction_y, direction_z, directivity_alpha]
 */
void getSpeakerData(int index, out vec3 pos, out float power, out vec3 dir, out float alpha) {
  float u = (float(index) + 0.5) / uSpeakerCount;
  vec4 posData = texture2D(uSpeakerData, vec2(u, 0.25));
  vec4 dirData = texture2D(uSpeakerData, vec2(u, 0.75));
  pos = posData.xyz;
  power = posData.w;
  dir = dirData.xyz;
  alpha = dirData.w;
}

/**
 * スピーカー指向性パターン（カーディオイド）
 * D(θ) = α + (1 - α) × max(cos(θ), 0)
 */
float calcDirectivity(vec3 speakerDir, vec3 toListener, float alpha) {
  float dirLen = length(speakerDir);
  float tolLen = length(toListener);
  if (dirLen == 0.0 || tolLen == 0.0) return alpha;
  float cosTheta = dot(speakerDir / dirLen, toListener / tolLen);
  return alpha + (1.0 - alpha) * max(cosTheta, 0.0);
}

/**
 * 距離減衰（振幅ベース）
 * 音響強度 I ∝ 1/d² → 振幅 p ∝ 1/d
 * A(d) = 1 / (√(4π) × d)
 */
float calcDistanceAttenuation(float distance) {
  float d = max(distance, REF_DISTANCE);
  return 1.0 / (sqrt(4.0 * PI) * d);
}

/**
 * 大気吸収による減衰
 * α(f, d) = exp(-k × d)
 */
float calcAbsorptionLoss(float distance) {
  return exp(-uAbsorption * distance);
}

/**
 * 強度からヒートマップカラーへ変換（viridis 近似）
 * viridis は知覚均一かつ色覚多様性(CVD)セーフな連続カラーマップ。
 * レインボー(hue回転)は中〜高で緑〜黄〜赤が潰れて判別不能なため置換。
 * 多項式近似の係数は公開実装（https://www.shadertoy.com/view/WlfXRN, public domain）由来。
 * 低(暗い紫) → 青 → 緑 → 黄(高)
 */
vec3 intensityToColor(float intensity) {
  float t = clamp(intensity, 0.0, 1.0);
  const vec3 c0 = vec3(0.2777273272234177, 0.005407344544966578, 0.3340998053353061);
  const vec3 c1 = vec3(0.1050930431085774, 1.404613529898575, 1.384590162594685);
  const vec3 c2 = vec3(-0.3308618287255563, 0.214847559468213, 0.09509516302823659);
  const vec3 c3 = vec3(-4.634230498983486, -5.799100973351585, -19.33244095627987);
  const vec3 c4 = vec3(6.228269936347081, 14.17993336680509, 56.69055260068105);
  const vec3 c5 = vec3(4.776384997670288, -13.74514537774601, -65.35303263337234);
  const vec3 c6 = vec3(-5.435455855934631, 4.645852612178535, 26.3124352495832);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}

void main() {
  vec2 worldPos = uvToWorld(vUv);
  float wavelength = SPEED_OF_SOUND / uFrequency;

  // Phasor sum（時間平均の干渉パターン）
  float waveNumber = 2.0 * PI / wavelength;
  float sumReal = 0.0;
  float sumImag = 0.0;

  for (int i = 0; i < 32; i++) {
    if (float(i) >= uSpeakerCount) break;

    vec3 speakerPos;
    float power;
    vec3 speakerDir;
    float dirAlpha;
    getSpeakerData(i, speakerPos, power, speakerDir, dirAlpha);

    // 3D距離（スライスのY高さを考慮）
    float dx = worldPos.x - speakerPos.x;
    float dy = uSliceY - speakerPos.y;
    float dz = worldPos.y - speakerPos.z; // UV.y → Z方向
    float distance = sqrt(dx * dx + dy * dy + dz * dz);

    // 指向性パターン
    float directivity = calcDirectivity(speakerDir, vec3(dx, dy, dz), dirAlpha);

    // 振幅 = sqrt(power) * 距離減衰 * 大気吸収 * 指向性
    float amplitude = sqrt(power)
      * calcDistanceAttenuation(distance)
      * calcAbsorptionLoss(distance)
      * directivity;

    // Phasor: 空間位相のみ（時間項は時間平均で消去）
    float phase = waveNumber * distance;
    sumReal += amplitude * cos(phase);
    sumImag += amplitude * sin(phase);
  }

  // Phasor magnitude = 時間平均RMS強度
  float magnitude = sqrt(sumReal * sumReal + sumImag * sumImag);
  // ゆっくりしたアニメーション（視覚効果用）
  float animFactor = 0.9 + 0.1 * sin(uTime * 1.5);

  // 対数スケール（dB的）で正規化 — 人間の聴覚特性に近い表示
  float avgIntensity = magnitude * animFactor / max(uSpeakerCount, 1.0);
  float logIntensity = log(1.0 + avgIntensity * 30.0) / log(1.0 + 30.0);
  float normalizedIntensity = clamp(logIntensity, 0.0, 1.0);

  vec3 color = intensityToColor(normalizedIntensity);
  // 低強度は完全透明に、高強度でも半透明で床を透過
  float alpha = smoothstep(0.05, 0.5, normalizedIntensity) * uSliceAlpha;

  gl_FragColor = vec4(color, alpha);
}
`;
