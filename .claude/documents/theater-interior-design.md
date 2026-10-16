# シアター体験 内装デザイン刷新 設計書

## 概要

`/theater-experience` の3Dシーンの内装意匠を、実在の映画館（TOHOシネマズ）の内装写真を参考に刷新する。

現状のシーンは「アイソメトリック・ドールハウス（フラットマテリアル＋エッジ強調）」として作られており、壁・床は単色の `planeGeometry` 1枚、座席とスピーカーは箱型、通路には段が無い。これを **フォト寄り** に振り、壁・通路階段・座席・床・スクリーン・スピーカー・ライティングの各系統に手を入れる。

参考にした実物:

- <https://www.tohotheater.jp/service/premium_theater/>
- <https://www.tohotheater.jp/theater/081/institution05.html>（TOHOシネマズ日比谷）

> **注記**: 本書は意匠（見た目）の設計書である。座標系・DBスキーマ・音響計算の設計は [`theater-experience-design.md`](theater-experience-design.md) を正とし、本書ではそれらを変更しない。

---

## 1. スコープ

### 含むもの

| # | 系統 | 内容 |
|---|---|---|
| 1 | 内装テーマ | `WallColors` を `InteriorTheme` に拡張し、フォーマット別の内装アイデンティティを一元管理 |
| 2 | 手続き的テクスチャ | `CanvasTexture` でカーペット柄・壁グラフィック・幕のパーフォレーションを生成 |
| 3 | 壁 | 縦リブ（ルーバー）＋天井際のコーブ照明＋幅木（ダド）＋壁グラフィック |
| 4 | 通路階段 | 縦通路に踏面・蹴込みを生成し、蹴込みに琥珀LED帯・段鼻に明ライン |
| 5 | 座席 | 背もたれ上端をドーム状に、ヘッドレスト枕を追加、色をテーマ化 |
| 6 | スクリーン | 黒マスキングの大型化、幕面のパーフォレーション表現 |
| 7 | スピーカー | 客席方向へのエイミング、バッフル・ドライバー・ブラケットの造形、色のテーマ化 |
| 8 | ライティング | 視点別（俯瞰＝現状維持 / 一人称＝劇場照明） |

### 含まないもの

- **スクリーンの湾曲**。`projectScreenQuad` / `calcViewingDistortion`（`utils/fieldOfView.ts`）は幕を平面矩形として台形投影しているため、3Dだけ湾曲させると歪みプレビューと実際の見え方が乖離する。湾曲は「DBに `screen_curvature` を持たせ、歪み計算も曲面サンプリングに直す」までやって初めて整合するので、本件のスコープ外とする
- **DBスキーマ変更**。通路位置は既存の座席座標から導出できるため、マイグレーション不要
- **画像アセットの追加**。`public/` へのテクスチャ画像配置は行わない（理由は §2.2）
- **モバイル対応**。既存どおりデスクトップのみ
- **俯瞰ライティングの変更**（§10 参照）
- **スピーカーの配置座標の変更**。DBの `theater_speakers` の座標は音響計算の入力でもあるため動かさない。本件で変えるのは**向きと造形と色**のみ

---

## 2. 設計の前提と制約

### 2.1 パフォーマンスのボトルネックはGPU側にある

本設計に先立ち、「WASM化で処理速度・重さが改善するか」を調査した。**結論は「改善しない」** であり、この事実が最適化方針を決める。

| 処理 | 実行場所 |
|---|---|
| 音響ヒートマップ | GLSLフラグメントシェーダー（`shaders/audioHeatmap.frag`）＝GPU |
| スクリーンの投影表現 | GLSL（`shaders/screenFragment`）＝GPU |
| Bloom / Vignette | `postprocessing` のレンダーパス＝GPU |
| シャドウマップ描画 | GPU |
| `InstancedMesh` の行列更新 | JS。ただし**毎フレームではなく座席データ変更時の `useEffect` で1回のみ**（`seatMeshes.tsx`） |
| 毎フレームのJS処理 | カメラ補間1つ＋uniform更新1つのみ |

JS側で走る計算は微小で、WASMに移しても計測可能な差は出ない。また、CIでのE2Eの重さ・クラッシュの原因は **SwiftShader（Chrome組み込みのソフトウェアWebGLラスタライザ、ネイティブコード）** であり、アプリ側の実装言語とは無関係である。

