# シアター体験（3D可視化）機能 — 実装計画書

> **設計書**: `.claude/documents/theater-experience-design.md`
> **ロードマップ**: `.claude/documents/roadmap/phase12-future.md`
> **前提**: React 19.2.5 + Next.js 16.2.4 + Zod v4.3.6 確認済み

---

## Issue依存関係

```
Issue 1 (DB) → Issue 2 (API) → Issue 3 (物理+フック)
                                    ├→ Issue 4 (DOM UI)     ※並行可
                                    └→ Issue 5 (3Dシーン)   ※並行可
                                         ↓
                                    Issue 6 (視野+フォールバック統合)
                                         ↓
                                    Issue 7 (ページ統合+a11y)
```

---

## Issue 1: DB基盤

**ブランチ**: `feature/theater-experience-db`
**ラベル**: `P1: important`, `database`, `feature`

### 作業内容

4つのマイグレーションファイルを作成し、型を再生成する。

### 作成ファイル

#### 1. `supabase/migrations/YYYYMMDD000000_add_theaters.sql`

```sql
-- ============================================
-- theaters（劇場）テーブル追加
-- ============================================

-- テーブル作成
CREATE TABLE IF NOT EXISTS theaters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  format VARCHAR(50) NOT NULL,
  room_width NUMERIC(6,2) NOT NULL,
  room_depth NUMERIC(6,2) NOT NULL,
  room_height NUMERIC(6,2) NOT NULL,
  screen_width NUMERIC(6,2) NOT NULL,
  screen_height NUMERIC(6,2) NOT NULL,
  screen_center_x NUMERIC(6,2) NOT NULL,
  screen_center_y NUMERIC(6,2) NOT NULL,
  screen_center_z NUMERIC(6,2) NOT NULL,
  audio_layout VARCHAR(50) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- インデックス
CREATE UNIQUE INDEX idx_theaters_slug ON theaters (slug);

-- RLS（award_movies と同一パターン）
ALTER TABLE theaters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "theaters_select_public" ON theaters
  FOR SELECT USING (deleted_at IS NULL AND is_active = true);

-- updated_at トリガー（既存関数を再利用）
CREATE TRIGGER set_theaters_updated_at
  BEFORE UPDATE ON theaters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**参考**: `supabase/migrations/20260322000000_add_award_movies.sql`

#### 2. `supabase/migrations/YYYYMMDD000001_add_theater_seats.sql`

```sql
-- ============================================
-- theater_seats（劇場座席）テーブル追加
-- ============================================

CREATE TABLE IF NOT EXISTS theater_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theater_id UUID NOT NULL REFERENCES theaters(id) ON DELETE CASCADE,
  row_label VARCHAR(4) NOT NULL,
  seat_number INTEGER NOT NULL,
  position_x NUMERIC(6,2) NOT NULL,
  position_z NUMERIC(6,2) NOT NULL,
  position_y NUMERIC(6,2) NOT NULL,
  seat_type VARCHAR(30) NOT NULL DEFAULT 'standard',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_theater_seats_entry UNIQUE (theater_id, row_label, seat_number)
);

CREATE INDEX idx_theater_seats_theater_id ON theater_seats (theater_id);

ALTER TABLE theater_seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "theater_seats_select_public" ON theater_seats
  FOR SELECT USING (true);
```

> **注**: theater_seats自体にdeleted_at/is_activeは不要。RLSは `USING (true)` だが、`withAuth` 内部の `createServiceRoleClient()` はRLSをバイパスするため、実質的にはAPI Route側のクエリ条件（親theatersの `is_active` / `deleted_at` フィルタ）でアクセス制御を担保する。

#### 3. `supabase/migrations/YYYYMMDD000002_add_theater_speakers.sql`

```sql
-- ============================================
-- theater_speakers（劇場スピーカー）テーブル追加
-- ============================================

