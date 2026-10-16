# シアター体験 内装デザイン刷新 設計書

## 概要

`/theater-experience` の3Dシーンの内装意匠を、実在の映画館（TOHOシネマズ）の内装写真を参考に刷新する。

現状のシーンは「アイソメトリック・ドールハウス（フラットマテリアル＋エッジ強調）」として作られており、壁・床は単色の `planeGeometry` 1枚、座席とスピーカーは箱型、通路には段が無い。これを **フォト寄り** に振り、壁・通路階段・座席・床・スクリーン・スピーカー・ライティングの各系統に手を入れる。

参考にした実物:

- <https://www.tohotheater.jp/service/premium_theater/>（TCX / プレミアムサウンド / プレミアムシート）
- <https://www.tohotheater.jp/theater/081/institution05.html>（TOHOシネマズ日比谷。TCX内観・Dolby Atmosスピーカー・座席）
- <https://www.tohotheater.jp/service/imax/>（IMAXシアター構成図・スピーカー配置）
- <https://www.tohotheater.jp/service/dolby-cinema/>（Dolby Cinema 公式内観。ファセット壁・シアンコーブ・階段手すり）
- <https://www.olinas.jp/theme/olinas/files/shop/411_photo5.jpg>（TOHOシネマズ錦糸町オリナス。標準館の客席全景）

> **注記**: 本書は意匠（見た目）の設計書である。座標系・音響計算の設計は [`theater-experience-design.md`](theater-experience-design.md) を正とし、本書ではそれらを変更しない。
>
> ただし**DBスキーマは2カラム追加した**（`theaters.row_curve_radius` / `theaters.screen_curvature`）。意匠のために座席と幕の形そのものを変えた結果であり、当初の「スキーマは触らない」という前提から外れている。カラム定義は `theater-experience-design.md` 側の `theaters` テーブル定義を正とし、本書では使い方（§6.6 / §8.1）を説明する。
>
> 幕の湾曲は見え方の計算（視野占有率・歪み）にも影響するため、そちらの対応は `theater-experience-design.md` §4.2 に記載した。

---

## 1. スコープ

### 含むもの

| # | 系統 | 内容 |
|---|---|---|
| 1 | 内装テーマ | `WallColors` を `InteriorTheme` に拡張し、フォーマット別の内装アイデンティティを一元管理 |
| 2 | 手続き的テクスチャ | `CanvasTexture` でカーペット柄・壁グラフィック・幕のパーフォレーションを生成 |
| 3 | 壁・天井 | 壁の造作（縦リブ／Dolbyは多面体ファセット）＋天井際のコーブ照明＋幅木（ダド）＋壁グラフィック＋天井ダウンライト |
| 4 | 通路階段 | 縦通路に踏面・蹴込みを生成し、蹴込みに琥珀LED帯・段鼻に明ライン。階段の手すりと横通路の腰壁も追加 |
| 5 | 座席 | 背もたれ上端をドーム状に、ヘッドレスト枕を追加、色をテーマ化 |
| 6 | スクリーン | 黒マスキングの大型化、幕面のパーフォレーション表現、Dolbyの青い発光フレーム |
| 7 | スピーカー | 既存 `direction_*` を描画に反映、バッフル・ドライバー・ブラケットの造形、色のテーマ化 |
| 8 | ライティング | 視点別（俯瞰＝現状維持 / 一人称＝劇場照明） |
| 9 | 付帯設備 | ステージエプロン・後壁の出入口扉・映写窓・誘導灯のピクトグラム・天井リフレクター（§5.6） |
| 10 | 観客モデルと占有率 | 頭＋肩のシルエットを着席させ、客席の入り（空席／半分／満席）を切り替える（§7.3） |

### 含まないもの

- ~~**スクリーンの湾曲**~~ → **実装済み（IMAX のみ）**。当初は「歪み計算も曲面対応に直すまで整合しない」としてスコープ外にしたが、湾曲が必要なのは IMAX の1館だけだったため、`screen_curvature > 0` のときだけ曲面パスに分岐する形で対応した。他3館は従来の平面パスを通るので挙動は変わらない（§8.1）
- ~~**DBスキーマ変更**~~ → **2カラム追加した**。当初は「通路位置は既存の座席座標から導出できるためマイグレーション不要」としていたが、列の弧と幕の湾曲は劇場ごとの設計値であり座標から導出できないため、`theaters` に `row_curve_radius` と `screen_curvature` を追加した（§6.6 / §8.1）。いずれも `DEFAULT 0 = 従来どおり` なので、既存データの挙動は変わらない
- **画像アセットの追加**。`public/` へのテクスチャ画像配置は行わない（理由は §2.2）
- **モバイル対応**。既存どおりデスクトップのみ
- **俯瞰ライティングの変更**（§10 参照）
- **スピーカーの配置座標・向きデータの変更**。DBの `theater_speakers` の `position_*` / `direction_*` は音響計算の入力でもあるため動かさない。本件で変えるのは**造形と色、および既存 `direction_*` を描画に反映すること**のみ（§9）
- ~~**弧状（扇形）の座席列**~~ → **実装済み（全4館）**。当初は「シードデータの作り直しになる」としてスコープ外にしたが、劇場ごとに半径が一定なら既存行の `UPDATE` で済むと分かったため対応した（§6.6）
- **観客による吸音**。観客モデルを描画するようになった（§7.3）が、音響ヒートマップは無人の室内を前提にしたままで、占有率を変えても変化しない。見た目と音響モデルの間の既知の乖離として記録する
- **座席の小物**（カップホルダー・肘掛けのボタン類）。俯瞰のスケールでは視認できず、一人称でも観客モデルに隠れるため見送る
- **幕裏のアコースティックカーテン**。不透明な幕の裏側にあり物理的に見えない

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