したがって **本設計で抑えるべきコストは「頂点数」「ドローコール数」「テクスチャフェッチ」「シャドウマップに入るジオメトリ量」** であり、以下を原則とする。

- 反復要素（リブ・階段の踏面/蹴込み/LED・ヘッドレスト）は **すべて `InstancedMesh` に集約し、1種類＝1ドローコール** とする
- 新規に追加するメッシュに **`castShadow` を付けない**（既存の肘掛け・台座と同じ方針）
- テクスチャは **256〜512px に制限**し、フォーマット単位でモジュールレベルにキャッシュして再生成しない
- `EffectComposer multisampling={0}`、`dpr={[1, 1.5]}` の既存設定は変更しない

### 2.2 外部アセットを追加しない

`CLAUDE.md` の「不要な外部依存を追加しない」に従い、テクスチャ画像ファイルは導入しない。参考写真の意匠（縦ストライプ、同心円のボケ、抽象スウープ、斜めストライプ）はいずれも幾何学的で、Canvas 2D API での手続き的生成と相性が良い。実写テクスチャが要る要素（木目のナチュラル感、レザーのシボ）は、俯瞰で座席1脚が数十pxというスケールでは視認できないため、採用する意味が薄い。

### 2.3 アクセシビリティ上の不可侵条件

- **座席の識別性**: 選択中（`#ffaa00`）・車椅子席（`#3b82f6`）・通常席の3者が俯瞰で判別できること。内装を暗くする際、通常席の色がこの2色と混同されないこと
- **ホバー枠の色**: `#d97706`（`--warning-dark`）は WCAG 1.4.11（非テキスト3:1）を満たすために選定された値であり、変更しない
- **点滅の禁止**: コーブ照明・階段LEDは静的発光とし、点滅・明滅アニメーションを付けない（WCAG 2.3.1）
- **`prefers-reduced-motion`**: 視点別ライティングの補間は reduced-motion 時に即時切替とする

---

## 3. 内装テーマ（`utils/theaterPalette.ts` の拡張）

現状の `WallColors { wall, ceiling, screenWall }` を `InteriorTheme` に拡張する。フォーマットごとに参考写真を1枚ずつ割り当て、内装アイデンティティを与える。

```ts
/** カーペット柄の種別 */
export type CarpetPattern = 'dots' | 'swoop' | 'diagonal';

/** 壁グラフィックの種別（'none' は下地のみ） */
export type WallGraphic = 'dots' | 'swoop' | 'none';

export interface InteriorTheme {
  /** 側壁・後壁の下地色 */
  wall: string;
  /** 天井色 */
  ceiling: string;
  /** スクリーン側壁（迷光を殺す黒） */
  screenWall: string;
  /** 幅木（床から 0.6m の帯）の色 */
  dado: string;
  /** 縦リブの正面色 */
  rib: string;
  /** 縦リブの側面色（陰影の対になる一段暗い色） */
  ribShade: string;
  /** コーブ照明の色（HDR化して Bloom に乗せる） */
  cove: string;
  /** 壁グラフィックの種別と色 */
  wallGraphic: { kind: WallGraphic; color: string };
  /** カーペット */
  carpet: { base: string; motif: string; pattern: CarpetPattern };
  /** 座席 */
  seat: { cushion: string; headrest: string; frame: string };
  /** スピーカー（筐体・バッフル面・ドライバーコーン） */
  speaker: { cabinet: string; baffle: string; driver: string };
}
```

### 3.1 フォーマット別の値

| | `standard` | `imax` | `dolby_cinema` |
|---|---|---|---|
| 参考写真 | ワイドコンフォートシート | TCX（日比谷） | ブラックアウト内装 |
| `wall` | `#23242e` | `#2b2a2e` | `#101013` |
| `ceiling` | `#15161a` | `#1a1b1f` | `#0a0a0c` |
| `screenWall` | `#08070a` | `#08080a` | `#050506` |
| `dado` | `#15161c` | `#16161a` | `#0a0a0c` |
| `rib` | `#4a4036` | `#55555c` | `#17171a` |
| `ribShade` | `#2a241e` | `#303036` | `#0b0b0d` |
| `cove` | `#ffcf9a` | `#ffd8b0` | `#ffd0a8` |
| `wallGraphic` | `dots` / `#8a6a2e` | `swoop` / `#7a2420` | `none` / `#000000` |
| `carpet.base` | `#1b1d2a` | `#2a1420` | `#121214` |
| `carpet.motif` | `#6b5426` | `#5e2630` | `#1d1d20` |
| `carpet.pattern` | `dots` | `swoop` | `diagonal` |
| `seat.cushion` | `#8c5a56` | `#3a3a3e` | `#1f1d20` |
| `seat.headrest` | `#9a6762` | `#46464b` | `#2a272b` |
| `seat.frame` | `#2e2a28` | `#232326` | `#141214` |
| `speaker.cabinet` | `#1a1a1c` | `#17171a` | `#141214` |
| `speaker.baffle` | `#34343a` | `#2e2e34` | `#6b5327`（真鍮） |
| `speaker.driver` | `#0e0e10` | `#0c0c0e` | `#2a2010` |