CREATE TABLE IF NOT EXISTS theater_speakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theater_id UUID NOT NULL REFERENCES theaters(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL,
  position_x NUMERIC(6,2) NOT NULL,
  position_y NUMERIC(6,2) NOT NULL,
  position_z NUMERIC(6,2) NOT NULL,
  power_watts NUMERIC(6,1) NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_theater_speakers_theater_id ON theater_speakers (theater_id);

ALTER TABLE theater_speakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "theater_speakers_select_public" ON theater_speakers
  FOR SELECT USING (true);
```

> **注**: theater_speakersも同様。RLSは `USING (true)` だが、API Route側で親theatersの `is_active = true AND deleted_at IS NULL` をフィルタする。

#### 4. `supabase/migrations/YYYYMMDD000003_seed_standard_medium_theater.sql`

シードデータ: 劇場1件 + 150席(10列×15) + 16スピーカー(Atmos 9.1.6)

**座席配置ロジック**（設計書 Section 13）:
- 10列: A〜J
- 15席/列: 1〜15
- X座標: `-7m` 〜 `+7m`（1m間隔）
- Z座標: `+5m`（A列=最前列、スクリーンに近い）〜 `-7m`（J列=最後列、スクリーンから遠い）、間隔 `1.33m/列`
- Y座標: `0.0m`（A列）〜 `0.9m`（J列）、段差 `0.1m/列`

> **座標系**: +Z = スクリーン方向（設計書 Section 1）。スクリーン中心 Z=12.5。A列（最前）が最もスクリーンに近い = Z値が大きい。J列（最後）が最もスクリーンから遠い = Z値が小さい。

**スピーカー配置**（設計書 Section 3.1 Atmos 9.1.6）:
| channel | x | y | z | power_watts |
|---------|-----|-----|------|-------------|
| L | -6.0 | 4.0 | 12.0 | 500 |
| R | 6.0 | 4.0 | 12.0 | 500 |
| C | 0.0 | 3.5 | 12.5 | 500 |
| LFE | -2.0 | 0.5 | 12.0 | 800 |
| LSS | -10.0 | 3.0 | 0.0 | 400 |
| RSS | 10.0 | 3.0 | 0.0 | 400 |
| LBS | -8.0 | 3.0 | -7.0 | 400 |
| RBS | 8.0 | 3.0 | -7.0 | 400 |
| LSW | -8.0 | 3.5 | 8.0 | 400 |
| RSW | 8.0 | 3.5 | 8.0 | 400 |
| LTF | -4.0 | 7.5 | 8.0 | 300 |
| RTF | 4.0 | 7.5 | 8.0 | 300 |
| LTM | -4.0 | 7.5 | 0.0 | 300 |
| RTM | 4.0 | 7.5 | 0.0 | 300 |
| LTR | -4.0 | 7.5 | -6.0 | 300 |
| RTR | 4.0 | 7.5 | -6.0 | 300 |

#### 5. 型再生成

```bash
supabase db push
supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
```

### 検証

- `supabase db push` 成功
- `supabase gen types` で型に `theaters` / `theater_seats` / `theater_speakers` が含まれること
- `npx tsc --noEmit` エラーゼロ

---

## Issue 2: API Route + 型定義 + Zodスキーマ + APIクライアント

**ブランチ**: `feature/theater-experience-api`
**ラベル**: `P1: important`, `feature`
**依存**: Issue 1

### 作成ファイル

#### 1. `src/features/theaterExperience/types.ts`

設計書 Section 7 の型定義をそのまま使用。

```typescript
// 設計書 Section 7 参照
// Theater, TheaterSeat, TheaterSpeaker, TheaterDetail,
// FrequencyBand, FieldOfViewMetrics, AudioLayout, SpeakerChannel, TheaterFormat
```

> **注意**: 設計書 Section 7 の `Theater` 型に `description` フィールドが未定義だが、API レスポンス（一覧・詳細共に）では `description` を返す。型定義には `description?: string` を追加すること。

```typescript
export interface Theater {
  // ... 設計書 Section 7 のフィールド ...
  description?: string;  // 追加（APIレスポンスに含まれる）
}
```

**参考**: `src/features/awards/types.ts`

#### 2. `src/schema/theaters.ts` + `src/schema/theaters.test.ts`

```typescript
import { z } from 'zod';

export const theaterSlugSchema = z.string().min(1).max(100).regex(/^[a-z0-9-]+$/);
```

**参考**: `src/schema/awards.ts`（Zod v4 API）

#### 3. `src/app/api/theaters/route.ts` + `route.test.ts`

- GET: 認証チェック（`withAuth` パターン。awardsが認証不要だが、theatersは設計書により認証必須）
- 一覧取得: `id, name, slug, format, audio_layout, description` のみ SELECT
- `Cache-Control: private, max-age=3600`
- エラー: `handleRouteError` 使用

**認証パターン**: favorites API の `withAuth` を参考にする（awardsは認証不要の公開APIのため認証パターンとしては不適）

```typescript
// 正しいインポートパス（src/helpers/routeHandler.ts）
import { withAuth } from '@/helpers/routeHandler';
import type { AuthRouteContext } from '@/helpers/routeHandler';
```

> **重要**: `withAuth` は内部で `createServiceRoleClient()` を使用するため、**RLS をバイパス**する。つまり theaters テーブルの RLS ポリシー（`deleted_at IS NULL AND is_active = true`）は効かない。API Route 側のクエリに `.eq('is_active', true).is('deleted_at', null)` を**必ず明示**すること。

**参考ファイル**:
- `src/helpers/routeHandler.ts`（withAuth 定義。`AuthRouteContext` 型で `session`, `supabase`, `request`, `params` を受け取る）
- `src/app/api/favorites/route.ts`（withAuth使用パターン — 認証必須API）
- `src/helpers/apiHelpers.ts`（notFoundResponse）
- `src/helpers/routeError.ts`（handleRouteError）
- ~~`src/app/api/awards/route.ts`~~（公開APIのため認証パターンとしては参考にしない。レスポンス形式の参考のみ）

#### 4. `src/app/api/theaters/[slug]/route.ts` + `route.test.ts`

- GET: `withAuth` + slug Zodバリデーション
- theater + seats + speakers を結合取得
- NOT_FOUND: `notFoundResponse('指定された劇場が見つかりません')`

```typescript
// Supabaseクエリイメージ（withAuth 経由で service_role クライアントを使用）
// ⚠ service_role は RLS をバイパスするため、WHERE条件で is_active / deleted_at を明示必須
const { data: theater } = await supabase
  .from('theaters')
  .select('id, name, slug, format, room_width, room_depth, room_height, screen_width, screen_height, screen_center_x, screen_center_y, screen_center_z, audio_layout, description')
  .eq('slug', slug)
  .eq('is_active', true)        // ← RLSバイパス対策: 明示的にフィルタ
  .is('deleted_at', null)       // ← RLSバイパス対策: 明示的にフィルタ
  .single();

const { data: seats } = await supabase
  .from('theater_seats')
  .select('id, row_label, seat_number, position_x, position_y, position_z, seat_type')
  .eq('theater_id', theater.id)
  .order('row_label')
  .order('seat_number');

const { data: speakers } = await supabase
  .from('theater_speakers')
  .select('id, channel, position_x, position_y, position_z, power_watts')
  .eq('theater_id', theater.id);
```

> **一覧API (`/api/theaters`) でも同様**: `.eq('is_active', true).is('deleted_at', null)` を付与すること。

**Cache-Control ヘッダー付与**（設計書 Section 6）:
```typescript
return NextResponse.json(
  { success: true, data: { theater: { ...theater, seats, speakers } } },
  { headers: { 'Cache-Control': 'private, max-age=3600' } }
);
```

#### 5. `src/lib/api/theaters/theaters.ts` + `theaters.test.ts`

```typescript
import { axiosInstance } from '@/lib/axios/axios';

export async function getTheaters() { ... }
export async function getTheaterBySlug(slug: string) { ... }
```

**参考**: `src/lib/api/awards/awards.ts`

#### 6. `src/constants/theaters.ts`

```typescript
export const THEATER_MESSAGES = {
  FETCH_ERROR: '劇場データの取得に失敗しました',
  NOT_FOUND: '指定された劇場が見つかりません',
  PAGE_TITLE: 'シアター体験',
  SELECT_SEAT: '座席をクリックして体験を開始',
  // ...
} as const;
```

#### 7. 修正ファイル

| ファイル | 変更 |
|---|---|
| `src/constants/queryKeys.ts` | `theaterKeys` 追加: `all: ['theaters'] as const`, `detail: (slug: string) => ['theaters', slug] as const`（既存パターンに合わせて `as const` 必須） |
| `src/constants/index.ts` | theaters定数のre-export追加 |

### テスト

- API Route: 認証・正常系・DBエラー・バリデーションエラー・404
- スキーマ: 正常値・異常値のバリデーション
- APIクライアント: axiosInstance呼び出しのモック検証

**参考テスト**: `src/app/api/awards/route.test.ts`

### 検証

```bash
npx tsc --noEmit
npm run lint
npx jest --coverage -- src/schema/theaters src/app/api/theaters src/lib/api/theaters
```

---

## Issue 3: 物理計算ユーティリティ + カスタムフック

**ブランチ**: `feature/theater-experience-physics`
**ラベル**: `P1: important`, `feature`
**依存**: Issue 2

### 作成ファイル

#### 1. `src/features/theaterExperience/utils/physics.ts` + `physics.test.ts`

設計書 Section 3.2 の物理モデルをCPU参照実装。

```typescript
/**
 * 大気吸収係数（ISO 9613-1 近似、エンタメ演出値）
 * 単位: 1/m
 */
export const ABSORPTION_COEFFICIENTS = {
  low: 0.0001,   // 80 Hz
  mid: 0.0010,   // 1 kHz
  high: 0.0030,  // 8 kHz
} as const;

/** 音速 m/s */
export const SPEED_OF_SOUND = 343;

/** 周波数帯→周波数(Hz)マッピング */
export const FREQUENCY_MAP = {
  low: 80,
  mid: 1000,
  high: 8000,
} as const;

/**
 * 距離減衰（逆二乗則）
 * A_i(p) = P_i / (4π * d²)
 */
export function calcDistanceAttenuation(powerWatts: number, distance: number): number { ... }

/**
 * 大気吸収減衰
 * α(f, d) = exp(-k(f) * d)
 */
export function calcAtmosphericAbsorption(band: FrequencyBand, distance: number): number { ... }

/**
 * 単一スピーカーの寄与（位相含む）
 * s_i(p, t) = √A_i(p) * α(f, d) * cos(2πft - k*d + φ_i)
 */
export function calcSpeakerContribution(
  powerWatts: number, distance: number, band: FrequencyBand,
  time: number, phaseOffset?: number
): number { ... }

/**
 * 合成強度
 * I(p, t) = Σ_i s_i(p, t)
 */
export function calcTotalIntensity(
  speakers: Array<{ position_x: number; position_y: number; position_z: number; power_watts: number }>,
  point: { x: number; y: number; z: number },
  band: FrequencyBand, time: number
): number { ... }
```

**テスト**: 既知の距離・周波数での期待値検証（スピーカー1本→距離1mで逆二乗則の値を手計算比較）

#### 2. `src/features/theaterExperience/utils/fieldOfView.ts` + `fieldOfView.test.ts`

設計書 Section 4 の視野計算。

```typescript
/**
 * 水平視野角
 * θ_h = 2 * atan((screen_width / 2) / distance)
 */
export function calcHorizontalFov(screenWidth: number, distance: number): number { ... }

/**
 * 垂直視野角
 */
export function calcVerticalFov(screenHeight: number, distance: number): number { ... }

/**
 * 視野占有率（人間の視野で正規化）
 * ratio_h = θ_h / π
 */
export function calcFovRatios(
  screenWidth: number, screenHeight: number, distance: number
): { horizontal_ratio: number; vertical_ratio: number } { ... }

/**
 * 歪みスコア（0〜1、中央=0、端=1）
 * 座席のX座標とスクリーン中心Xの差から算出
 */
export function calcDistortionScore(
  seatX: number, screenCenterX: number, screenWidth: number
): number { ... }

/**
 * スクリーン四隅を座席視点でカメラ投影した2D座標
 * → 台形歪みプレビュー用
 */
export function projectScreenQuad(
  seat: { x: number; y: number; z: number },
  screen: { width: number; height: number; center_x: number; center_y: number; center_z: number }
): [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] { ... }
```

**テスト**: 中央席（歪み≈0）、端席（歪み大）、前方席（占有率大）、後方席（占有率小）

#### 3. カスタムフック群

| ファイル | 内容 |
|---|---|
| `hooks/useTheater.ts` + `.test.ts` | `useQuery` + `theaterKeys.detail(slug)`, staleTime: 24h。将来の複数劇場対応で一覧取得が必要になった場合は `useTheaters()` を追加する（初期は1件固定のため不要） |
| `hooks/useSeatSelection.ts` + `.test.ts` | `useState<TheaterSeat | null>` で選択席管理 |
| `hooks/useFieldOfView.ts` + `.test.ts` | `useMemo` で視野計算（seat + theater → FieldOfViewMetrics） |
| `hooks/useWebGL2Support.ts` + `.test.ts` | `useEffect` + `canvas.getContext('webgl2')` 判定 |

**参考パターン**:
- `src/features/awards/hooks/useAwards.ts`（useQuery + useMemo + useCallback）
- `src/test/queryTestUtils.ts`（createQueryWrapper）

**useTheater例**:
```typescript
export function useTheater(slug: string) {
  return useQuery({
    queryKey: theaterKeys.detail(slug),
    queryFn: () => getTheaterBySlug(slug),
    staleTime: 24 * 60 * 60 * 1000, // 24時間
    enabled: !!slug,
  });
}
```

### 検証

```bash
npx tsc --noEmit
npm run lint
npx jest --coverage -- src/features/theaterExperience/utils src/features/theaterExperience/hooks
```

---

## Issue 4: DOMコンポーネント（Canvas外UI）

**ブランチ**: `feature/theater-experience-dom-components`
**ラベル**: `P1: important`, `feature`, `ui/ux`
**依存**: Issue 3（Issue 5 と並行作業可）

> **並行作業時の注意**: Issue 4 と Issue 5 を並行で進める場合、両方で `package.json` を変更する（Issue 4: toggle-group、Issue 5: three/R3F）。マージ時にコンフリクトが発生するため、後からマージする方で `package.json` / `package-lock.json` の解決が必要。

### パッケージ追加

```bash
npm install @radix-ui/react-toggle-group
```

### 作成ファイル（各 .tsx + .module.scss + .test.tsx）

#### 1. `component/seatA11yList/`

Canvas外のセマンティックDOM座席一覧。スクリーンリーダーの主読み上げ対象。

```tsx
// 座席ボタン例
<button
  type="button"
  aria-label={`${rowLabel}列${seatNumber}番。視野占有率${ratio}%、スクリーンまで${distance}m`}
  aria-pressed={isSelected}
  onClick={handleSelect}
>
  {rowLabel}{seatNumber}
</button>
```

- `<ul>/<li>/<button>` 構造
- props: `seats`, `selectedSeat`, `onSeatSelect`, `theater`（視野計算用）
- 視野占有率は `calcFovRatios` で算出してaria-labelに含める

#### 2. `component/seatInfoPanel/`

選択席の情報表示パネル。

- 視野占有率（水平/垂直）
- スクリーンまでの距離
- 歪みスコア
- 推奨度ラベル（~20%: 遠すぎる / 30-40%: 標準 / 40-60%: 理想 / >60%: 近すぎる）
- `aria-live="polite"` で座席選択時に通知

#### 3. `component/frequencySelector/`

Radix UI ToggleGroup で低音/中音/高音切替。

```tsx
import * as ToggleGroup from '@radix-ui/react-toggle-group';

<ToggleGroup.Root type="single" value={band} onValueChange={onBandChange}>
  <ToggleGroup.Item value="low">低音 (80Hz)</ToggleGroup.Item>
  <ToggleGroup.Item value="mid">中音 (1kHz)</ToggleGroup.Item>
  <ToggleGroup.Item value="high">高音 (8kHz)</ToggleGroup.Item>
</ToggleGroup.Root>
```

#### 4. `component/unsupportedBrowserNotice/`

WebGL2 または モバイル端末で非対応の案内表示。

- `useWebGL2Support` の結果で切替
- UA判定でモバイル検出時も表示

#### 5. `component/theaterSelector/`

Radix UI Select で劇場選択（初期は1件固定だが将来の複数劇場対応の土台）。

### コンポーネント共通ルール

- `React.memo` + `displayName` 必須
- イベントハンドラは `useCallback`
- SCSS Modules使用、HTMLタグ直接指定禁止
- クラス名: `c_seat_a11y_list__item` 等

**参考**: `src/features/awards/awardsPage/awardsPage.tsx`（memo + displayName パターン）

### 検証

```bash
npx tsc --noEmit
npm run lint
npx jest --coverage -- src/features/theaterExperience/component
```

---

## Issue 5: 3Dシーン基盤 + ヒートマップ + 一人称プレビュー

**ブランチ**: `feature/theater-experience-3d-scene`
**ラベル**: `P1: important`, `feature`
**依存**: Issue 3（Issue 4 と並行作業可）

### パッケージ追加

```bash
npm install three @react-three/fiber @react-three/drei
npm install --save-dev @types/three leva
```

> **重要**: インストール前に `npm info @react-three/fiber` で React 19.2.5 との互換性を確認すること。R3F v9 が React 19 対応。

> **leva**: 設計書 Section 5.2 で規定されたデバッグUI。`devDependencies` に追加し、使用箇所は `process.env.NODE_ENV === 'development'` ガードで限定する。本番バンドルには含めない。

### jest.config.js 修正

```javascript
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/src/$1',
  '\\.glsl$': '<rootDir>/src/test/__mocks__/glslMock.js',  // 追加
},
```

### next.config.mjs 修正（GLSLローダー追加）

`.glsl` ファイルを `import` するための webpack 設定を追加する。

```javascript
// next.config.mjs に webpack 設定を追加
const nextConfig = {
  // ... 既存設定 ...
  webpack: (config) => {
    config.module.rules.push({
      test: /\.glsl$/,
      type: 'asset/source',
    });
    return config;
  },
};
```

### GLSLモック作成

```javascript
// src/test/__mocks__/glslMock.js
module.exports = '';
```

### 作成ファイル

#### 1. `component/theaterCanvas/` (tsx, scss, test)

`<Canvas>` ラッパー。`dynamic(() => import(...), { ssr: false })` で読み込み。

```tsx
'use client';

