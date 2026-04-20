/**
 * オーディオヒートマップフラグメントシェーダー
 *
 * スピーカーからの音響強度をリアルタイムで可視化
 * - 逆二乗則による距離減衰
 * - 大気吸収（ISO 9613-1ベース）
 * - 定在波パターン（位相干渉）
 * - カラーマッピング（青→緑→黄→赤）
 */

precision mediump float;

varying vec2 vUv;

// スピーカーデータテクスチャ（各ピクセル: x,y,z,power）
uniform sampler2D uSpeakerData;
// スピーカー数
uniform float uSpeakerCount;
// 周波数 (Hz)
uniform float uFrequency;
// 大気吸収係数 (dB/m)
uniform float uAbsorption;
// 時間（アニメーション用）
uniform float uTime;
// 劇場の物理サイズ
uniform vec2 uRoomSize; // (width, depth)
// 劇場のオフセット（ワールド座標の原点からの変換）
uniform vec2 uRoomOffset; // (x_offset, z_offset)

const float PI = 3.14159265359;
const float SPEED_OF_SOUND = 343.0;
const float REF_DISTANCE = 1.0;

/**
 * UV座標をワールド座標に変換
 */
vec2 uvToWorld(vec2 uv) {
  return vec2(
    uv.x * uRoomSize.x + uRoomOffset.x,
    uv.y * uRoomSize.y + uRoomOffset.y
  );
}

/**
 * スピーカーデータテクスチャから位置とパワーを取得
 */
void getSpeakerData(int index, out vec3 pos, out float power) {
  float u = (float(index) + 0.5) / uSpeakerCount;
  vec4 data = texture2D(uSpeakerData, vec2(u, 0.5));
  pos = data.xyz;
  power = data.w;
}

/**
 * 距離減衰（逆二乗則）
 */
float calcDistanceAttenuation(float distance) {
  float d = max(distance, REF_DISTANCE);
  return 1.0 / (d * d);
}

/**
 * 大気吸収による減衰
 */
float calcAbsorptionLoss(float distance) {
  // dB/m → 線形減衰に変換: 10^(-absorption * distance / 10)
  return pow(10.0, -uAbsorption * distance / 10.0);
}

/**
 * HSVからRGBへの変換
 */
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

/**
 * 強度からヒートマップカラーへ変換
 * 青(0.0) → シアン → 緑 → 黄 → 赤(1.0)
 */
vec3 intensityToColor(float intensity) {
  float t = clamp(intensity, 0.0, 1.0);
  // Hue: 0.66(blue) → 0.0(red)
  float hue = mix(0.66, 0.0, t);
  return hsv2rgb(vec3(hue, 0.85, 0.6 + 0.4 * t));
}

void main() {
  vec2 worldPos = uvToWorld(vUv);
  float wavelength = SPEED_OF_SOUND / uFrequency;

  // 全スピーカーの寄与を加算（定在波パターン）
  float totalIntensity = 0.0;

  for (int i = 0; i < 32; i++) {
    if (float(i) >= uSpeakerCount) break;

    vec3 speakerPos;
    float power;
    getSpeakerData(i, speakerPos, power);

    // 2D距離（床面上）
    float dx = worldPos.x - speakerPos.x;
    float dz = worldPos.y - speakerPos.z; // UV.y → Z方向
    float distance = sqrt(dx * dx + dz * dz);

    // 振幅 = sqrt(power) * 距離減衰 * 大気吸収
    float amplitude = sqrt(power)
      * calcDistanceAttenuation(distance)
      * calcAbsorptionLoss(distance);

    // 定在波パターン: 距離ベースの空間的な干渉パターン
    // uTime でゆっくりアニメーション（視覚効果用、物理的な音速ではなく表示用）
    float spatialPhase = 2.0 * PI * distance / wavelength;
    float timePhase = uTime * 2.0; // ゆっくりしたアニメーション
    float wave = 0.5 + 0.5 * cos(spatialPhase + timePhase);

    totalIntensity += amplitude * wave;
  }

  // 正規化（スケーリングを大きくして視認性を確保）
  float normalizedIntensity = clamp(totalIntensity * 8.0, 0.0, 1.0);

  vec3 color = intensityToColor(normalizedIntensity);
  float alpha = 0.3 + 0.5 * normalizedIntensity;

  gl_FragColor = vec4(color, alpha);
}
