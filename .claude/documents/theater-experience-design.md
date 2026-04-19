# シアター体験（3D可視化）機能 設計書

## 概要

映画館の座席に座ったときの「見え方（スクリーンの視野・歪み・一人称プレビュー）」と「音の聞こえ方（Dolby Atmos スピーカー配置による音響シミュレーション）」を、Three.js を用いて3Dで可視化するエンタメ機能。

ユーザーは劇場を選び、座席をクリックすると、その席の視聴体験が視覚的・聴覚的に体感できる。

> **注記**: 実装時に `database-schema.md` と `api-specification.md` も合わせて更新すること。初期リリースは劇場データ1パターン（汎用中規模シアター or 実在館1件）でスタートし、段階的に拡張する。

---

## 1. スコープ

### 対象
- **用途**: エンタメ用途（席選びの参考ではなく、体験の可視化）
- **アクセス制御**: ログインユーザー限定（負荷対策。未認証トラフィックを認証ゲートで抑制）
- **対応端末**: デスクトップブラウザのみ（Chromium / Safari / Firefox 最新版）。モバイル・タブレットは非対応
- **初期リリース**: 劇場1パターン + Dolby Atmos 9.1.6 レイアウト

### 含むもの
- 見え方: 視野占有率（A）+ スクリーン歪み（B）+ 一人称プレビュー（C）
- 音響: 床面ヒートマップ + 時間アニメーション波紋 + 周波数帯切替UI
- 座席クリック選択
- 劇場データのDB管理
- 将来の複数劇場対応を見越した動的ルート `/theater-experience/[slug]`

### 含まないもの（将来拡張）
- 前席による視線遮蔽（Dの視野遮蔽）
- 壁の反射・吸音の精密再現
- 複数劇場の実データ網羅（IMAX別仕様等）
- VR/AR（WebXR）対応
- モバイル端末の3Dレンダリング対応（非対応画面へ誘導）

### 座標系ポリシー（全テーブル・全計算で共通）

- **原点**: 客席フロアの中心点（XZ平面）かつ床面の高さ（Y=0）
- **軸方向**: +X = 客席から見て右、+Y = 上、+Z = スクリーン側（後方から前方へ）
- **単位**: メートル（m）
- DBカラムはすべてこの原点基準の絶対座標を格納

---

## 2. データベース設計

劇場データ・座席レイアウト・スピーカー配置を DB 管理する。実在劇場データを追加するときに便利な構造を採用。

### `theaters` テーブル

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | 主キー |
| name | VARCHAR(255) | NOT NULL | 劇場名（例: 「TOHOシネマズ六本木 スクリーン7」） |
| slug | VARCHAR(100) | NOT NULL, UNIQUE | URL用識別子（例: `toho-roppongi-s7`） |
| format | VARCHAR(50) | NOT NULL | 劇場形式（`standard` / `imax` / `dolby_cinema` など） |
| room_width | NUMERIC(6,2) | NOT NULL | 室内幅（m） |
| room_depth | NUMERIC(6,2) | NOT NULL | 室内奥行き（m） |
| room_height | NUMERIC(6,2) | NOT NULL | 天井高（m） |
| screen_width | NUMERIC(6,2) | NOT NULL | スクリーン幅（m） |
| screen_height | NUMERIC(6,2) | NOT NULL | スクリーン高（m） |
| screen_center_x | NUMERIC(6,2) | NOT NULL | スクリーン中心X座標（m） |
| screen_center_y | NUMERIC(6,2) | NOT NULL | スクリーン中心Y座標（床からの高さ, m） |
| screen_center_z | NUMERIC(6,2) | NOT NULL | スクリーン中心Z座標（奥行き, m） |
| audio_layout | VARCHAR(50) | NOT NULL | 音響レイアウト（例: `atmos_9_1_6`） |
| description | TEXT | | 補足説明 |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | 公開フラグ |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT now() | トリガーで自動更新 |
| deleted_at | TIMESTAMP | | 論理削除 |

