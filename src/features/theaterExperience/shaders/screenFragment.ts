/**
 * スクリーンフラグメントシェーダー（インライン）
 *
 * ノイズベースのグラデーションがゆっくり変化し
 * 「映画が投影されている雰囲気」を演出する
 * - 暗めのグラデーション（暗い青 ↔ 暗い暖色）
 * - スクリーン端のビネット効果
 * - 微かなフリッカー（映写機のちらつき感）
 */
export const screenFragmentShader = /* glsl */ `
precision mediump float;

varying vec2 vUv;
uniform float uTime;

/**
 * 2Dシンプレックスノイズ近似
 */
vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
  const float K1 = 0.366025404; // (sqrt(3)-1)/2
  const float K2 = 0.211324865; // (3-sqrt(3))/6

  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  float m = step(a.y, a.x);
  vec2 o = vec2(m, 1.0 - m);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;

  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
  vec3 n = h * h * h * h * vec3(
    dot(a, hash(i)),
    dot(b, hash(i + o)),
    dot(c, hash(i + 1.0))
  );

  return dot(n, vec3(70.0));
}

void main() {
  // ゆっくり変化するノイズ（低周波）
  float slowTime = uTime * 0.08;
  float n1 = noise(vUv * 2.0 + vec2(slowTime, slowTime * 0.7));
  float n2 = noise(vUv * 3.5 + vec2(-slowTime * 0.5, slowTime * 1.2));
  float blend = n1 * 0.6 + n2 * 0.4;
  blend = blend * 0.5 + 0.5; // 0~1 にリマップ

  // 暗い青 ↔ 暗い暖色のグラデーション（映画的シーンの明暗）
  vec3 color1 = vec3(0.01, 0.02, 0.06); // 暗い青（暗いシーン）
  vec3 color2 = vec3(0.15, 0.10, 0.06); // 暖色（明るいシーン）
  vec3 color = mix(color1, color2, blend);

  // 第3レイヤー：大きなスケールのノイズで「シーンの構図」感
  float n3 = noise(vUv * 1.2 + vec2(slowTime * 0.3, -slowTime * 0.2));
  float scene = smoothstep(-0.3, 0.5, n3);
  color *= 0.5 + scene * 1.0;

  // スクリーン端のビネット効果（映画フレーム的に強め）
  vec2 centered = vUv - 0.5;
  float vignette = 1.0 - dot(centered, centered) * 3.0;
  vignette = clamp(vignette, 0.0, 1.0);
  color *= vignette;

  // 微かなフリッカー（映写機のちらつき感）
  float flicker = 0.97 + 0.03 * sin(uTime * 12.0 + sin(uTime * 3.7) * 2.0);
  color *= flicker;

  // ベース輝度を加算（スクリーンの投射光）
  color += vec3(0.12, 0.13, 0.20);

  gl_FragColor = vec4(color, 1.0);
}
`;