import { Canvas } from '@react-three/fiber';

// dpr制限、performance設定
<Canvas
  dpr={[1, Math.min(window.devicePixelRatio, 2)]}
  performance={{ min: 0.5 }}
  gl={{ antialias: true }}
  aria-hidden="true"
>
  {children}
</Canvas>
```

#### 2. `component/theaterScene/` (tsx, test)

劇場3D配置の親コンポーネント。OrbitControls、ライト配置。

```tsx
<>
  <OrbitControls />
  <ambientLight intensity={0.3} />
  <directionalLight position={[0, 10, 5]} intensity={0.7} />
  <ScreenMesh screen={theater} />
  <SeatMeshes seats={theater.seats} selectedSeat={selectedSeat} onSeatSelect={onSeatSelect} />
  <AudioHeatmapPlane speakers={theater.speakers} band={band} />
</>
```

#### 3. `component/seatMeshes/` (tsx, test)

InstancedMesh で150席を1ドローコール化。クリックで座席選択。

```tsx
// InstancedMeshの各インスタンスにmatrixを設定
// onClick → raycast → instanceId → seats[instanceId] を返す
```

#### 4. `component/screenMesh/` (tsx)

スクリーン矩形メッシュ。`<mesh>` + `<planeGeometry>` + `<meshStandardMaterial>`。

#### 5. `component/audioHeatmapPlane/` (tsx, test)

ShaderMaterial + DataTexture。`useFrame` で `uTime` を毎フレーム更新。

```tsx
// uniform一覧
// uTime: float（経過時間）
// uFrequency: float（80 / 1000 / 8000）
// uAbsorptionCoeff: float（k値）
// uSpeakerData: DataTexture（16×1、RGBA: x, y, z, power）
// uSpeakerCount: int
// uSpeedOfSound: float（343）
```

#### 6. `component/firstPersonPreview/` (tsx, scss, test)

drei `<View>` で一人称カメラ。選択席の位置にカメラを配置し、スクリーン中心を `lookAt`。

#### 7. `hooks/useAudioShader.ts` + test

スピーカー配列 → DataTexture 変換、uniform オブジェクト管理。

```typescript
export function useAudioShader(speakers: TheaterSpeaker[], band: FrequencyBand) {
  const dataTexture = useMemo(() => {
    // speakers → Float32Array → DataTexture(16×1, RGBA)
  }, [speakers]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uFrequency: { value: FREQUENCY_MAP[band] },
    uAbsorptionCoeff: { value: ABSORPTION_COEFFICIENTS[band] },
    uSpeakerData: { value: dataTexture },
    uSpeakerCount: { value: speakers.length },
    uSpeedOfSound: { value: SPEED_OF_SOUND },
  }), [band, dataTexture, speakers.length]);

  return uniforms;
}
```

#### 8. シェーダーファイル

**`shaders/audioHeatmap.vert.glsl`**: パススルー頂点シェーダー

```glsl
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