背もたれ色は既存どおり `cushion * BACK_DARKEN(0.78)` で導出し、テーマには持たせない。

### 3.2 既存APIの互換

`getWallColors(format)` は呼び出し側（`theaterScene.tsx`）1箇所からしか使われていないため、`getInteriorTheme(format): InteriorTheme` に置き換える。未知フォーマット時に `standard` へフォールバックする現行挙動は維持する。

### 3.3 テーマの導出箇所とprop経路

現状 `TheaterScene` は内部で `getWallColors(theater.format)` を呼んでいるが、`SeatMeshes` / `ScreenMesh` / `SpeakerMeshes` は **`TheaterScene` の子として `theaterExperiencePage.tsx` から渡されている**（`theaterExperiencePage.tsx:296-348`）。各コンポーネントが個別にテーマを導出すると単一ソースが崩れるため、以下に改める。

- `theaterExperiencePage` で `const theme = useMemo(() => getInteriorTheme(theater.format), [theater.format])` を1回だけ導出する
- `TheaterScene` / `SeatMeshes` / `ScreenMesh` / `SpeakerMeshes` に `theme: InteriorTheme` を prop として渡す
- `TheaterSceneProps` から内部導出を取り除く（**これが本件唯一のインターフェース変更**）
- `SpeakerMeshes` にはエイミング先として客席重心（§9.2）も渡す

### 3.4 識別性の検証（必須）

`dolby_cinema` は座席 `#1f1d20`、カーペット `#121214` と双方が暗く、俯瞰で座席の輪郭が沈むリスクがある。実装時に以下を確認し、満たさなければ `seat.cushion` を明るい側へ調整する。

- 座席クッション色とカーペット色の相対輝度比が **1.8:1 以上**
- 通常席と車椅子席（`#3b82f6`）、通常席と選択中（`#ffaa00`）がそれぞれ俯瞰スクリーンショットで判別可能

俯瞰のライティング（`directionalLight 1.15`）は据え置くため、輝度比に加えて陰影でも形が立つ。

---

## 4. 手続き的テクスチャ（`utils/theaterTextures.ts` 新規）

### 4.1 生成するテクスチャ

| 用途 | 解像度 | タイリング | 貼る対象 |
|---|---|---|---|
| カーペット | 256×256 | `RepeatWrapping`、**1タイル＝4m** | `FloorMesh` / `SlopedFloorMesh` / `BackStepFill` |
| 壁グラフィック | 512×512 | `ClampToEdgeWrapping`（壁全面に引き伸ばし） | 側壁・後壁の下地 |
| 幕パーフォレーション | 64×64 | `RepeatWrapping`、**1タイル＝0.25m** | `ScreenMesh` 本体 |

### 4.2 API

```ts
/** カーペットテクスチャを生成（フォーマット単位でキャッシュ） */
export function getCarpetTexture(theme: InteriorTheme): Texture;

/** 壁グラフィックテクスチャを生成。kind === 'none' は null を返す */
export function getWallGraphicTexture(theme: InteriorTheme): Texture | null;

/** 幕のパーフォレーションテクスチャを生成（テーマ非依存・シングルトン） */
export function getScreenPerforationTexture(): Texture;
```

### 4.3 実装上の決めごと