### `theater_seats` テーブル

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| theater_id | UUID | NOT NULL, FK → theaters(id) ON DELETE CASCADE | |
| row_label | VARCHAR(4) | NOT NULL | 列ラベル（例: `A` / `B` / `C`） |
| seat_number | INTEGER | NOT NULL | 列内の席番号 |
| position_x | NUMERIC(6,2) | NOT NULL | 床座標X（m、スクリーン中心基準） |
| position_z | NUMERIC(6,2) | NOT NULL | 床座標Z（m、スクリーンから後方） |
| position_y | NUMERIC(6,2) | NOT NULL | 床高さY（m、段差考慮） |
| seat_type | VARCHAR(30) | NOT NULL, DEFAULT `standard` | 席種（`standard` / `premium` / `wheelchair`） |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |

**インデックス**: `UNIQUE (theater_id, row_label, seat_number)` / `idx_theater_seats_theater_id (theater_id)`

### `theater_speakers` テーブル

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| theater_id | UUID | NOT NULL, FK → theaters(id) ON DELETE CASCADE | |
| channel | VARCHAR(20) | NOT NULL | チャンネル識別（`L` / `R` / `C` / `LFE` / `LSS` / `RSS` / `LBS` / `RBS` / `LSW` / `RSW` / `LTF` / `RTF` / `LTM` / `RTM` / `LTR` / `RTR`） |
| position_x | NUMERIC(6,2) | NOT NULL | 位置X（m） |
| position_y | NUMERIC(6,2) | NOT NULL | 位置Y（m、高さ） |
| position_z | NUMERIC(6,2) | NOT NULL | 位置Z（m） |
| power_watts | NUMERIC(6,1) | NOT NULL, DEFAULT 500 | 音源出力（ワット、相対値計算用） |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |

**インデックス**: `idx_theater_speakers_theater_id (theater_id)`

> **注記**: 初期版は全スピーカーを等方点音源として扱うため、向きベクトルカラム（`direction_x/y/z`）は設けない。将来指向性モデル（Atmosトップ・サラウンドの配向）を導入する際に NOT NULL DEFAULT 付きで追加する。

### RLS ポリシー

既存の公開マスタテーブル（`award_movies` 等）のパターンに統一する。認証必須制御は API Route 側の `withAuth` で担保し、RLS は読み取り全許可・書き込みは service_role のみとする。

```sql
-- 例: theaters
ALTER TABLE theaters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "theaters_select_public" ON theaters
  FOR SELECT USING (deleted_at IS NULL AND is_active = true);

-- INSERT/UPDATE/DELETE は service_role のみ（ポリシー未定義で拒否）
```

`theater_seats` / `theater_speakers` も同一パターン。INSERT/UPDATE/DELETE はマイグレーション・seedスクリプト経由（service_role）のみ。

### トリガー

`theaters` に `update_updated_at_column()` トリガーを適用。

---

## 3. 音響・物理計算ロジック

### 3.1 Dolby Atmos 9.1.6 レイアウト（初期採用）

| チャンネル | 配置 | 本数 |
|---|---|---|
| L / R | 前方左右（スクリーン両脇） | 2 |
| C | センター（スクリーン中央下） | 1 |
| LFE | サブウーファー（前方下） | 1 |
| LSS / RSS | サイドサラウンド（側面中央） | 2 |
| LBS / RBS | バックサラウンド（後方） | 2 |
| LSW / RSW | ワイド（前方サイド） | 2 |
| LTF / RTF | トップフロント（天井前方） | 2 |
| LTM / RTM | トップミドル（天井中央） | 2 |
| LTR / RTR | トップリア（天井後方） | 2 |

合計: 16本（`9.1.6` = 9ベッド + 1LFE + 6オーバーヘッド）

### 3.2 物理モデル

各スピーカー `i` から床面グリッド点 `p` への寄与を計算し、合成強度を色にマッピング。

**距離減衰（逆二乗則）**:
```
A_i(p) = P_i / (4π * d_i(p)²)
```
- `P_i`: スピーカー出力（ワット）
- `d_i(p)`: スピーカー `i` とグリッド点 `p` のユークリッド距離

**周波数ごとの大気吸収減衰**（ISO 9613-1 近似に基づくエンタメ演出値、室温20℃・湿度50%想定）:
```
α(f, d) = exp(-k(f) * d)
```
- `k(低音 80Hz)` ≈ 0.0001 / m
- `k(中音 1kHz)` ≈ 0.0010 / m
- `k(高音 8kHz)` ≈ 0.0030 / m