**`shaders/audioHeatmap.frag.glsl`**: 物理計算フラグメントシェーダー

```glsl
precision highp float;

uniform float uTime;
uniform float uFrequency;
uniform float uAbsorptionCoeff;
uniform sampler2D uSpeakerData;
uniform int uSpeakerCount;
uniform float uSpeedOfSound;

varying vec2 vUv;

// physics.ts と同一の式を GLSL で実装
// calcDistanceAttenuation, calcAtmosphericAbsorption, 位相重ね合わせ
// カラーマッピング: 青(-1) → 白(0) → 赤(+1)
```

> **重要**: `physics.ts` の CPU 参照実装と GLSL で**同一の式**を使用すること。

### テスト方針

- Canvas内の描画はテスト対象外（設計書 Section 11）
- R3F / three をモジュールモックし、フック・ロジック・props受渡しのみテスト
- `useAudioShader`: DataTexture生成のロジック検証
- 3Dコンポーネント: `jest.mock('@react-three/fiber')` でモック化

### 修正ファイル

| ファイル | 変更 |
|---|---|
| `package.json` | `three`, `@react-three/fiber`, `@react-three/drei` 追加、`@types/three`, `leva` を devDependencies に追加 |
| `jest.config.js` | `moduleNameMapper` に `'\\.glsl$'` モック追加 |
| `next.config.mjs` | `webpack` 設定に `.glsl` ローダー（`type: 'asset/source'`）追加 |