- **色空間**: 生成した `CanvasTexture` に `texture.colorSpace = SRGBColorSpace` を設定する。これを省くと three r152 以降で色が明るく転ぶ
- **タイリングのスケール**: `repeat` は貼る面の実寸（m）から算出し、`repeat.set(width / 4, depth / 4)` のように**物理スケールを保つ**。部屋サイズが違っても柄の大きさが変わらないようにする
- **キャッシュ**: モジュールレベルの `Map<string, Texture>` に `${format}:${kind}` をキーとして保持する。上限は 3フォーマット × 3種 = 9枚（合計 1MB 未満）で有界なので、明示的な dispose は行わない。劇場を切り替えても再生成されない
- **SSR**: `document.createElement('canvas')` を呼ぶため、これらの関数は **R3Fコンポーネントの内側（クライアント）からのみ**呼ぶ。`theaterCanvas` は既に `dynamic` で SSR 無効化されているため、追加対応は不要
- **ミップマップ**: 既定の `generateMipmaps: true` を維持する。床を浅い角度で見る一人称視点でのモアレを抑える
- **異方性フィルタ**: 既定値（1）のまま上げない。SwiftShader でのフィルタコストを増やさない

### 4.4 柄の描画内容

- `dots`: `base` で塗りつぶし、`motif` の円を半径・不透明度をずらしながら散らす（参考写真の金のボケ）
- `swoop`: `base` で塗りつぶし、`motif` の太いベジェ曲線を複数本、低不透明度で重ねる（参考写真の赤いスウープ）
- `diagonal`: `base` で塗りつぶし、`motif` の細い斜めストライプを低コントラストで引く
- パーフォレーション: 透明背景に暗点を格子状に打ち、`ScreenMesh` 本体へ乗算合成する

---

## 5. 壁パネル（`component/wallPanels/` 新規）

スクリーン側壁は幕を引き立てるため**素の黒のまま**とし、リブもグラフィックもコーブも入れない。残る3面に以下を重ねる。

### 5.1 構成要素と適用面

| 要素 | 適用面 | ジオメトリ | 実装 |
|---|---|---|---|
| 下地 | 側壁2面＋後壁 | 既存の `WallMesh`（`planeGeometry`） | `map` に壁グラフィックテクスチャを追加（`none` の場合は `map` なし） |
| 幅木 | 側壁2面＋後壁 | 床から 0.6m、厚さ 0.04m の帯 | 面ごとに `boxGeometry` 1枚（計3枚） |
| 縦リブ | **側壁2面のみ** | 幅 0.12m × 奥行 0.06m × 高さ（幅木上端〜コーブ下端） | 2面ぶんを1つの `InstancedMesh` に集約。間隔 0.35m |
| コーブ照明 | 側壁2面＋後壁 | 天井から 0.25m 下、壁から 0.1m 内側、高さ 0.06m の帯 | 面ごとに `boxGeometry` 1枚（計3本） |

### 5.2 リブの本数と配置

リブ本数は壁長から `Math.floor(wallLength / 0.35)` で算出する。側壁の長さは `roomDepth`、後壁は `roomWidth`。後壁は非常口誘導灯（`ExitSigns`）と干渉するため、**後壁にはリブを入れず**、下地グラフィックと幅木のみとする。

最大規模（IMAX、`roomDepth` ≈ 30m）でも側壁2面で約170本。1つの `InstancedMesh` なのでドローコールは1。`castShadow` は付けない。

### 5.3 コーブ照明

既存の通路灯・段差LEDと同じ作法に揃える。

```ts
const COLOR_COVE_HDR = new Color(theme.cove).multiplyScalar(1.8);
// <meshBasicMaterial color={COLOR_COVE_HDR} toneMapped={false} />
```

`TheaterCanvas` の `Bloom luminanceThreshold={0.9}` を超えるよう HDR 化する。点滅させない。

### 5.4 俯瞰での見え方

`planeGeometry` は片面描画のため、俯瞰では手前2面がカリングされ **奥側の壁（左壁・後壁）のみ**が見える。現行のスクリーンショットでも左壁が見えているので、リブとコーブはそこに効く。一人称では両側壁が全面に見えるため、こちらが主戦場になる。

---

## 6. 通路階段（`utils/aisleGeometry.ts` ＋ `component/aisleStairs/` 新規）

本件で最も価値が高く、最もロジックを要する部分。**階段は縦通路（前後方向）にのみ生成する。** 横通路は等高の通り道なので、平らなランディングとして扱う。

### 6.1 通路の導出（DB変更不要）

既存の `computeSeatXSegments`（`utils/theaterGeometry.ts`）が座席x座標から座席ブロックを返すので、**ブロック間の隙間＋両端と壁の間**が縦通路になる。