> **注記**: 数値は ISO 9613-1 の近似に準拠。50mの室内でも減衰は軽微だが、ユーザーがヒートマップの差を知覚できる範囲でエンタメ演出値として調整する余地あり。`utils/physics.ts` で定数として保持し調整可能にする。

**位相と波の重ね合わせ**:
```
s_i(p, t) = √A_i(p) * α(f, d_i(p)) * cos(2π f t - k * d_i(p) + φ_i)
```
- `k = 2π f / c`（波数、`c` ≒ 343 m/s）
- `φ_i`: 位相オフセット（初期0、将来デモ用に可変）

**合成強度（グリッド点 `p` の色）**:
```
I(p, t) = Σ_i s_i(p, t)
```
正規化後 `[-1, 1]` を色にマッピング（青: -1, 白: 0, 赤: +1）。

### 3.3 周波数帯切替UI

| ラベル | 周波数 | 用途 |
|---|---|---|
| 低音 | 80 Hz | サブウーファー・体感音 |
| 中音 | 1 kHz | セリフ帯域 |
| 高音 | 8 kHz | SE・高域成分 |

ユーザー操作で `f` を切り替え、シェーダーの uniform に渡す。

### 3.4 計算の実行場所

- **GPU（GLSLフラグメントシェーダー）**: 床面グリッドの `I(p, t)` 計算
- **CPU（JS）**: スピーカー座標は初期化時に1回だけ uniform／Data Texture に書き込み、毎フレーム更新するのは `uTime` のみ
- **精度**: `precision highp float;` を強制。WebGL2 前提（`mediump` では距離二乗で誤差が顕著）
- **データ渡し**: スピーカー数が16を超える将来拡張を見越して、**16×N Data Texture 方式**で座標・出力を渡す（iOS Safariのuniform配列上限回避）
- **WebGL2 非対応ブラウザ**: 初期ロード時に `gl.getParameter` で判定し、3D表示を中止 → 静的な「ご利用環境のご案内」ページにフォールバック

**理由**: スピーカー数 × ピクセル数 の計算量をGPU並列化しないと60fpsを維持できない。

### 3.5 モアレ対策

1 kHz 帯で波長 λ ≒ 0.34m。グリッド解像度128×128（客席領域 ~20m幅 → セル ~0.15m）だとナイキスト限界ぎりぎりでモアレが出る可能性あり。

対応:
- **中音以上のモード**: グリッド解像度を自動で `256×128` に拡張
- **高音モード**: 波の干渉表示ではなく「振幅のみ（位相成分なし）」表示に切替（演出優先）
- シェーダー内で `frequency` uniform を見て切り替える

---

## 4. 見え方の計算

選択座席 `seat` とスクリーン矩形から以下を算出。

### 4.1 視野占有率（A）

水平視野占有率:
```
θ_h = 2 * atan((screen_width / 2) / distance_to_screen)
ratio_h = θ_h / π  // 人間の水平視野約180度で正規化
```

垂直視野占有率も同様。推奨値表示:
- `~20%`: 遠すぎる
- `30〜40%`: 標準
- `40〜60%`: 理想（IMAX推奨）
- `>60%`: 近すぎる（首振り過多）

### 4.2 スクリーン歪み（B）

スクリーン四隅の座標から、座席視点での4頂点の視線角度を計算。両端席ほど台形歪みが大きくなる。

3D空間上のスクリーン矩形を、座席視点のカメラに投影した**台形形状**として2Dプレビュー表示（ミニマップ風）。

### 4.3 一人称プレビュー（C）

Three.js の `PerspectiveCamera` を選択座席位置に配置し、スクリーン中心を `lookAt` させる。

- FOV: `2 * atan((screen_height / 2) / distance) * (180 / π)` から算出
- 劇場モデル内にカメラを移動させ、実際の見え方を再現
- 別パネル（画面右）に一人称ビューを常時表示

---

## 5. 技術選定

### 5.1 レンダリング: `@react-three/fiber` + `@react-three/drei`