### 検証

```bash
npx tsc --noEmit
npm run lint
npm run build  # Three.js dynamic import が正しく分離されること + GLSLインポートが解決されること
npx jest --coverage -- src/features/theaterExperience/component/theaterCanvas src/features/theaterExperience/component/theaterScene src/features/theaterExperience/component/seatMeshes src/features/theaterExperience/component/audioHeatmapPlane src/features/theaterExperience/hooks/useAudioShader
```

---

## Issue 6: 視野パネル + スクリーン歪み + フォールバック統合

**ブランチ**: `feature/theater-experience-fov-fallback`
**ラベル**: `P1: important`, `feature`, `ui/ux`
**依存**: Issue 4 + Issue 5

### 作成ファイル

#### `component/distortionPreview/` (tsx, scss, test)

2D Canvas（HTML Canvas、Three.jsではない）で台形歪みプレビュー。

```tsx
// projectScreenQuad() の結果（4頂点の2D座標）を受け取り
// <canvas> に台形を描画
const ctx = canvasRef.current.getContext('2d');
ctx.beginPath();
ctx.moveTo(quad[0].x, quad[0].y);
ctx.lineTo(quad[1].x, quad[1].y);
ctx.lineTo(quad[2].x, quad[2].y);
ctx.lineTo(quad[3].x, quad[3].y);
ctx.closePath();
ctx.stroke();
```