```ts
/** 通路のx範囲 */
export interface AisleXRange {
  /** 通路中心のx座標 */
  center: number;
  /** 通路の幅 (m) */
  width: number;
}

/**
 * 座席ブロックのxセグメントと部屋幅から、縦通路のx範囲を算出する。
 * ブロック間の隙間に加え、両端のブロックと側壁の間（サイド通路）も含む。
 * 幅が minWidth 未満の隙間は通路とみなさない（座席間の肘掛け幅を拾わないため）。
 */
export function computeAisleXRanges(
  segments: SeatXSegment[],
  roomWidth: number,
  minWidth?: number,
): AisleXRange[];
```

`minWidth` の既定値は **0.7m**（席ピッチ0.6mより広く、実用的な通路幅より狭い）とする。

### 6.2 段の算出

```ts
/** 階段の1段（踏面＋蹴込み） */
export interface AisleStep {
  /** 踏面中心のx */
  centerX: number;
  /** 踏面の幅（通路幅） */
  width: number;
  /** 踏面中心のz */
  centerZ: number;
  /** 踏面の奥行 */
  depth: number;
  /** 踏面上面のY */
  topY: number;
  /** 蹴込みの高さ（前段との差）。0 なら蹴込み・LEDを描かない */
  riseHeight: number;
  /** 蹴込み面のz（踏面の前端＝スクリーン側） */
  riserZ: number;
}

/**
 * 各列のZ/Yと通路x範囲から、縦通路の階段（踏面＋蹴込み）を算出する。
 *
 * 「通常列間隔」は rowZs の隣接差のうち最小の正の値とする（既存の
 * computeSeatXSegments / StepLEDs と同じデータ駆動の考え方）。
 *
 * 列 i の踏面は、その列の床高 rowYs[i] に、rowZs[i] を中心として
 * 通常列間隔ぶんの奥行で生成する。蹴込みは踏面の前端（スクリーン側、
 * z = rowZs[i] + 通常列間隔 / 2）に立ち、高さは rowYs[i] - rowYs[i-1]。
 *
 * 前列とのZ間隔が通常間隔の aisleGapRatio 倍を超える箇所は横通路とみなし、
 * 踏面の奥行を実際のZ間隔まで広げた平らなランディング（riseHeight = 0）
 * として扱う。最前列（i = 0）も前段が無いため riseHeight = 0。
 */
export function computeAisleSteps(
  aisles: AisleXRange[],
  rowZs: number[],
  rowYs: number[],
  aisleGapRatio?: number,
): AisleStep[];
```

横通路の判定基準（`normalGap * 1.5`）は、既存 `StepLEDs` にインラインで埋まっている同じ判定と重複する。**`aisleGeometry.ts` に `isCrossAisleGap()` として切り出し、`StepLEDs` 側もそれを使うようリファクタする**（ボーイスカウト・ルール）。

### 6.3 描画（`aisleStairs`）

| 要素 | インスタンス数 | マテリアル |
|---|---|---|
| 踏面 | 段数 | `meshStandardMaterial` ＋ カーペットテクスチャ |
| 蹴込み | `riseHeight > 0` の段数 | `meshStandardMaterial`（`theme.dado`） |
| 蹴込みLED | 同上 | `meshBasicMaterial` ＋ HDR琥珀 ＋ `toneMapped={false}` |
| 段鼻ライン | 同上 | `meshBasicMaterial` ＋ HDR温白 ＋ `toneMapped={false}` |

いずれも `InstancedMesh`。最大規模でも通路4本 × 20列 = 80インスタンス程度で、ドローコールは4。`castShadow` は付けない。

既存の `SlopedFloorMesh` は通路部分も滑らかに補間しているため、**階段はその上に乗せるだけ**で床側の改修は不要。Z-fighting を避けるため踏面を床から `0.002m` 浮かせる。

### 6.4 既存 `StepLEDs` との関係

`StepLEDs` は**座席ブロック内**の段鼻を照らす光帯、本件の段鼻ラインは**通路**の段鼻。別物であり共存する。両者で色（`COLOR_STEP_LED`）を共有する。

---

## 7. 座席（`component/seatMeshes/` 改修）

### 7.1 シルエット

- 背もたれ `RoundedBoxGeometry` の角丸半径を **0.02 → 0.12** に上げ、上端を丸める
- **ヘッドレスト枕**を新規 `InstancedMesh` で追加。横長のカプセル状（`RoundedBoxGeometry` 幅0.42 × 高さ0.16 × 奥行0.14、角丸0.07）を背もたれ上端に配置。車椅子席は `scale.y = 0` で描かない（既存の背もたれ・台座と同じ作法）
- `castShadow` は付けない