- **理由**: Next.js 16 との親和性が高く、Three.js を React コンポーネントとして宣言的に記述可能。`useFrame` フックでアニメーションループを React 外に切り出せる。
- **バージョン方針**:
  - 現状 `react@18.3.1` のため、**R3F は v8 系を採用**（`@react-three/fiber@^8` / `@react-three/drei@^9.88` 付近の React 18 対応版）
  - React 19 へのアップグレード完了後（Issue #340）、R3F v9 系へ移行する
- **SSR対策**: `Canvas` は `'use client'` + `next/dynamic(ssr: false)` でラップし、ハイドレーションエラーを回避
- **一人称プレビュー**: drei の `<View>` を使用し、メインビューと同一シーンをポート分けでレンダリング（別Canvasを立てず1シーン運用）

### 5.2 追加依存

```json
{
  "three": "^0.160.0",
  "@react-three/fiber": "^8.17.0",
  "@react-three/drei": "^9.88.0"
}
```

開発専用:
```json
{
  "devDependencies": {
    "leva": "^0.9.0"
  }
}
```

- `leva` はデバッグUI用。本番バンドルに含めないため `devDependencies` に置き、使用箇所は `process.env.NODE_ENV === 'development'` ガードで限定
- バージョンは実装時の最新安定版に合わせて確定する
- React 19 移行後に `package.json` を v9 系へ上書き更新（Issue #340 完了後）

### 5.3 ディレクトリ構成

既存 `src/features/favorites/` の末端フォルダ化パターンに揃える。各コンポーネントは `.tsx` + `.module.scss` + `.test.tsx` を同居させる。

```
src/features/theaterExperience/
├── component/
│   ├── theaterCanvas/
│   │   ├── theaterCanvas.tsx            # <Canvas> ラッパー（dynamic import）
│   │   ├── theaterCanvas.module.scss
│   │   └── theaterCanvas.test.tsx
│   ├── theaterScene/
│   │   ├── theaterScene.tsx             # 劇場・座席・スピーカーの3D配置
│   │   └── theaterScene.test.tsx
│   ├── audioHeatmapPlane/
│   │   ├── audioHeatmapPlane.tsx        # 床面ヒートマップ（ShaderMaterial）
│   │   └── audioHeatmapPlane.test.tsx
│   ├── seatMeshes/
│   │   ├── seatMeshes.tsx               # クリック可能な座席群（InstancedMesh）
│   │   └── seatMeshes.test.tsx
│   ├── seatA11yList/                    # Canvas外のアクセシビリティ用DOM座席一覧
│   │   ├── seatA11yList.tsx
│   │   ├── seatA11yList.module.scss
│   │   └── seatA11yList.test.tsx
│   ├── screenMesh/
│   │   └── screenMesh.tsx
│   ├── firstPersonPreview/              # drei <View> を使った一人称プレビュー
│   │   ├── firstPersonPreview.tsx
│   │   ├── firstPersonPreview.module.scss
│   │   └── firstPersonPreview.test.tsx
│   ├── frequencySelector/
│   │   ├── frequencySelector.tsx        # 低/中/高 切替
│   │   ├── frequencySelector.module.scss
│   │   └── frequencySelector.test.tsx
│   ├── seatInfoPanel/
│   │   ├── seatInfoPanel.tsx            # 選択席の視野占有率・歪み表示
│   │   ├── seatInfoPanel.module.scss
│   │   └── seatInfoPanel.test.tsx
│   ├── theaterSelector/
│   │   ├── theaterSelector.tsx          # 劇場選択（将来用、初期は1件固定）
│   │   ├── theaterSelector.module.scss
│   │   └── theaterSelector.test.tsx
│   └── unsupportedBrowserNotice/        # WebGL2非対応端末向けフォールバック
│       ├── unsupportedBrowserNotice.tsx
│       └── unsupportedBrowserNotice.module.scss
├── hooks/
│   ├── useTheater.ts                    # 劇場データ取得（TanStack Query）
│   ├── useTheater.test.ts
│   ├── useSeatSelection.ts              # 選択席の状態管理
│   ├── useSeatSelection.test.ts
│   ├── useAudioShader.ts                # シェーダーuniform管理
│   ├── useAudioShader.test.ts
│   ├── useFieldOfView.ts                # 視野占有率計算
│   ├── useFieldOfView.test.ts
│   ├── useWebGL2Support.ts              # WebGL2サポート判定
│   └── useWebGL2Support.test.ts
├── shaders/
│   ├── audioHeatmap.vert.glsl           # バーテックスシェーダー
│   └── audioHeatmap.frag.glsl           # フラグメントシェーダー（物理計算）
├── utils/
│   ├── physics.ts                       # 距離減衰・位相計算（CPU参照実装）
│   ├── physics.test.ts
│   ├── fieldOfView.ts                   # 視野・歪み計算
│   └── fieldOfView.test.ts
├── types.ts
└── theaterExperiencePage/
    ├── theaterExperiencePage.tsx        # エントリーページ
    ├── theaterExperiencePage.module.scss
    └── theaterExperiencePage.test.tsx
```