### 修正ファイル

| ファイル | 変更 |
|---|---|
| `component/seatInfoPanel/seatInfoPanel.tsx` | `<DistortionPreview>` を子コンポーネントとして組込み |

### ロードマップ更新

```markdown
- [x] 視野占有率パネル・スクリーン歪み表示
- [x] WebGL2/モバイル非対応時のフォールバック画面
```

### 検証

```bash
npx tsc --noEmit
npm run lint
npx jest --coverage -- src/features/theaterExperience/component/distortionPreview src/features/theaterExperience/component/seatInfoPanel
```

---

## Issue 7: ページ統合 + ルーティング + 認証ガード + a11y

**ブランチ**: `feature/theater-experience-page-integration`
**ラベル**: `P1: important`, `feature`, `ui/ux`
**依存**: Issue 6

### 作成ファイル

#### 1. `theaterExperiencePage/` (tsx, scss, test)

全コンポーネントを統合するエントリーページ。

```tsx
'use client';

import { memo, useCallback, useState } from 'react';

export const TheaterExperiencePage = memo(function TheaterExperiencePage() {
  const { isSupported } = useWebGL2Support();
  const { data: theater, isLoading, isError } = useTheater('standard-medium');
  const { selectedSeat, selectSeat } = useSeatSelection();
  const [band, setBand] = useState<FrequencyBand>('mid');
  const fovMetrics = useFieldOfView(selectedSeat, theater);

  if (!isSupported) return <UnsupportedBrowserNotice />;
  if (isLoading) return <Loading />;
  if (isError || !theater) return <ErrorMessage />;

  return (
    <div className={styles.c_theater_experience_page}>
      {/* メインビュー + サイドパネル */}
      <div className={styles.c_theater_experience_page__main}>
        <TheaterCanvas>
          <TheaterScene theater={theater} selectedSeat={selectedSeat} onSeatSelect={selectSeat} band={band} />
        </TheaterCanvas>
      </div>
      <aside className={styles.c_theater_experience_page__sidebar}>
        <SeatInfoPanel metrics={fovMetrics} seat={selectedSeat} />
        <FirstPersonPreview seat={selectedSeat} theater={theater} />
      </aside>
      {/* 下部コントロール */}
      <div className={styles.c_theater_experience_page__controls}>
        <FrequencySelector band={band} onBandChange={setBand} />
      </div>
      {/* a11y用DOM座席一覧（視覚的に非表示だがスクリーンリーダーで読める） */}
      <SeatA11yList seats={theater.seats} selectedSeat={selectedSeat} onSeatSelect={selectSeat} theater={theater} />
    </div>
  );
});
TheaterExperiencePage.displayName = 'TheaterExperiencePage';
```