### 7.2 色

ハードコードの `COLOR_SEAT` / `COLOR_FRAME` をテーマ由来に置き換える。`COLOR_SELECTED`（`#ffaa00`）と `COLOR_WHEELCHAIR`（`#3b82f6`）は**機能色なのでテーマ化しない**。

`SeatMeshes` に `theme: InteriorTheme` を prop として渡す。色決定関数（`getSeatColorKey` / `getSeatBackColor`）は現在モジュールレベルの定数テーブルを引いているので、テーマを引数に取る形へ変更する。これらは純粋関数として export 済みでテストもあるため、テストも追随して更新する。

---

## 8. スクリーン（`component/screenMesh/` 改修）

- `BEZEL_THICKNESS` を **0.08 → 0.35** に拡大し、色を `#1a1a2e` → `#060608` に変更。実物の黒マスキングに寄せる
- 幕面のシェーダーマテリアルに、パーフォレーションテクスチャを **乗算** する uniform（`uPerfMap`）を追加。`shaders/screenFragment` に数行追加する
- `theme.screenWall` を全フォーマットで `#08070a` 系の黒に寄せ、幕まわりの迷光を殺す
- 湾曲は入れないため、`projectScreenQuad` / `calcViewingDistortion` および `distortionPreview` は**無改修**

---

## 9. スピーカー（`utils/speakerAiming.ts` 新規 ＋ `component/speakerMeshes/` 改修）

### 9.1 現状の不具合

`speakerMeshes.tsx` は種別ごとに回転を出し分けているが、**視覚的に何も起きていない**。

```ts
const rotation = kind === 'ceiling' ? [Math.PI, 0, 0] : [0, 0, 0];
```

`RoundedBoxGeometry` は対称な箱であり、X軸まわりに180°回しても見た目は変わらない。「天井は下向き、壁/床スピーカーは水平向きで視覚的に区別」というファイル冒頭のコメントは、実装されていない効果を記述している。さらに壁掛けサラウンドは `[0, 0, 0]`＝+Z（スクリーン方向）を向いたままで、客席を向いていない。

根本原因は **「向きを示す面」がジオメトリに無い**こと。箱が「スピーカーに見える」のはバッフル面とドライバーコーンが見えるからであり、それが無い以上、回転させても意味が出ない。したがって **造形（§9.3）とエイミング（§9.2）はセットで入れる必要がある**。

### 9.2 エイミング（`utils/speakerAiming.ts`）

参考写真では、サラウンドも天井chも**客席に向けて内向き・下向きに振られている**。スピーカー位置と客席重心からオイラー角を算出する。

```ts
/** 3D点 */
export interface AimPoint { x: number; y: number; z: number }

/**
 * スピーカーを客席重心へ向けるオイラー角 [pitch, yaw, 0] を算出する。
 *
 * yaw   = Math.atan2(dx, dz)（Y軸まわり。three の既定前方 -Z に合わせる）
 * pitch = -Math.asin(dy / 距離) を maxPitchRad でクランプ
 *
 * 実機のサラウンドは真下を向かず斜め下に留まるため、俯角に上限を設ける。
 * 距離ゼロ（スピーカーと重心が同一点）の場合は [0, 0, 0] を返す。
 */
export function calcSpeakerAim(
  speaker: AimPoint,
  target: AimPoint,
  maxPitchRad?: number,
): [number, number, number];

/**
 * 座席エリアの前後端Zと耳の高さから、エイミング先の客席重心を返す。
 * x は 0（室中心）、y は耳の高さ、z は前後端の中点。
 */
export function calcAudienceCentroid(
  seatAreaFrontZ: number,
  seatAreaBackZ: number,
  earHeightY: number,
): AimPoint;
```

- `maxPitchRad` の既定値は **35°**（実機のサラウンドの俯角の目安）
- 天井chにもこのクランプを適用する。重心の真上にある天井chはほぼ真下を向くが、35°で頭打ちになるため**やや前方を向いた自然な角度**に収まる
- 客席重心は `theaterExperiencePage` が既に保持している `seatAreaFrontZ` / `seatAreaBackZ` から導けるため、**DB変更は不要**。`earHeightY` は既存の `SEATED_EYE_HEIGHT`（1.2m）を流用する