### 5.4 コーディング規約の遵守（CLAUDE.md準拠）

- 全クライアントコンポーネントに **`React.memo` + `displayName`** を適用
- 全イベントハンドラを **`useCallback`** でメモ化
- 計算コストの高い値（視野占有率算出・シェーダーuniform配列生成）は **`useMemo`** でキャッシュ
- SCSS Modules 使用、HTML要素直接指定禁止（`c_theater_canvas__stage` 等の独自クラス名）
- 型プロパティは API/DBレスポンスと同じ **snake_case**（既存 `Favorite` 型に準拠）。UI計算結果のローカル専用型のみ camelCase を許容

---

## 6. API 設計

既存の `favorites` / `awards` API と同じパターン（`withAuth` / `parseAndValidate` / 統一レスポンス形式）で実装する。レスポンスエラーコードは `api-specification.md` の `ERROR_CODE` 定義に従う。

### 共通方針

- **認証**: 全エンドポイント `withAuth` で必須
- **レート制限**: GETは原則未適用（既存 `award_movies` / `recommendations` GET と同じ運用）。劇場データは変更頻度が低くクライアント側 TanStack Query で `staleTime: 24時間` キャッシュ
- **キャッシュヘッダ**: Route Handler で `Cache-Control: private, max-age=3600` を付与（セッション分離のため `private`）
- **エラーコード**: 未認証 `UNAUTHORIZED` / 不正クエリ `VALIDATION_ERROR` / 劇場未存在 `NOT_FOUND` / サーバエラー `INTERNAL_ERROR`

### `GET /api/theaters` — 劇場一覧

**認証**: 必須

**成功レスポンス**:
```json
{
  "success": true,
  "data": {
    "theaters": [
      {
        "id": "uuid",
        "name": "汎用中規模シアター",
        "slug": "standard-medium",
        "format": "standard",
        "audio_layout": "atmos_9_1_6",
        "description": "Dolby Atmos 9.1.6 標準配置のサンプル劇場"
      }
    ]
  }
}
```

### `GET /api/theaters/[slug]` — 劇場詳細（座席・スピーカー含む）

**認証**: 必須

**パスパラメータ**: `slug`（zod で `z.string().min(1).max(100).regex(/^[a-z0-9-]+$/)` バリデーション）

**成功レスポンス**:
```json
{
  "success": true,
  "data": {
    "theater": {
      "id": "uuid",
      "name": "汎用中規模シアター",
      "slug": "standard-medium",
      "format": "standard",
      "room_width": 20.0,
      "room_depth": 25.0,
      "room_height": 8.0,
      "screen_width": 14.0,
      "screen_height": 6.0,
      "screen_center_x": 0,
      "screen_center_y": 4.0,
      "screen_center_z": 12.5,
      "audio_layout": "atmos_9_1_6",
      "seats": [
        { "id": "uuid", "row_label": "A", "seat_number": 1, "position_x": -6, "position_y": 0.4, "position_z": 5, "seat_type": "standard" }
      ],
      "speakers": [
        { "id": "uuid", "channel": "L", "position_x": -7, "position_y": 4, "position_z": 12.0, "power_watts": 500 }
      ]
    }
  }
}
```