- 反復要素（リブ／ファセット・階段の踏面/蹴込み/LED・手すり・天井ダウンライト・ヘッドレスト）は **すべて `InstancedMesh` に集約し、1種類＝1ドローコール** とする
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

/**
 * 壁の造作形式。
 * - rib:   等間隔の縦リブ（ルーバー）。TCX・標準館の意匠
 * - facet: 多面体ファセット（折り紙状の三角面）。Dolby Cinema の意匠
 */
export type WallTreatment = 'rib' | 'facet';

export interface InteriorTheme {
  /** 側壁・後壁の下地色 */
  wall: string;
  /** 天井色 */
  ceiling: string;
  /** スクリーン側壁 */
  screenWall: string;
  /** 幅木（床から 0.6m の帯）の色 */
  dado: string;
  /** 壁の造作形式 */
  wallTreatment: WallTreatment;
  /** 造作（リブ正面 / ファセット明部）の色 */
  relief: string;
  /** 造作（リブ側面 / ファセット暗部）の色 */
  reliefShade: string;
  /** コーブ照明の色（HDR化して Bloom に乗せる） */
  cove: string;
  /** 幕外周の発光フレーム色。null なら描かない（Dolby のみ使用） */
  screenGlow: string | null;
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
| 参考写真 | ワイドコンフォートシート | IMAX公式シアター図 | Dolby Cinema 公式内観 |
| `wallTreatment` | `rib` | `rib` | **`facet`** |
| `wall` | `#23242e` | `#2b2a2e` | `#2a2b2f` |
| `ceiling` | `#15161a` | `#1a1b1f` | `#1e1f22` |
| `screenWall` | `#08070a` | `#08080a` | `#26272b` |
| `dado` | `#15161c` | `#16161a` | `#1a1b1e` |
| `relief` | `#4a4036` | `#55555c` | `#3a3b40` |
| `reliefShade` | `#2a241e` | `#303036` | `#1c1d20` |
| `cove` | `#ffcf9a` | `#ffd8b0` | **`#2a9ff0`（シアン）** |
| `screenGlow` | `null` | `null` | **`#1f7fe0`** |
| `wallGraphic` | `dots` / `#8a6a2e` | `none` / `#000000` | `none` / `#000000` |
| `carpet.base` | `#1b1d2a` | `#2a1420` | `#161719` |
| `carpet.motif` | `#6b5426` | `#5e2630` | `#202126` |
| `carpet.pattern` | `dots` | `swoop` | `diagonal` |
| `seat.cushion` | `#8c5a56` | `#3a3a3e` | `#44454a` |
| `seat.headrest` | `#9a6762` | `#46464b` | `#4e4f55` |
| `seat.frame` | `#2e2a28` | `#232326` | `#1a1b1e` |
| `speaker.cabinet` | `#1a1a1c` | `#17171a` | `#141214` |
| `speaker.baffle` | `#34343a` | `#2e2e34` | `#6b5327`（真鍮） |
| `speaker.driver` | `#0e0e10` | `#0c0c0e` | `#2a2010` |

**`imax` の `wallGraphic` について**: 当初は TCX（日比谷）の赤いスウープを流用していたが、IMAX公式のシアター図では側壁に装飾グラフィックが無い素のグレーであることを確認したため `none` に変更した。IMAX の壁は縦リブとコーブ照明だけで構成する。

**`dolby_cinema` について**: 当初「ブラックアウトの真っ黒な部屋」と推測していたが、公式内観写真では **中濃グレーの多面体ファセット壁＋シアンブルーのコーブ** が実態だった。`screenWall` も黒ではなくファセットのグレーを回り込ませ、幕外周に `screenGlow` の青い発光フレームを置く（§8）。座席も真っ黒ではなく中濃チャコールで、これにより §3.4 の輝度比条件も満たしやすくなる。

背もたれ色は既存どおり `cushion * BACK_DARKEN(0.78)` で導出し、テーマには持たせない。

> **`standard` の配色について（意図の記録）**
> 実在のTOHO標準スクリーン（例: 錦糸町オリナス）は **紫の壁＋緑と山吹の三角形アコースティックパネル＋紫の座席** という、はるかに彩度の高い内装である。本設計の `standard`（濃紺＋金のボケ円）はプレミアムシート館から取った配色であり、標準館の忠実な再現ではない。
>
> これは **3フォーマットを暗色基調で統一し、`imax` / `dolby_cinema` との差を彩度ではなくトーンで出す**ための意図的な選択である。「実物と違う」という理由だけで olinas 寄りに変更しないこと。変更する場合はアートディレクション全体の再判断として扱う。

### 3.2 既存APIの互換

`getWallColors(format)` は呼び出し側（`theaterScene.tsx`）1箇所からしか使われていないため、`getInteriorTheme(format): InteriorTheme` に置き換える。未知フォーマット時に `standard` へフォールバックする現行挙動は維持する。

### 3.3 テーマの導出箇所とprop経路

現状 `TheaterScene` は内部で `getWallColors(theater.format)` を呼んでいるが、`SeatMeshes` / `ScreenMesh` / `SpeakerMeshes` は **`TheaterScene` の子として `theaterExperiencePage.tsx` から渡されている**（`theaterExperiencePage.tsx:296-348`）。各コンポーネントが個別にテーマを導出すると単一ソースが崩れるため、以下に改める。

- `theaterExperiencePage` で `const theme = useMemo(() => getInteriorTheme(theater.format), [theater.format])` を1回だけ導出する
- `TheaterScene` / `SeatMeshes` / `ScreenMesh` / `SpeakerMeshes` に `theme: InteriorTheme` を prop として渡す
- `TheaterSceneProps` から内部導出を取り除く（**これが本件唯一のインターフェース変更**）

### 3.4 識別性の検証（必須）

`dolby_cinema` は内装全体が暗く、俯瞰で座席の輪郭が沈むリスクがある。実装時に以下を確認し、満たさなければ `seat.cushion` を明るい側へ調整する。

- 座席クッション色とカーペット色の相対輝度比が **1.8:1 以上**
  （`#44454a` と `#161719` で約 1.95:1 を見込む。要実測）
- 通常席と車椅子席（`#3b82f6`）、通常席と選択中（`#ffaa00`）がそれぞれ俯瞰スクリーンショットで判別可能
- **シアンのコーブ（`#2a9ff0`）と車椅子席の青（`#3b82f6`）が混同されないこと。** 両者とも青系のため、Dolby で特に注意する。コーブは発光体（`toneMapped=false` ＋ Bloom）で座席は陰影付きの立体なので質感は分かれるが、俯瞰スクリーンショットで実際に確認する

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
| **造作**（リブ or ファセット） | **側壁2面のみ** | `theme.wallTreatment` で切替（§5.2） | 2面ぶんを1つの `InstancedMesh` に集約 |
| コーブ照明 | 側壁2面＋後壁 | 天井から 0.25m 下、壁から 0.1m 内側、高さ 0.06m の帯 | 面ごとに `boxGeometry` 1枚（計3本） |

後壁は非常口誘導灯（`ExitSigns`）と干渉するため、**後壁には造作を入れず**、下地グラフィック・幅木・コーブのみとする。

### 5.2 壁の造作 — 2系統

`theme.wallTreatment` で描き分ける。どちらも **1つの `InstancedMesh`** に集約し、`castShadow` は付けない。色は明部 `theme.relief` / 暗部 `theme.reliefShade`。

#### `rib`（`standard` / `imax`）

幅 0.12m × 奥行 0.06m × 高さ（幅木上端〜コーブ下端）の細い箱を、間隔 0.35m で並べる。本数は `Math.floor(wallLength / 0.35)`。最大規模（`roomDepth` ≈ 30m）でも側壁2面で約170本。

#### `facet`（`dolby_cinema`）

Dolby Cinema の折り紙状の壁を、**壁面から手前に突き出す三角錐（4面の低ポリ）** の反復で表現する。

- 1ユニットは底面 1.6m 角、頂点の突出 0.35m の三角錐を2つ組み合わせた菱形ユニット
- 側壁をユニットサイズでタイル分割し、`InstancedMesh` に配置。各インスタンスの `rotation.z` をインデックスから決定論的に4通り（0 / 90 / 180 / 270°）で振り、**規則的な繰り返しに見えないようにする**
- 法線の向きが面ごとに変わるため、既存の `directionalLight` だけで明暗の三角パターンが出る。テクスチャ不要
- 最大規模で側壁2面あわせて約 2 × (30 / 1.6) × (10 / 1.6) ≈ 230 ユニット。`InstancedMesh` 1つなのでドローコールは1

> `Math.random()` は使わない。部屋サイズが同じなら毎回同じ見た目になる決定論的な配置とし、E2Eスクリーンショットを安定させる。

### 5.3 天井ダウンライト（`component/ceilingLights/` 新規）

参考写真ではどの劇場も、暗い天井に**埋込ダウンライトがグリッド状**に並んでいる。現状の設計では天井が単色のままだったため追加する。

- 天井面から 0.02m 下に、半径 0.09m の薄い円盤（`cylinderGeometry`）をグリッド配置
- 間隔は 2.5m 四方。個数は `Math.floor(roomWidth / 2.5) × Math.floor(roomDepth / 2.5)`（最大規模で約 8 × 12 = 96個）
- `meshBasicMaterial` ＋ HDR化した `theme.cove` ＋ `toneMapped={false}` で Bloom に乗せる
- 1つの `InstancedMesh`。`castShadow` なし、点滅なし

Dolby では `cove` がシアンのため天井のダウンライトもシアンになり、公式写真の青い点光の印象と一致する。

### 5.4 コーブ照明

既存の通路灯・段差LEDと同じ作法に揃える。

```ts
const COLOR_COVE_HDR = new Color(theme.cove).multiplyScalar(1.8);
// <meshBasicMaterial color={COLOR_COVE_HDR} toneMapped={false} />
```

`TheaterCanvas` の `Bloom luminanceThreshold={0.9}` を超えるよう HDR 化する。点滅させない。

### 5.5 俯瞰での見え方

`planeGeometry` は片面描画のため、俯瞰では手前2面がカリングされ **奥側の壁（左壁・後壁）のみ**が見える。現行のスクリーンショットでも左壁が見えているので、造作（リブ／ファセット）とコーブはそこに効く。天井ダウンライトは俯瞰では天井面がカリングされて見えないため、一人称専用の演出になる。一人称では両側壁が全面に見えるため、こちらが主戦場になる。

#### 【重要】壁際の立体は俯瞰で手動カリングする

**カリングされるのは片面の `planeGeometry` だけで、立体（箱・コーン・トーラス等）はされない。** 壁の位置に立体を置くと、俯瞰では手前側の壁の立体が宙に浮いて客席に覆いかぶさる。

この問題は**同じ原因で2回再発させた**（PR #611 の壁パネル、PR #633 の天井リフレクター）。壁際・天井際に立体を追加するときは必ず `isWallHiddenInOverview(x, z)`（`utils/wallGeometry.ts`）で判定し、俯瞰では手前側を描画対象から外すこと。

```ts
// 壁面を描画対象に含めるかの判定（各壁パネル・付帯設備で共通）
faces.filter((f) => isFirstPerson || !isWallHiddenInOverview(f.x, f.z));
```

単体テストでは検出できない（jsdom に WebGL が無く、カメラ位置も関与しないため）。**俯瞰のスクリーンショットで目視確認するまで気付けない種類の不具合**である。

### 5.6 付帯設備

意匠の仕上げとして、参考写真に写っているが未実装だった設備を追加する。いずれも `theaterScene` 内のローカルコンポーネントとして実装する。

| 設備 | 実装 | 根拠・決めごと |
|---|---|---|
| ステージエプロン | `StageApron` | 幕の下に床から立ち上がるステージ。高さは**幕の下端** (`screen_center_y - screen_height/2`) に合わせる。全フォーマットで幕下端は床から1.0m なので、天板がちょうど幕の下端に接する。前縁に `theme.dado` の細い見切りを入れて段差を明示する |
| 出入口の扉 | `BackWallFixtures` | **非常口誘導灯はあるのに扉が無い**という矛盾した状態だったので、誘導灯の真下 (`±roomWidth*0.35`) に開口を置いて整合させた。実機は遮光のため内側にカーテンがあるので、開口の内側に一段明るい面 (`theme.relief`) を重ねて奥行きを示す |
| 映写窓（ポート） | `BackWallFixtures` | IMAX公式の構成図では後方にプロジェクター本体が描かれている。後壁上部に3つ並べる。映写室の光が僅かに漏れる想定で、ごく暗い寒色の `meshBasicMaterial` |
| 誘導灯のピクトグラム | `getExitSignTexture()` | 日本の法定色である緑地 (`#00b06b`) に白の走る人。`CanvasTexture` で生成する |
| 天井リフレクター | `CeilingReflectors` | 側壁際の天井に沿って並ぶ反射板。`TorusGeometry` の部分弧で凹面をつくり、`yaw = side * π/2` で凹面を室内へ向ける。**俯瞰では §5.5 のとおり手前側を手動カリングする** |
| 幕上のインジケータ灯 | `ScreenTopIndicators` | TCX の幕上部を拡大すると、赤いインジケータ付きの小型ユニットが等間隔に並んでいる。**これがスピーカーかは画像から断定できないため音源としては扱わない**。`theater_speakers` に無い音源を描くと見た目と音響計算の二重ソースになるので、設備灯として置くに留める。点滅させない（WCAG 2.3.1） |

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
| **手すり支柱** | 段数 × 通路の手すり本数 | `meshStandardMaterial`（`theme.speaker.cabinet` と同系の暗色金属） |
| **手すり笠木** | 通路の手すり本数 | 同上 |

いずれも `InstancedMesh`。最大規模でも通路4本 × 20列 = 80インスタンス程度で、ドローコールは6。`castShadow` は付けない。

既存の `SlopedFloorMesh` は通路部分も滑らかに補間しているため、**階段はその上に乗せるだけ**で床側の改修は不要。Z-fighting を避けるため踏面を床から `0.002m` 浮かせる。

### 6.4 手すりと横通路の腰壁

参考写真（Dolby Cinema 公式内観、TCX日比谷）で、**階段沿いの金属パイプ手すり**と、**横通路の前縁に立つ腰壁（キャップ付き）** が確認できたため追加する。

#### 手すり

- 各縦通路の**座席ブロック側の縁**に沿って、段の勾配に追従する手すりを立てる
- 支柱: 0.04m 角 × 高さ 0.9m を段ごとに1本
- 笠木: 支柱の上端を結ぶ細い角材（0.05m 角）。段の勾配に合わせて傾ける。通路1本につき1インスタンス（始点と終点から長さ・角度・中点を算出）
- サイド通路（壁側）には手すりを立てない。壁が手すりの役目を果たすため

#### 横通路の腰壁

- 横通路（`riseHeight = 0` のランディング）の**前縁**に、高さ 0.9m の壁を立てる
- 上端に一段明るいキャップ（高さ 0.05m）を乗せる。参考写真の木製キャップレールに相当
- 座席ブロックの幅ぶんだけ立て、通路部分は開口させる（`computeAisleXRanges` の補集合＝`computeSeatXSegments` の各セグメントをそのまま使える）

腰壁は**俯瞰でスタジアム客席の段構成を読み取りやすくする**効果もある。現状は傾斜床がのっぺり繋がっていて段の構造が分かりにくい。

### 6.5 既存 `StepLEDs` との関係

`StepLEDs` は**座席ブロック内**の段鼻を照らす光帯、本件の段鼻ラインは**通路**の段鼻。別物であり共存する。両者で色（`COLOR_STEP_LED`）を共有する。

### 6.6 弧状（扇形）の座席列

参考写真ではどの劇場も列が弧を描いている。列内のどの席も幕から概ね等距離になるようにするためで、本アプリも極座標配置へ移行した。

**DB**: `theaters.row_curve_radius`（0 なら直線列）。マイグレーション `20261016093525_theater_curved_rows.sql`。

列の中央席を現在位置 `(0, z_r)` に据え置き、弧の中心を `(0, z_r + R)` に取る。`position_x` を**弧長方向のオフセット** `s` として解釈すると:

```
θ     = s / R
new_x = R * sin(θ)
new_z = z_r + R * (1 - cos(θ))
```

弧長で等間隔になるため、実機の等間隔配置と一致する。両端ほど `z` が大きくなる＝前方へせり出す。

| 劇場 | R (m) | 端席の前方シフト | 列間隔との比 |
|---|---|---|---|
| standard-medium | 29 | 0.29 m | 0.27 |
| tcx | 35 | 1.02 m | 0.89 |
| imax-gt | 36 | 1.16 m | 1.01 |
| dolby-cinema | 29 | 0.57 m | 0.47 |

半径は室内奥行の約1.4倍を目安にした。これより小さいと弧がきつくなり、端席のせり出しが列間隔を大きく超えてしまう。

**実装上の決めごと**:

- 既存行を `UPDATE` する（`DELETE` + 再 `INSERT` にしない）。`theater_seats.id` を参照するテーブルは無いが、ID を保つ方が安全なため
- 座席の各パーツは `calcSeatYawOnArc()` で弧に沿って首を振らせる。パーツのローカルオフセットも `rotateLocalOffset()` で同じ角に回す（`utils/rowCurve.ts`）
- **通路検出（`computeSeatXSegments`）は影響を受けない。** 劇場ごとに半径が一定なので、`new_x` は全列で同じ値になるため
- `byRow` の列代表席は**最小 |x|（列の中央）**で取る。弧状列では最初に現れた席が端席になりうるため

---

## 7. 座席（`component/seatMeshes/` 改修）

### 7.1 シルエット

- 背もたれ `RoundedBoxGeometry` の角丸半径を **0.02 → 0.12** に上げ、上端を丸める
- **ヘッドレスト枕**を新規 `InstancedMesh` で追加。横長のカプセル状（`RoundedBoxGeometry` 幅0.42 × 高さ0.16 × 奥行0.14、角丸0.07）を背もたれ上端に配置。車椅子席は `scale.y = 0` で描かない（既存の背もたれ・台座と同じ作法）
- `castShadow` は付けない

### 7.2 色

ハードコードの `COLOR_SEAT` / `COLOR_FRAME` をテーマ由来に置き換える。`COLOR_SELECTED`（`#ffaa00`）と `COLOR_WHEELCHAIR`（`#3b82f6`）は**機能色なのでテーマ化しない**。

`SeatMeshes` に `theme: InteriorTheme` を prop として渡す。色決定関数（`getSeatColorKey` / `getSeatBackColor`）は現在モジュールレベルの定数テーブルを引いているので、テーマを引数に取る形へ変更する。これらは純粋関数として export 済みでテストもあるため、テストも追随して更新する。

### 7.3 観客モデルと占有率

実際に人が座っていたらどう見えるかを体感できるようにする。参考写真（客席を後方から撮ったもの）では、観客は**頭と肩のシルエットだけが暗く見える**。顔やディテールは写らないので、造形もそこに絞る。

**造形**（`component/audienceMeshes/`）:

| パーツ | ジオメトリ | 配置 |
|---|---|---|
| 頭 | `sphereGeometry` 半径 0.105 | `HEAD_Y = 1.21` |
| 肩 | `RoundedBox` 0.42 × 0.2 × 0.2 | `SHOULDER_Y = 1.02` |

いずれも `InstancedMesh`。`BODY_Z_OFFSET = -0.1` で座面より僅かに後ろへ寄せ、背もたれに預けた姿勢にする。

**占有の決定**（`utils/occupancy.ts`）:

- `calcSeatOccupancyScore(seatId)` が席IDから `[0,1)` の決定論的スコアを返し、`score < 占有率` の席を埋める。**`Math.random()` は使わない**（§2 の方針。再レンダリングのたびに並びが変わるとE2Eスクリーンショットも安定しない）
- この方式は**単調**である。占有率を上げると席が増えるだけで減らないため、UIの操作が直感どおりに見える
- ハッシュは FNV-1a に **lowbias32 の最終撹拌を掛ける**。FNV-1a だけだと `seat-0`・`seat-1` のような似た短い文字列で分散が偏り、占有席が塊になった（10区間中8区間にしか散らなかった）
- 体格・首の傾きも同じスコアから選ぶ（`calcAudienceVariant`）。全員が同じ大きさだと不自然なため4種を振り分ける
- **選択中の席は常に空ける**（そこに座っているのは利用者自身のため）
- **車椅子席は除外する**。座席メッシュを持たないフラットなスペースなので、人型を置くと宙に浮く

**UI**（`component/occupancySelector/`）: Radix `ToggleGroup` で 空席 (0) / 半分 (0.5) / 満席 (1)。既定は空席。

> **占有率は席の評価指標に影響させない。** 前席遮蔽率は「前席に人が座っている前提」の最悪ケースで算出しており、誰がたまたま座っているかで席の評価が揺れるべきではないため。これは意図的な分離であり、E2Eでも不変条件として検証する。

---

## 8. スクリーン（`component/screenMesh/` 改修）

- `BEZEL_THICKNESS` を **0.08 → 0.35** に拡大し、色を `#1a1a2e` → `#060608` に変更。実物の黒マスキングに寄せる
- 幕面のシェーダーマテリアルに、パーフォレーションテクスチャを **乗算** する uniform（`uPerfMap`）を追加。`shaders/screenFragment` に数行追加する
- `theme.screenWall` は `standard` / `imax` では `#08070a` 系の黒に寄せ、幕まわりの迷光を殺す。**`dolby_cinema` だけは例外**で、公式内観どおりファセット壁のグレー（`#26272b`）を幕まわりにも回り込ませる
- **幕外周の発光フレーム**（`theme.screenGlow`）。`null` でないフォーマットのみ、黒マスキングのさらに外側に幅 0.12m の発光帯を四辺へ置く。`meshBasicMaterial` ＋ HDR化 ＋ `toneMapped={false}` で Bloom に乗せる（Dolby Cinema の青い縁取り）
- Dolby Cinema のみ幕外周に `screenGlow` の青い発光フレームを置く

### 8.1 湾曲（カーブドスクリーン）— IMAX のみ

**どの劇場が湾曲か**は参考資料で裏取りした。

| 劇場 | 湾曲 | 根拠 |
|---|---|---|
| `imax-gt` | **あり**（R = 40m） | IMAX公式のシアター構成図が「IMAXスクリーン＝湾曲」「従来のスクリーン＝平面」として明示的に描き分けている |
| `tcx` | なし | 日比谷の写真では幕の上辺・側辺とも直線 |
| `dolby_cinema` | なし | 公式内観で平面の矩形 |
| `standard` | なし | — |

**形状**: 湾曲は水平方向のみ（円筒の軸は垂直）。実機の幕は客席側へ凹（客席を包む向き）なので、弧の中心を客席側 `(center_x, center_z - R)` に置く。高さ方向は曲げない（実機も縦は直線）。

```
θ = u / R                      (u = 幕中央からの横方向オフセット＝弧長)
x = center_x + R * sin(θ)
z = center_z - R * (1 - cos(θ))
```

**`screen_width` の解釈**: 幕の実寸＝**弧長**として扱う（物理的な幕の寸法表記は布の長さであり弦ではないため）。したがってサジッタ（両端のせり出し）は弦の式 `R - sqrt(R² - (W/2)²)` ではなく `R * (1 - cos((W/2)/R))` で求まり、IMAX（幅25.8m / R 40m）では **約2.06m** になる。スクリーン（z=13）と最前列（z=7.0）の間は6mあるため干渉しない。

**既存計算への影響**: `ScreenGeometry.curvature` を任意プロパティ（既定0）として追加し、`projectScreenQuad` / `calcViewingFovRatios` が湾曲時のみ弧上の端点を使うようにした。`curvature` 省略時・0 のときは従来と**完全に同じ値**を返すため、他3館の歪みプレビューと視野占有率は一切変わらない。

`calcViewingDistortion` は幕**中心**への角度を測る関数であり、中心は湾曲しても動かないため**無改修**。

---

## 9. スピーカー（`utils/speakerAiming.ts` 新規 ＋ `component/speakerMeshes/` 改修）

### 9.1 現状の不具合

`speakerMeshes.tsx` は種別ごとに回転を出し分けているが、**視覚的に何も起きていない**。

```ts
const rotation = kind === 'ceiling' ? [Math.PI, 0, 0] : [0, 0, 0];
```

`RoundedBoxGeometry` は対称な箱であり、X軸まわりに180°回しても見た目は変わらない。「天井は下向き、壁/床スピーカーは水平向きで視覚的に区別」というファイル冒頭のコメントは、実装されていない効果を記述している。さらに壁掛けサラウンドは `[0, 0, 0]`＝+Z（スクリーン方向）を向いたままで、客席を向いていない。

根本原因は **「向きを示す面」がジオメトリに無い**こと。箱が「スピーカーに見える」のはバッフル面とドライバーコーンが見えるからであり、それが無い以上、回転させても意味が出ない。したがって **造形（§9.3）と向きの反映（§9.2）はセットで入れる必要がある**。

### 9.2 向きは既存のDBデータを使う（新規計算はしない）

**`theater_speakers` には向きのデータが既にある。** `20260421000001_add_speaker_directivity.sql` で `direction_x / direction_y / direction_z`（正規化済みの正面方向ベクトル）が追加されており、`TheaterSpeaker` 型にもAPIレスポンスにも含まれ、音響の指向性計算（`directivity_alpha` と併用）で実際に使われている。値も `20260719015039_setup_theater_types.sql` のコメントどおり `normalize(客席中央(0, 1.0, mid_z) - 設置位置)` で全室に追従して算出されている。

つまり **描画層だけがこのデータを無視して固定回転を使っている** のが現状である。

したがって本設計では客席重心を再計算せず、**既存の `direction_*` をオイラー角へ変換するだけ**にする。これにより「見た目の向き」と「音響シミュレーションが仮定している指向性」が必ず一致し、二重のソースが生まれない。

```ts
/**
 * 正規化済みの方向ベクトルを、three のメッシュに適用するオイラー角
 * [pitch, yaw, 0] へ変換する。
 *
 * three の既定前方は -Z。バッフル面を +Z 側に作る前提で
 *   yaw   = Math.atan2(dx, dz)
 *   pitch = -Math.asin(clamp(dy, -1, 1))
 * とする。
 *
 * ゼロベクトル（長さが EPSILON 未満）が渡された場合は [0, 0, 0] を返し、
 * NaN を描画層へ流さない。正規化されていないベクトルは内部で正規化する。
 */
export function directionToEuler(
  dx: number,
  dy: number,
  dz: number,
): [number, number, number];
```

- **俯角のクランプは行わない。** DBの値は音響モデルが使っている実際の指向方向であり、見た目だけ丸めると §9.2 冒頭で解消したはずの二重ソース問題が戻る
- 正規化されていない値が入っていても破綻しないよう、内部で長さを見て正規化する（DBは `real` 型で丸め誤差が乗りうる）
- `AimPoint` / `calcAudienceCentroid` は不要になったので設けない。`SpeakerMeshes` への追加 prop も `theme` だけで済む

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
| `utils/speakerAiming.ts` | 純ロジック。`directionToEuler` について (1) `(0,0,-1)` で `[0, 0, 0]` を返す (2) `(1,0,0)` で yaw が +90° になる (3) `dy < 0`（下向き）で pitch が正、`dy > 0` で負になる (4) ゼロベクトルで `[0, 0, 0]` を返し NaN を出さない (5) 正規化されていないベクトル（長さ2など）でも正規化後と同じ角度を返す (6) `dy` が ±1 を僅かに超える丸め誤差入力でも `Math.asin` が NaN にならない |
| `utils/theaterTextures.ts` | jsdom に canvas 実装が無いため、`HTMLCanvasElement.prototype.getContext` をモックし、(1) 柄種別ごとに異なる描画コマンド列が発行される (2) 同一フォーマットの2回目呼び出しでキャッシュが効き再描画されない (3) `wallGraphic.kind === 'none'` で `null` を返す、を検証する。**`canvas` パッケージは導入しない**（依存最小主義） |
| `utils/wallGeometry.ts` | リブ／ファセットの配置数と座標、`calcFacetRadius`、天井ダウンライト・リフレクターの配置。**`isWallHiddenInOverview` は §5.5 の再発防止として必ず含める** |
| `utils/seatColors.ts` | テーマ引数化後の色解決。機能色（選択中・車椅子席）がテーマで上書きされないこと |
| `utils/adaptiveLighting.ts` | **俯瞰の光量値を定数でロックする**（`OVERVIEW_INTENSITIES` が 0.5 / 0.35 / 1.15 のままであること）。§10 の「俯瞰は現状維持」を回帰から守る唯一の手段 |
| `utils/rowCurve.ts` | `isCurvedLayout`、`calcSeatYawOnArc`（中央席で0、端席で弧に沿う）、`calcArcForwardShift`、`rotateLocalOffset` |
| `utils/screenCurve.ts` | `isCurvedScreen`、`calcScreenArcPoint`（`curvature = 0` で従来と同値）、`calcScreenSagitta`。**`screen_width` は弧長として扱う**ため、IMAX のサジッタは弦の式 (2.14m) ではなく 2.06m になる |
| `utils/occupancy.ts` | (1) 占有率を上げたとき席集合が**単調に増える**こと (2) 選択中の席と車椅子席が除外されること (3) ハッシュが10区間に十分散ること（撹拌の回帰検出） (4) `calcAudienceVariant` が同じIDに同じ体格を返すこと (5) 範囲外の占有率のクランプ |
| `utils/sightline.ts` | (1) `findFrontSeat` が `row_label` でグループ化し平均Zで前後を決めること（**列内でZが変わる弧状列**を含む） (2) 段差が大きいほど遮蔽が小さい (3) 列間隔が狭いほど遮蔽が大きい (4) 結果が常に 0〜1 (5) 最前列・不正配置（幕が後方／前席が後方／幕高0）で 0 |

### 11.2 単体テスト（既存の拡張）

| 対象 | 観点 |
|---|---|
| `utils/theaterPalette.test.ts` | 全フォーマットで `InteriorTheme` の全フィールドが揃うこと、未知フォーマットが `standard` にフォールバックすること。**§3.4 の輝度比（座席とカーペットが 1.8:1 以上）をテストで強制する** |
| `utils/theaterGeometry.test.ts` | `isCrossAisleGap()` の切り出しに追随 |
| `seatMeshes` の純粋関数テスト | `getSeatColorKey` / `getSeatBackColor` のテーマ引数化に追随 |
| `utils/fieldOfView.test.ts` | 湾曲スクリーン（`curvature > 0`）での見込み角、`front_occlusion_ratio` の受け渡し。**`curvature = 0` で従来の期待値が変わらないこと**を併せて検証する |
| `utils/seatRecommendation.test.ts` | 重みが 0.6 / 0.4 の2項から 0.45 / 0.30 / 0.25 の3項へ変わったことに追随。`front_occlusion_ratio` 未指定で従来挙動になること |
| `component/occupancySelector.test.tsx` | 選択肢の描画、`aria-checked` 状態、コールバック、**Radix が選択解除時に渡す空文字を無視すること**、キーボード操作（`ArrowRight` → `Enter`）。`ToggleGroup.Root` のロールは `radiogroup` ではなく `group` である点に注意 |

### 11.3 カバレッジ除外

`wallPanels` / `ceilingLights` / `aisleStairs` / `audienceMeshes` は R3F メッシュ層であり、jsdom（WebGL非対応）では実行時の振る舞いを検証できない。既存の `seatMeshes` / `theaterScene` 等と同じ扱いとし、`jest.config.js` の `collectCoverageFrom` 除外リストに追加する。振る舞いは E2E でカバーする。

**ロジックは必ず `utils/` 側の純粋関数に置き、メッシュコンポーネントには配置処理だけを残す。** 除外対象に判断ロジックを持ち込まない。

> この原則は一度破った。観客の体格選択ロジックを `audienceMeshes` の中に直接書いてしまい、レビューで指摘されて `utils/occupancy.ts` の `calcAudienceVariant()` へ切り出した。**除外対象にロジックを置くとテストから見えなくなる**ため、配置以外の判断が混ざり始めたら `utils/` へ出すこと。

`occupancySelector` は**除外しない**。通常のDOMコンポーネントなので RTL でテストできる。

### 11.4 E2E・ビジュアル証跡

- 既存の E2E スクリーンショット4枚（`docs/e2e-screenshots/theater-types-{standard-medium,tcx,imax-gt,dolby-cinema}.png`）を撮り直し、**同名で上書き**する
- `.claude/rules/visual-evidence.md` に従い、各PRに Before/After スクリーンショットと動作動画を添付する。特に **一人称視点**（座席選択後）の Before/After を必ず含める。俯瞰だけでは本件の変化の大半が写らない
- IMAX（最大席数544席）で E2E がタイムアウト・クラッシュしないことを確認する。これは過去に `ContactShadows` の撤去理由となった既知のリスクポイント

#### スクリーンショットの撮影手順（WebGLが黒く潰れる問題）

`docs/e2e-screenshots/` の撮り直しは、次の3条件を**すべて**満たさないとキャンバスが真っ黒になる。どれか1つでも欠けると、UIだけ写って3Dシーンが黒い画像ができあがる。

| 条件 | 理由 |
|---|---|
| **実機 Chrome**（`channel: 'chrome'`） | Playwright 同梱の Chromium はヘッド付きでもキャンバスを合成できなかった。GPU合成が効く実機 Chrome が必要 |
| **ヘッド付き**（`headless: false`） | ヘッドレスではキャンバスが黒くなる（本件以前からの既知事象。変更を stash して確認済み） |
| **`fullPage` を使わない** | `fullPage: true` は `captureBeyondViewport` で再描画を伴い、`preserveDrawingBuffer: false` のキャンバスが空のまま取り込まれる。ビューポートを `document.documentElement.scrollHeight` まで広げて通常撮影する |

その他の決めごと:

- 認証は Playwright の E2E が生成する `e2e/.auth/storageState.json` を流用する（未生成なら `npx playwright test --project=setup`）
- `nextjs-portal { display: none !important }` を注入して Next.js の開発ツールバッジを隠す
- リサイズ後はキャンバスが再構築されるため、撮影前に数秒待つ
- **A列の開始席番は劇場によって違う**（TCX は4番始まり）。データ取得完了の待機に `A列1番` を使うと TCX で詰まるので `/^A列\d+番/` で待つ
- `npm run dev` を `| head` などのパイプにつながない。`head` が終了した時点で SIGPIPE により dev サーバーが応答しなくなる（この撮影中に実際に踏んだ）

**客席の入りのE2E観点**（`e2e/theaterExperience/`）:

| 観点 | 内容 |
|---|---|
| 正常系 | 既定が空席で、満席・半分へ切り替えられる |
| 状態保持 | 座席を選んで一人称へ遷移しても占有率が保たれる |
| 重複・競合 | 選択中の選択肢を再クリックしても解除されない（Radix の空文字ガード） |
| アクセシビリティ | キーボード（ロービングフォーカス）で切り替えられる |
| 不変条件 | **占有率を変えても前席遮蔽率が変わらない**（§7.3 の意図的な分離を回帰から守る） |

> 占有率の効果そのもの（人が描かれること）は3Dキャンバス内なので DOM からは検証できない。見た目は上記スクリーンショットで担保する。

---

## 12. PR分割と完了条件

5系統を1PRにまとめると巨大すぎるため分割する。各PRは単体でマージ可能な状態にする。

### 実績

当初は6PRの計画だったが、実装中に見つけた不具合の修正と、スコープ外にしていた項目の追加で最終的に13PRになった。

| PR | 内容 | 区分 |
|---|---|---|
| [#609](https://github.com/Fn-front/movie-app/pull/609) | 内装テーマ基盤＋カーペットの手続き的テクスチャ | 計画どおり |
| [#611](https://github.com/Fn-front/movie-app/pull/611) | 壁の造作・コーブ照明・幅木・天井ダウンライト | 計画どおり |
| [#615](https://github.com/Fn-front/movie-app/pull/615) | 縦通路の階段化・手すり・横通路の腰壁 | 計画どおり |
| [#617](https://github.com/Fn-front/movie-app/pull/617) | 座席のシルエット刷新・幕の黒マスキング／発光フレーム | 計画どおり |
| [#619](https://github.com/Fn-front/movie-app/pull/619) | **修正**: スピーカーの向きが描画に反映されていなかった | 既存不具合 |
| [#621](https://github.com/Fn-front/movie-app/pull/621) | 視点別ライティング＋E2Eスクショ更新 | 計画どおり |
| [#625](https://github.com/Fn-front/movie-app/pull/625) | 意匠の細部4件（楔形スピーカー・幕上インジケータ・壁の光・列記号プレート） | 追加 |
| [#626](https://github.com/Fn-front/movie-app/pull/626) | 座席列の弧状化（当初スコープ外） | 追加 |
| [#627](https://github.com/Fn-front/movie-app/pull/627) | **修正**: 音響ヒートマップが床の下に埋まり高さも固定だった | 既存不具合 |
| [#629](https://github.com/Fn-front/movie-app/pull/629) | IMAX のカーブドスクリーン（当初スコープ外） | 追加 |
| [#631](https://github.com/Fn-front/movie-app/pull/631) | **修正**: 通路の手すりが客席エリアを貫く長い棒になっていた | 本件で作り込んだ不具合 |
| [#633](https://github.com/Fn-front/movie-app/pull/633) | 付帯設備5件（§5.6） | 追加 |
| [#636](https://github.com/Fn-front/movie-app/pull/636) | 観客モデルと占有率、前席視線遮蔽の指標化 | 追加 |

> **スピーカーのPRは独立していない。** 計画では #5 として独立PRだったが、実際には造形追加と不具合修正が不可分だったため #619 に統合した。

### 振り返り

- **不具合は4件とも、テストではなくスクリーンショットで見つかった。** いずれも単体テストは通っており、実機を描画するまで気付けなかった。§5.5 と §11.4 に撮影手順を残したのはこのため
- **スコープ見積もりを2回外した。** 弧状列（#626）と湾曲スクリーン（#629）はどちらも「全面的な作り直しが要る」と過大に見積もってスコープ外にしていたが、実際は条件分岐で済んだ。「既存の計算を全部直す必要がある」と感じたら、**本当に全劇場に影響するのかを先に確認する**

### 完了条件（全PR共通）

- [x] `npx jest` が全件パスし、カバレッジが全指標80%以上
- [x] `npm run lint` / 型チェックがパス
- [x] IMAX（544席）で E2E がタイムアウト・クラッシュしない
- [x] 俯瞰で通常席・車椅子席・選択中席が判別可能（§3.4 の輝度比を実測）
- [x] 俯瞰のライティング値が変更されていない（#621 を除く）
- [x] `theater_speakers` の座標データが変更されていない（向き・造形・色のみの変更であること）
- [x] Before/After スクリーンショット（俯瞰・一人称の両方）と動作動画をPRに添付

**壁際・天井際に立体を追加するPRでは、上記に加えて以下を必ず確認する**（§5.5）:

- [x] 俯瞰のスクリーンショットで、手前側の立体が客席に覆いかぶさっていないこと

---

## 13. 参考資料

- [`theater-experience-design.md`](theater-experience-design.md) — 座標系・DBスキーマ・音響計算・見え方の計算（A〜D）の設計
- [`design-system.md`](design-system.md) — カラーパレット・コントラスト要件
- `.claude/rules/visual-evidence.md` — 画面修正PRのビジュアル証跡ルール
- `.claude/rules/testing.md` — テスト作成ルール

### 本件で追加したマイグレーション

- `supabase/migrations/20261016093525_theater_curved_rows.sql` — `row_curve_radius` の追加と座席位置の極座標化（§6.6）
- `supabase/migrations/20261016111646_theater_screen_curvature.sql` — `screen_curvature` の追加（§8.1）