#### 2. ルーティング

| ファイル | 内容 |
|---|---|
| `src/app/theater-experience/page.tsx` | metadata + `<AwardsPageLoader>` パターン準拠 |
| `src/app/theater-experience/loader.tsx` | `'use client'` + `dynamic(() => import(...), { ssr: false })` |
| `src/app/theater-experience/[slug]/page.tsx` | 動的ルート metadata |
| `src/app/theater-experience/[slug]/loader.tsx` | 動的ルート loader |

**loaderパターン参考**: `src/app/awards/loader.tsx`

```tsx
// src/app/theater-experience/loader.tsx
'use client';

import dynamic from 'next/dynamic';

const TheaterExperiencePage = dynamic(
  () =>
    import('@/features/theaterExperience/theaterExperiencePage/theaterExperiencePage').then((m) => ({
      default: m.TheaterExperiencePage,
    })),
  { ssr: false },
);

export function TheaterExperiencePageLoader() {
  return <TheaterExperiencePage />;
}
```

```tsx
// src/app/theater-experience/page.tsx
import type { Metadata } from 'next';
import { TheaterExperiencePageLoader } from './loader';

export const metadata: Metadata = {
  title: 'シアター体験 | Movie App',
  description: '映画館の座席からの見え方と音の聞こえ方を3Dで体験',
};

export default function TheaterExperienceRoute() {
  return <TheaterExperiencePageLoader />;
}
```