**エラーレスポンス**（`slug` が存在しない or 非アクティブ）:
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "指定された劇場が見つかりません"
  }
}
```

### `select` の明示（既存セキュリティ方針に準拠）

既存の「`select('*')` 禁止・必要カラムのみ取得」方針（PR #321/#335/#337）に従い、劇場/座席/スピーカーいずれも必要カラムを列挙する。

```sql
SELECT t.id, t.name, t.slug, t.format, t.audio_layout,
       t.room_width, t.room_depth, t.room_height,
       t.screen_width, t.screen_height,
       t.screen_center_x, t.screen_center_y, t.screen_center_z,
       t.description
FROM theaters t
WHERE t.slug = :slug AND t.is_active = true AND t.deleted_at IS NULL;
```

---

## 7. 型定義

```typescript
// src/features/theaterExperience/types.ts

export type AudioLayout = 'atmos_9_1_6';

export type SpeakerChannel =
  | 'L' | 'R' | 'C' | 'LFE'
  | 'LSS' | 'RSS' | 'LBS' | 'RBS'
  | 'LSW' | 'RSW'
  | 'LTF' | 'RTF' | 'LTM' | 'RTM' | 'LTR' | 'RTR';

export type TheaterFormat = 'standard' | 'imax' | 'dolby_cinema';

export interface Theater {
  id: string;
  name: string;
  slug: string;
  format: TheaterFormat;
  room_width: number;
  room_depth: number;
  room_height: number;
  screen_width: number;
  screen_height: number;
  screen_center_x: number;
  screen_center_y: number;
  screen_center_z: number;
  audio_layout: AudioLayout;
}

export interface TheaterSeat {
  id: string;
  row_label: string;
  seat_number: number;
  position_x: number;
  position_y: number;
  position_z: number;
  seat_type: 'standard' | 'premium' | 'wheelchair';
}

export interface TheaterSpeaker {
  id: string;
  channel: SpeakerChannel;
  position_x: number;
  position_y: number;
  position_z: number;
  power_watts: number;
}

export interface TheaterDetail extends Theater {
  seats: TheaterSeat[];
  speakers: TheaterSpeaker[];
}

export type FrequencyBand = 'low' | 'mid' | 'high';

export interface FieldOfViewMetrics {
  horizontal_ratio: number;    // 0〜1
  vertical_ratio: number;      // 0〜1
  distance_to_screen: number;  // m
  distortion_score: number;    // 0〜1（両端席ほど高い）
}
```

---

## 8. ページ・UI 設計

### 8.1 ページ構成

- **ルート**:
  - `/theater-experience` — デフォルト劇場（`slug=standard-medium`）を表示
  - `/theater-experience/[slug]` — 指定された劇場を表示（将来の複数劇場対応）
- **認証**: ログイン必須（未ログインは `/auth/signin` へリダイレクト）
- **レイアウト**:
  ```
  +---------------------------+------------------+
  |                           |  席情報パネル    |
  |    3Dメインビュー         |  ・視野占有率    |
  |    （劇場全体）           |  ・距離          |
  |                           |  ・歪みスコア    |
  |                           +------------------+
  |                           |  一人称プレビュー|
  |                           |  （選択席視点）  |
  +---------------------------+------------------+
  |  周波数切替  [低音][中音][高音]              |
  |  座席選択ヒント / 操作ガイド                 |
  +---------------------------------------------+
  ```

### 8.2 主要インタラクション

1. 初回アクセス: デフォルト劇場を取得 → 3Dシーン描画
2. 座席ホバー: 座席がハイライト
3. 座席クリック: 選択状態に → 席情報パネル更新 → 一人称プレビュー更新
4. 周波数切替: ヒートマップの色分布が切り替わる
5. カメラ操作: `OrbitControls` でドラッグ回転・ズーム

### 8.3 ルート・ナビゲーション更新

- `src/constants/common.ts` の `ROUTES` に `THEATER_EXPERIENCE: '/theater-experience'` を追加
- `src/constants/navigation.ts` の `NAV_ITEMS` 配列**末尾**に `{ label: 'シアター体験', href: ROUTES.THEATER_EXPERIENCE }` を追加
- `src/middleware.ts` の `protectedPaths` 配列に **`ROUTES.THEATER_EXPERIENCE`** を追加（既存の `.startsWith()` 判定により `/theater-experience/[slug]` も含めて保護される）

---

## 9. パフォーマンス戦略

### 9.1 計算負荷の分散

- **床面ヒートマップ**: GPU（フラグメントシェーダー）で計算
- **グリッド解像度**: 初期 `128 × 128`（メッシュ1枚）、端末性能に応じて `64 × 64` にフォールバック
- **スピーカー数**: 最大16本を uniform 配列で一括渡し

### 9.2 レンダリング最適化

- `useFrame` 内で `ref.current.material.uniforms.uTime.value = clock.elapsedTime` のみ更新（再レンダリング回避）
- 座席メッシュは `InstancedMesh` で1ドローコール化
- `Suspense` + `useLoader` で3Dアセットの遅延ロード
- `Canvas` は `dynamic(() => import(...), { ssr: false })` でクライアント限定ロード

### 9.3 端末性能対応

```typescript
const dpr = Math.min(window.devicePixelRatio, 2);
// <Canvas dpr={[1, dpr]} performance={{ min: 0.5 }}>
```

低性能端末では自動的にピクセル比を落とす。

### 9.4 初期ロード削減

- Three.js / R3F は `/theater-experience` 配下でのみロード（動的 import）
- 他ページのバンドルサイズに影響しない構成

---

## 10. アクセシビリティ（WCAG 2.1 Level AA 準拠）

3D表現が中心のため、Canvas 外に**セマンティックDOMのUI**を並行配置して支援技術のアクセス経路を確保する。

### 10.1 セマンティックDOM座席一覧

Canvas 内の `InstancedMesh` 座席は DOM 要素を持たないため、**`seatA11yList` コンポーネント**で `<ul>` / `<li>` / `<button>` として座席を並行描画する。このリストがスクリーンリーダーの主読み上げ対象となり、Canvas は `aria-hidden="true"` で補助表示扱いにする。

```tsx
<button
  type="button"
  aria-label={`${row}列${num}番。視野占有率${ratio}%、スクリーンまで${distance}m`}
  aria-pressed={isSelected}
  onClick={handleSelect}