### 9.3 造形

向きが視覚的に意味を持つよう、筐体に方向性のあるパーツを足す。

| パーツ | 対象 | 形状 | 色 |
|---|---|---|---|
| 筐体 | 全可視ch | 既存の `RoundedBoxGeometry`（サイズは `getSpeakerSize` のまま） | `theme.speaker.cabinet` |
| バッフル板 | 全可視ch | 筐体前面に厚さ 0.02m の薄板。筐体より一段明るい | `theme.speaker.baffle` |
| ドライバーコーン | 全可視ch | バッフル中央に薄い円柱（`cylinderGeometry`）。半径は筐体短辺の 0.33 倍 | `theme.speaker.driver` |
| ブラケット | サラウンドのみ | 筐体背面と壁の間を埋める小箱（0.06 × 0.06 × 0.12m） | `theme.speaker.cabinet` |

天井chはブラケットの代わりに、既存どおり天井面に接して配置する（吊り下げロッドは描かない。俯瞰で視認できないわりにジオメトリが増えるため）。

スクリーンch（L/C/R/LFE）は実機でも音響透過スクリーンの裏にあるため、**`isSpeakerVisible` による非表示を維持する**。

### 9.4 ドローコールについて

Atmos 9.1.6 レイアウトでは可視スピーカーは最大12個（16ch − スクリーン4ch）。1個あたり最大4パーツで48ドローコール程度に収まる。**この規模では `InstancedMesh` 化のメリットが測定可能な差にならない**ため、既存の `speakers.map()` による個別メッシュ構造を維持し、可読性を優先する。§2.1 の instancing 原則は、席数（最大544）やリブ本数（最大約170）のように**データ量に比例して増える要素**に適用する。

`castShadow` は既存どおり筐体のみに付け、追加パーツには付けない。

---

## 10. 視点別ライティング（`component/theaterScene/` 改修）

### 10.1 値

`TheaterScene` 内で `isFirstPerson = selectedSeat !== null` を判定し、ライト強度を切り替える。

| ライト | 俯瞰（現状維持） | 一人称 |
|---|---|---|
| `ambientLight` | 0.50 | 0.12 |
| `hemisphereLight` | 0.35 | 0.10 |
| `directionalLight` | 1.15 | 0.25 |
| コーブ HDR 倍率 | 1.8 | 2.6 |
| 通路灯 HDR 倍率 | 2.4 | 3.0 |
| 階段LED HDR 倍率 | 1.6 | 2.2 |

**俯瞰を据え置くのは意図的**である。俯瞰は座席選択UIそのものであり、ここを暗くすると座席の識別性（§2.3）と既存E2Eスクリーンショットの大半が壊れる。

### 10.2 遷移

座席選択時には既に俯瞰→一人称のフライスルー（`FLYTHROUGH_DURATION_S = 0.55s`、`easeOutCubic`）がある。ライト強度もこれと**同じ時間・同じイージングで補間**し、カメラ移動と光量変化を同期させる。`reducedMotion` 時はフライスルー同様に即時切替とする。

実装は `useFrame` 内でライトの `intensity` を書き換える小さなコンポーネント（`AdaptiveLighting`）に切り出す。毎フレームのコストはスカラー代入3回で無視できる。

---

## 11. テスト方針

`.claude/rules/testing.md` に従い、全指標80%以上を維持する。

### 11.1 単体テスト（新規）

| 対象 | 観点 |
|---|---|
| `utils/aisleGeometry.ts` | **最重点**。純ロジックなので手厚く。(1) ブロック間隙間の通路検出 (2) サイド通路の検出 (3) `minWidth` 未満の隙間を通路としない (4) 段の生成数が列数×通路数と一致 (5) 横通路を `riseHeight = 0` のランディングとして扱う (6) 端ケース：座席ゼロ／1列のみ／全列同一Y（平床）／通路ゼロ（全幅1ブロック） |
| `utils/speakerAiming.ts` | 純ロジック。(1) 真横の相手に対し yaw が 90° になる (2) 真上から見下ろす配置で pitch が負（下向き）になる (3) `maxPitchRad` を超える俯角がクランプされる (4) スピーカーと重心が同一点なら `[0, 0, 0]` を返す (5) 左右対称な配置で yaw が符号反転の関係になる (6) `calcAudienceCentroid` が前後端の中点と耳の高さを返す |
| `utils/theaterTextures.ts` | jsdom に canvas 実装が無いため、`HTMLCanvasElement.prototype.getContext` をモックし、(1) 柄種別ごとに異なる描画コマンド列が発行される (2) 同一フォーマットの2回目呼び出しでキャッシュが効き再描画されない (3) `wallGraphic.kind === 'none'` で `null` を返す、を検証する。**`canvas` パッケージは導入しない**（依存最小主義） |