### 修正ファイル

| ファイル | 変更 |
|---|---|
| `src/constants/common.ts` | `ROUTES` に `THEATER_EXPERIENCE: '/theater-experience'` 追加 |
| `src/constants/navigation.ts` | `NAV_ITEMS` 末尾に `{ label: 'シアター体験', href: ROUTES.THEATER_EXPERIENCE }` 追加 |
| `src/proxy.ts` | `protectedPaths` に `ROUTES.THEATER_EXPERIENCE` 追加 |

### アクセシビリティ対応

- `prefers-reduced-motion: reduce` → `uTime = 0` 固定（アニメーション停止）
- `prefers-reduced-motion: reduce` → 座席ホバー時のTween遷移を無効化
- `prefers-reduced-motion: reduce` → 「静的数値表」（全座席の代表値テーブル）への切替導線を提供（設計書 Section 10.4）。初期リリースでは簡易的なテキストリンクで対応し、将来拡張で専用UIを検討
- `<Canvas>` を `aria-hidden="true"` でラップ
- `seatA11yList` が主読み上げ対象
- 座席選択時に `seatInfoPanel` へ `aria-live="polite"` で通知
- 周波数切替は Radix ToggleGroup のキーボードサポート（矢印キー移動）

### ロードマップ更新

```markdown
- [x] ページ統合・動的ルート [slug]・ナビゲーション・認証ガード
- [x] アクセシビリティ対応（WCAG 2.1 AA、prefers-reduced-motion）
- [x] テスト（カバレッジ80%維持）
```

### 検証（最終）

```bash
npx tsc --noEmit
npm run lint
npm run build                    # 全体ビルド成功
npx jest --coverage              # 全体カバレッジ80%維持
npm run dev                      # → /theater-experience にアクセス確認
```

手動確認:
- 未ログイン → `/auth/signin` リダイレクト
- ログイン → 3Dシーン表示
- 座席クリック → 席情報パネル更新 + 一人称プレビュー更新
- 周波数切替 → ヒートマップ変化
- `prefers-reduced-motion: reduce` 設定時 → アニメーション停止

---

## セッション運用ガイド

各Issueを別セッションで実行する際のプロンプト例:

### Issue 1
```
シアター体験機能のIssue 1（DB基盤）を実装してください。
実装計画: .claude/documents/theater-experience-implementation-plan.md の Issue 1 セクション
設計書: .claude/documents/theater-experience-design.md
```

### Issue 2
```
シアター体験機能のIssue 2（API Route + 型定義 + Zodスキーマ + APIクライアント）を実装してください。
実装計画: .claude/documents/theater-experience-implementation-plan.md の Issue 2 セクション
設計書: .claude/documents/theater-experience-design.md
Issue 1のDB基盤は完了済みです。
```

### Issue 3〜7 も同様

---

## 注意事項

1. **R3F v9 互換性**: Issue 5 実装開始時に `npm info @react-three/fiber` で React 19.2.5 との互換を確認
2. **GLSLとCPU参照実装の整合性**: `physics.ts` と `audioHeatmap.frag.glsl` で同一式を使用
3. **バンドルサイズ**: Three.js (~600KB gzip) は dynamic import で隔離必須（`npm run build` で確認）
4. **Zod v4**: 現プロジェクトは `zod@4.3.6` — v4 API に準拠（`z.string()` 等は同じだが、`z.infer` の挙動に注意）
5. **withAuth**: `src/helpers/routeHandler.ts` から import する。~~`src/lib/auth/withAuth.ts` は存在しない~~。内部で `createServiceRoleClient()` を使用するため RLS がバイパスされる点に注意
6. **既存パターン準拠**: 各ファイルは必ず既存の同種ファイルのパターンに合わせる（上記の「参考」を参照）
7. **next.config.mjs**: Issue 5 で `.glsl` ファイルの webpack ローダー設定を追加すること
8. **leva デバッグUI**: Issue 5 で `devDependencies` に追加。`process.env.NODE_ENV === 'development'` ガードで本番バンドルから除外
9. **GitHub Issue運用**: 各 Issue を GitHub Issue として作成し、ロードマップに Issue 番号を記載すること（CLAUDE.md のルール準拠）
10. **座標系**: +Z = スクリーン方向。A列（最前）のZ値 > J列（最後）のZ値。シードデータの座標を確認すること
11. **認証とレート制限**: theaters API は認証必須（負荷対策）、GETへのレート制限は初期未適用。将来的に公開APIへ変更する場合はレート制限追加が容易な構造にしておく