>
```

### 10.2 キーボード操作

- Tabで `seatA11yList` 内の座席ボタンへフォーカス
- Enter / Space で選択
- 選択座席は Canvas 側もハイライト（3D Outlineまたは発光マテリアル）
- 周波数切替は Radix UI の `ToggleGroup` 等を使い、矢印キー移動に対応

### 10.3 色コントラスト（ヒートマップ）

青→赤のヒートマップは Level AA（テキスト対背景 4.5:1）を単独で満たしにくいため以下で補完:

- **数値パネル併記**: 選択席の音圧レベル・視野占有率を必ずテキスト表示
- **凡例**: カラーバーに数値目盛（dB 相対値）を付与、目盛テキストは背景とのコントラスト比4.5:1以上を確保
- **パターン補助**: 色強度に応じて等高線（contour line）をシェーダーで重ねる、または明度差を強調（青=暗→赤=明）して色相に依存しない知覚を可能にする

### 10.4 `prefers-reduced-motion`

ONの場合:
- 波のアニメーション停止（`uTime` を固定値に）
- 時刻固定のスナップショット（t=0での振幅分布）を表示
- 座席ホバー時のTween遷移を無効化
- 音響の時間変化に依存しない「静的数値表」（全座席の代表値テーブル）への切替導線を提供

---

## 11. テスト戦略

### 単体テスト（Jest）
- `utils/physics.ts`: 距離減衰・位相計算・大気吸収係数適用の**参照実装**として数値検証
- `utils/fieldOfView.ts`: 視野占有率の計算結果を端・中央・後方で検証
- `hooks/useSeatSelection.ts`: 座席選択状態の遷移
- `hooks/useWebGL2Support.ts`: WebGL2判定の成否
- API Route: 劇場取得・認証エラー・404 / zodバリデーションエラー

### コンポーネントテスト（React Testing Library）
- `frequencySelector`: 切替イベントの発火
- `seatInfoPanel`: 選択席データの表示
- `seatA11yList`: 座席ボタンのaria属性・Enter/Space操作
- `unsupportedBrowserNotice`: WebGL2非対応時の表示
- 3Dコンポーネント本体（Canvas内）は描画テスト対象外。`@react-three/test-renderer` 未採用とし、mockで `useFrame` 等をスタブ化して**ロジック側のみ**テストする
- GLSLシェーダーはJestで実行不可。`physics.ts` の CPU 参照実装と GLSL で**式が乖離しないよう**、シェーダー変更時は CPU 実装との「特定座標での色値比較」スナップショットテストを1〜2ケース追加する

### E2E（将来的に対象範囲なら追加）
- ログイン → シアター体験ページ遷移 → 座席クリック → パネル更新の動線

### カバレッジ
- プロジェクト基準通り全指標80%以上（3Dレンダリング部分を除く）
- 各クライアントコンポーネントは `React.memo` / `displayName` / `useCallback` 適用を前提としたスナップショット/イベントテストを作成

---

## 12. 不確実性と対応方針

| 課題 | 初期対応 | 将来 |
|---|---|---|
| 壁の反射・吸音 | 再現しない（直接音のみ） | レイトレース風のレイマーチング追加検討 |
| IMAX等の実スピーカー配置が非公開 | Atmos公式レイアウト準拠 | 公開情報をもとに実在館データを段階追加 |
| スピーカー数 × ピクセル数 の計算量 | GPU計算 + 128×128（中音以上は256×128）+ 最大16本で60fps目標 | WebGPU移行検討 |
| モバイル端末対応 | **非対応**（UserAgent検出で `unsupportedBrowserNotice` へ誘導） | 2D簡易版ページを別途設計 |
| WebGL2非対応ブラウザ | `useWebGL2Support` で判定し `unsupportedBrowserNotice` を表示 | WebGPUフォールバック検討 |
| ブラウザ互換性 | Chromium / Safari / Firefox の最新版（デスクトップのみ） | 非対応時は静的な説明ページを表示 |
| 物理モデルの精度 | エンタメ演出寄りの近似値。ISO 9613-1 の係数を参考値として採用 | より厳密な音響シミュレーションライブラリ検討 |
| CPU実装とGLSL実装の乖離 | `physics.ts` を参照実装とし、GLSL は同じ式を移植 | シェーダー変更時はスナップショットテストで差分を検出 |

---

## 13. 初期シード劇場データ

マイグレーションで「汎用中規模シアター」1件を投入する。

- 劇場サイズ: 20m × 25m × 8m
- スクリーン: 14m × 6m（床から1m、中央奥壁）
- 座席: 10列 × 15席 = 150席（段差0.1m/列）
- スピーカー: Dolby Atmos 9.1.6（16本）

実在劇場データは後続Issueで追加。

---

## 14. 実装ステップ（推奨順序）

> **前提**: Issue #340（React 19 + Next.js 16 アップグレード）完了後に着手。R3F v9 採用可否はこのアップグレード結果で確定。

1. マイグレーション（theaters / theater_seats / theater_speakers + シードデータ1件）
2. API Route（`/api/theaters`, `/api/theaters/[slug]`）+ zodスキーマ + ユニットテスト
3. 物理計算ユーティリティ（`physics.ts` / `fieldOfView.ts`）+ テスト
4. カスタムフック（`useTheater`, `useSeatSelection`, `useAudioShader`, `useWebGL2Support`）+ テスト
5. `seatA11yList`（アクセシビリティ用DOM座席一覧）+ テスト
6. 3Dシーン基盤（`theaterCanvas`, `theaterScene`, `screenMesh`, `seatMeshes`）
7. 床面ヒートマップ（`audioHeatmapPlane` + フラグメントシェーダー）
8. 一人称プレビュー（`firstPersonPreview`、drei `<View>` 採用）
9. 操作UI（`frequencySelector`, `seatInfoPanel`, `theaterSelector`）
10. `unsupportedBrowserNotice`（WebGL2/モバイル非対応時）
11. ページ統合（`theaterExperiencePage`）・動的ルート `[slug]` 対応・ナビゲーション追加・認証ガード（`middleware.ts` 更新）
12. アクセシビリティ対応（`prefers-reduced-motion`、コントラスト調整、キーボード操作）
13. E2E・スナップショットテスト整備・カバレッジ80%確認
14. React 19 移行後（Issue #340 完了）に R3F v9 系へバージョンアップ + 動作確認