### 11.2 単体テスト（既存の拡張）

| 対象 | 観点 |
|---|---|
| `utils/theaterPalette.test.ts` | 全フォーマットで `InteriorTheme` の全フィールドが揃うこと、未知フォーマットが `standard` にフォールバックすること |
| `utils/theaterGeometry.test.ts` | `isCrossAisleGap()` の切り出しに追随 |
| `seatMeshes` の純粋関数テスト | `getSeatColorKey` / `getSeatBackColor` のテーマ引数化に追随 |

### 11.3 カバレッジ除外

`wallPanels` / `aisleStairs` は R3F メッシュ層であり、jsdom（WebGL非対応）では実行時の振る舞いを検証できない。既存の `seatMeshes` / `theaterScene` 等と同じ扱いとし、`jest.config.js` の `collectCoverageFrom` 除外リストに追加する。振る舞いは E2E でカバーする。

**ロジックは必ず `utils/` 側の純粋関数に置き、メッシュコンポーネントには配置処理だけを残す。** 除外対象に判断ロジックを持ち込まない。

### 11.4 E2E・ビジュアル証跡

- 既存の E2E スクリーンショット4枚（`docs/e2e-screenshots/theater-types-{standard-medium,tcx,imax-gt,dolby-cinema}.png`）を撮り直し、**同名で上書き**する
- `.claude/rules/visual-evidence.md` に従い、各PRに Before/After スクリーンショットと動作動画を添付する。特に **一人称視点**（座席選択後）の Before/After を必ず含める。俯瞰だけでは本件の変化の大半が写らない
- IMAX（最大席数544席）で E2E がタイムアウト・クラッシュしないことを確認する。これは過去に `ContactShadows` の撤去理由となった既知のリスクポイント

---

## 12. PR分割と完了条件

5系統を1PRにまとめると巨大すぎるため分割する。各PRは単体でマージ可能な状態にする。

| # | PR | 内容 | 依存 |
|---|---|---|---|
| 1 | 内装テーマ基盤 | `InteriorTheme` 拡張、`theaterTextures.ts` 新規、カーペットを床・傾斜床・バックステップへ適用 | — |
| 2 | 壁 | `wallPanels`（リブ・コーブ・幅木・グラフィック） | #1 |
| 3 | 通路階段 | `aisleGeometry.ts`、`aisleStairs`、`isCrossAisleGap` の共用化 | #1 |
| 4 | 座席＋スクリーン | ドーム背もたれ、ヘッドレスト、テーマ色化、マスキング拡大、パーフォレーション | #1 |
| 5 | スピーカー | `speakerAiming.ts`、エイミング、バッフル・ドライバー・ブラケット、テーマ色化 | #1 |
| 6 | 視点別ライティング | `AdaptiveLighting`、E2Eスクショ更新 | #2 #3 #4 #5 |

### 完了条件（全PR共通）

- [ ] `npx jest` が全件パスし、カバレッジが全指標80%以上
- [ ] `npm run lint` / 型チェックがパス
- [ ] IMAX（544席）で E2E がタイムアウト・クラッシュしない
- [ ] 俯瞰で通常席・車椅子席・選択中席が判別可能（§3.4 の輝度比を実測）
- [ ] 俯瞰のライティング値が変更されていない（PR #6 を除く）
- [ ] `theater_speakers` の座標データが変更されていない（向き・造形・色のみの変更であること）
- [ ] Before/After スクリーンショット（俯瞰・一人称の両方）と動作動画をPRに添付

---

## 13. 参考資料

- [`theater-experience-design.md`](theater-experience-design.md) — 座標系・DBスキーマ・音響計算の設計（本書はこれを変更しない）
- [`design-system.md`](design-system.md) — カラーパレット・コントラスト要件
- `.claude/rules/visual-evidence.md` — 画面修正PRのビジュアル証跡ルール
- `.claude/rules/testing.md` — テスト作成ルール
