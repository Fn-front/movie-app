# コンポーネント一覧

## 技術スタック

**UIライブラリ**: Radix UI（ヘッドレスUI）
- 各コンポーネントはRadix UIのプリミティブを拡張してカスタマイズ
- SCSS Modulesでスタイリング
- アクセシビリティ標準準拠（WAI-ARIA）
- TypeScript完全対応

**フォームバリデーション**: react-hook-form + zod
- フォームコンポーネントはreact-hook-formと統合
- zodでバリデーションスキーマ定義

---

## コンポーネント分類

### Common（共通コンポーネント）
汎用的で再利用可能なUIコンポーネント

### Features（機能別コンポーネント）
特定の機能に特化したコンポーネント

### Layouts（レイアウトコンポーネント）
ページ構造を決定するコンポーネント

---

## Common Components

**実装方針:**
- Radix UIプリミティブをベースに、SCSS Modulesでカスタムスタイリング
- 各コンポーネントはプロジェクト固有のデザインシステムに準拠

### Button
ボタンコンポーネント

**Props:**
- `variant`: 'primary' | 'secondary' | 'outline' | 'ghost'
- `size`: 'sm' | 'md' | 'lg'
- `disabled`: boolean
- `loading`: boolean
- `onClick`: () => void
- `children`: ReactNode

**使用例:**
```tsx
<Button variant="primary" size="md" onClick={handleClick}>
  クリック
</Button>
```

---

### Input
テキスト入力フィールド

**Props:**
- `type`: 'text' | 'email' | 'password' | 'number'
- `placeholder`: string
- `value`: string
- `onChange`: (value: string) => void
- `error`: string | undefined
- `disabled`: boolean
- `required`: boolean

**使用例:**
```tsx
<Input
  type="email"
  placeholder="メールアドレス"
  value={email}
  onChange={setEmail}
  error={emailError}
/>
```

---

### Select
セレクトボックス

**ベース**: `@radix-ui/react-select`

**Props:**
- `value`: string
- `onChange`: (value: string) => void
- `options`: Array<{ value: string; label: string }>
- `placeholder`: string
- `disabled`: boolean

**使用例:**
```tsx
<Select
  value={selectedSort}
  onChange={setSortBy}
  options={[
    { value: 'release_date', label: '公開日順' },
    { value: 'popularity', label: '人気順' },
    { value: 'vote_average', label: '評価順' }
  ]}
  placeholder="並び替え"
/>
```

---

### Card
カードコンテナ

**Props:**
- `children`: ReactNode
- `hover`: boolean - ホバー効果の有無
- `onClick`: () => void
- `className`: string

**使用例:**
```tsx
<Card hover onClick={handleCardClick}>
  <CardContent />
</Card>
```

---

### Modal / Dialog
モーダルダイアログ

**ベース**: `@radix-ui/react-dialog`

**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `title`: string
- `children`: ReactNode
- `size`: 'sm' | 'md' | 'lg' | 'xl'

**機能:**
- ESCキーで閉じる（Radix UI標準）
- オーバーレイクリックで閉じる
- フォーカストラップ（モーダル内でフォーカス固定）
- スクロールロック

**使用例:**
```tsx
<Modal
  isOpen={isOpen}
  onClose={handleClose}
  title="映画詳細"
  size="lg"
>
  <MovieDetail movieId={selectedMovieId} />
</Modal>
```

---

### Toast
トースト通知コンポーネント

**ベース**: `@radix-ui/react-toast`

**Props:**
- `message`: string
- `type`: 'error' | 'warning' | 'info' | 'success'
- `duration`: number（デフォルト: 5000ms）
- `onClose`: () => void

**表示内容:**
- メッセージテキスト
- タイプに応じた色分け
  - error: 赤
  - warning: 黄
  - info: 青
  - success: 緑
- 自動消滅（5秒）

**機能:**
- スワイプで閉じる（Radix UI標準）
- アニメーション（スライドイン/アウト）
- 複数同時表示対応（スタック表示）
- スクリーンリーダー対応

**使用例:**
```tsx
<Toast
  message="メールアドレスの形式が不正です"
  type="error"
  duration={5000}
  onClose={handleCloseToast}
/>
```

**グローバル使用:**
```tsx
// Context経由でグローバル管理
const { showToast } = useToast();

showToast({
  message: 'ログインに成功しました',
  type: 'success'
});
```

---

### Loading
ローディングインジケーター

**Props:**
- `size`: 'sm' | 'md' | 'lg'
- `fullScreen`: boolean
- `message`: string (optional) - ローディング中のメッセージ

**表示内容:**
- ローディングサークル（スピナー）
- オプションでメッセージ表示

**fullScreen時の動作:**
- 全画面オーバーレイで背景を暗くする
- 画面操作を完全にブロック（z-index最大値）
- 中央にローディングサークル表示
- 認証処理・API呼び出し中に使用

**使用例:**
```tsx
// 全画面ローディング（認証処理中など）
<Loading size="lg" fullScreen message="ログイン中..." />

// インラインローディング（コンポーネント内）
<Loading size="md" />
```

---

### Avatar
ユーザーアバター

**Props:**
- `src`: string
- `alt`: string
- `size`: 'sm' | 'md' | 'lg'
- `fallback`: string - 画像がない場合の表示文字

**使用例:**
```tsx
<Avatar
  src={user.avatar_url}
  alt={user.name}
  size="md"
  fallback={user.name.charAt(0)}
/>
```

---

## Feature Components

### MovieTile
映画サムネイルタイル（ホーム画面用）

**Props:**
- `movie`: Movie
- `onWatchlistAdd`: (movieId: number) => void
- `onClick`: (movieId: number) => void
- `isInWatchlist`: boolean

**表示内容:**
- ポスター画像
- タイトル
- 公開日
- 「見たい」ボタン

**使用例:**
```tsx
<MovieTile
  movie={movie}
  onWatchlistAdd={handleAddToWatchlist}
  onClick={handleShowDetail}
  isInWatchlist={watchlist.includes(movie.id)}
/>
```

---

### MovieDetail
映画詳細モーダル内容

**Props:**
- `movieId`: number

**表示内容:**
- 背景画像
- ポスター画像
- タイトル（日本語・原題）
- 概要
- 公開日
- 上映時間
- ジャンル
- 評価
- 「見たい」ボタン

**使用例:**
```tsx
<MovieDetail movieId={selectedMovieId} />
```

---

### WatchlistItem
見たい映画リストアイテム

**Props:**
- `movie`: Movie
- `addedAt`: string
- `onRemove`: (movieId: number) => void
- `onClick`: (movieId: number) => void

**表示内容:**
- 小さいポスター画像
- タイトル
- 追加日
- 削除ボタン

**使用例:**
```tsx
<WatchlistItem
  movie={movie}
  addedAt={watchlistItem.added_at}
  onRemove={handleRemove}
  onClick={handleShowDetail}
/>
```

---

### Calendar
カレンダーコンポーネント

**Props:**
- `watchlist`: WatchlistItem[]
- `onMovieClick`: (movieId: number) => void

**表示内容:**
- 月間カレンダー
- 公開日にマッピングされた映画
- 月切り替えボタン

**使用例:**
```tsx
<Calendar
  watchlist={watchlist}
  onMovieClick={handleMovieClick}
/>
```

---

### SettingsPage
設定画面統合コンポーネント

**表示セクション:**
- プロフィール（DisplayNameForm）
- 通知設定（NotificationSettings）
- 外観/テーマ（ThemeSettings）

**使用例:**
```tsx
<SettingsPage />
```

---

### DisplayNameForm
表示名変更フォーム（react-hook-form + zod）

**使用例:**
```tsx
<DisplayNameForm />
```

---

### NotificationSettings
通知設定ON/OFF切り替え（オプティミスティックUI）

**使用例:**
```tsx
<NotificationSettings />
```

---

### ThemeSettings
テーマ切り替え（light/dark）

**使用例:**
```tsx
<ThemeSettings />
```

---

### SearchBar
検索バー

**Props:**
- `onSearch`: (query: string) => void
- `placeholder`: string

**使用例:**
```tsx
<SearchBar
  onSearch={handleSearch}
  placeholder="映画を検索..."
/>
```

---

### MovieFilter
映画フィルターコンポーネント（検索機能用）

**Props:**
- `onFilterChange`: (filters: FilterOptions) => void
- `genres`: Array<{ id: number; name: string }>

**FilterOptions型:**
```typescript
type FilterOptions = {
  genre?: number[];     // ジャンルID配列
  year?: number;        // 公開年
  vote_average_gte?: number;  // 最低評価
}
```

**表示内容:**
- ジャンル選択（マルチセレクト）
- 年代選択（ドロップダウン）
- 評価選択（スライダー or ドロップダウン）
- フィルタークリアボタン

**使用例:**
```tsx
<MovieFilter
  onFilterChange={handleFilterChange}
  genres={[
    { id: 28, name: 'アクション' },
    { id: 12, name: 'アドベンチャー' },
    { id: 35, name: 'コメディ' }
  ]}
/>
```

---

### LoginForm
ログインフォーム

**Props:**
- `onSubmit`: (email: string, password: string) => Promise<void>
- `onRegisterClick`: () => void

**表示内容:**
- メールアドレス入力
- パスワード入力
- ログインボタン
- 新規登録リンク

**使用例:**
```tsx
<LoginForm
  onSubmit={handleLogin}
  onRegisterClick={handleShowRegister}
/>
```

---

### RegisterForm
新規登録フォーム

**Props:**
- `onSubmit`: (data: RegisterData) => Promise<void>
- `onLoginClick`: () => void

**表示内容:**
- メールアドレス入力
- パスワード入力
- ユーザー名入力
- 登録ボタン
- ログインリンク

**使用例:**
```tsx
<RegisterForm
  onSubmit={handleRegister}
  onLoginClick={handleShowLogin}
/>
```

---

### OTPVerification
OTP検証フォーム

**フォーム**: react-hook-form + zod

**Props:**
- `onSubmit`: (otp: string) => Promise<void>
- `onResend`: () => Promise<void>
- `email`: string

**表示内容:**
- 6桁OTP入力フィールド（1つの入力欄方式）
  - type="text"
  - maxLength={6}
  - pattern="[0-9]{6}"
  - プレースホルダー: "123456"
- 検証ボタン
- 再送信ボタン（5分間隔制限）

**バリデーション（zod）:**
```typescript
const otpSchema = z.object({
  otp: z.string()
    .length(6, '6桁の数字を入力してください')
    .regex(/^[0-9]{6}$/, '数字のみ入力可能です')
});
```

**使用例:**
```tsx
<OTPVerification
  onSubmit={handleVerifyOTP}
  onResend={handleResendOTP}
  email={userEmail}
/>
```

---

## Layout Components

### AppLayout
アプリケーション全体のレイアウト

**Props:**
- `children`: ReactNode
- `user`: User | null

**構造:**
```
┌─────────────────────┐
│     Header/Nav      │
├──────┬──────────────┤
│      │              │
│ Side │   Content    │
│ bar  │    Area      │
│      │              │
└──────┴──────────────┘
```

**使用例:**
```tsx
<AppLayout user={currentUser}>
  <HomePage />
</AppLayout>
```

---

### Header
ヘッダーコンポーネント

**Props:**
- `user`: User | null
- `onLogout`: () => void

**表示内容:**
- ロゴ
- 検索バー
- ユーザーメニュー

**使用例:**
```tsx
<Header user={currentUser} onLogout={handleLogout} />
```

---

### Sidebar
サイドバーコンポーネント

**Props:**
- `navigation`: ReactNode - ナビゲーション
- `userSection`: ReactNode - ユーザーセクション
- `calendarButton`: ReactNode - カレンダーボタン
- `watchlist`: ReactNode - ウォッチリスト

**表示内容:**
- ナビゲーション（SideNav）
- ユーザーメニュー（UserMenu）- 下部に固定
- カレンダーボタン
- 見たい映画リスト

**使用例:**
```tsx
<Sidebar
  navigation={<SideNav />}
  userSection={<UserMenu />}
/>
```

---

### UserMenu
ユーザープロフィール + ポップオーバーメニュー（サイドバー下部）

**ベース**: `@radix-ui/react-dropdown-menu`（プリミティブ直接使用）

**Props:** なし（内部でuseSession()からセッション情報を取得）

**表示内容:**
- トリガー: アバター（画像 or イニシャル） + ユーザー名
- ポップオーバー（上方向展開）:
  - メールアドレス（Label）
  - 設定リンク（/settings へ遷移）
  - ログアウトボタン（destructive）

**使用例:**
```tsx
<UserMenu />
```

---

## ユーティリティ関数

### getTMDbImageUrl
TMDb画像URLを生成するヘルパー関数

**場所:** `lib/utils/image.ts`

**シグネチャ:**
```typescript
type ImageSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original';

function getTMDbImageUrl(
  path: string | null,
  size: ImageSize = 'w500'
): string | null;
```

**実装:**
```typescript
export function getTMDbImageUrl(
  path: string | null,
  size: ImageSize = 'w500'
): string | null {
  if (!path) return null;

  const baseUrl = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE_URL;
  return `${baseUrl}/${size}${path}`;
}
```

**使用例:**
```tsx
// MovieTileコンポーネント内
const posterUrl = getTMDbImageUrl(movie.poster_path, 'w500');

<Image
  src={posterUrl || '/placeholder.jpg'}
  alt={movie.title}
  width={500}
  height={750}
/>
```

**画像サイズガイド:**
- `w92`: サムネイル（ウォッチリストアイテム）
- `w185`: 小さいポスター
- `w500`: 通常のポスター（一覧画面）
- `w780`: 大きいポスター（詳細画面）
- `original`: オリジナルサイズ

---

## 確認が必要な事項

### コンポーネント設計
- [x] **ロジック分離**: ロジックはカスタムhooksに分離 - 確定
- [ ] **Props vs Context**: ユーザー情報はProps渡し？Context？
- [x] **カスタムフック**: ビジネスロジック・状態管理は全てhooksに切り出す - 確定

**設計原則:**
- コンポーネント: UIレンダリングのみに専念
- カスタムフック: データ取得、状態管理、ビジネスロジック
- 例:
  - `useAuth()` - 認証状態管理
  - `useMovies()` - 映画データ取得・キャッシュ
  - `useWatchlist()` - ウォッチリスト操作
  - `useToast()` - トースト通知管理

### UIライブラリ
- [x] **ヘッドレスUI**: Radix UI - 確定（拡張してカスタマイズ）
- [x] **アイコン**: React Icons - 確定
- [x] **アニメーション**: 基本的に行わない - 確定
  - styleでopacity程度の軽微な変化のみ
  - transition: opacity 0.2s ease等のシンプルなCSS
  - パフォーマンスとシンプルさを優先

**Radix UIの利点:**
- アクセシビリティ標準準拠（WAI-ARIA）
- ヘッドレスUI（スタイリングの自由度が高い）
- react-hook-formとの相性が良い
- TypeScript完全対応
- キーボードナビゲーション組み込み済み

**React Iconsの利点:**
- 豊富なアイコンセット（Font Awesome、Material Design等）
- Tree-shakingで必要なアイコンのみバンドル
- TypeScript対応
- 使用例: `<FiSearch />`, `<FiUser />`, `<FiHeart />`

### パフォーマンス
- [x] **React.memo**: 必ず実施 - 確定
  - 全ての再利用可能なコンポーネントにReact.memoを適用
  - propsの比較関数は必要に応じて実装
  - 特に重要: MovieTile, WatchlistItem等の繰り返しレンダリングされるコンポーネント
- [x] **useCallback**: 必ず実施 - 確定
  - コールバック関数は全てuseCallbackでメモ化
  - 子コンポーネントに渡す関数は必ずuseCallback
  - 依存配列を適切に設定
- [ ] **仮想化**: 大量の映画リストに仮想スクロール必要？
- [x] **遅延ロード**: Next.js Image + lazy loading - 確定（画像最適化で実装済み）

**memo化の対象コンポーネント:**
- 繰り返しレンダリング: MovieTile, WatchlistItem, ReviewItem
- 共通コンポーネント: Button, Input, Select, Card, Modal, Toast
- レイアウト: Header, Sidebar
- 大きなコンポーネント: MovieDetail, Calendar

**パフォーマンス最適化の実装例:**
```typescript
import { memo, useCallback } from 'react';

type Props = {
  movie: Movie;
  onWatchlistAdd: (movieId: number) => void;
};

export const MovieTile = memo(({ movie, onWatchlistAdd }: Props) => {
  // コールバックをuseCallbackでメモ化
  const handleClick = useCallback(() => {
    onWatchlistAdd(movie.id);
  }, [movie.id, onWatchlistAdd]);

  return (
    <Card onClick={handleClick}>
      {/* ... */}
    </Card>
  );
});

// 親コンポーネント
export const MovieList = () => {
  const [watchlist, setWatchlist] = useState<number[]>([]);

  // 子コンポーネントに渡す関数をuseCallbackでメモ化
  const handleWatchlistAdd = useCallback((movieId: number) => {
    setWatchlist(prev => [...prev, movieId]);
  }, []);

  return (
    <>
      {movies.map(movie => (
        <MovieTile
          key={movie.id}
          movie={movie}
          onWatchlistAdd={handleWatchlistAdd}
        />
      ))}
    </>
  );
};
```

### アクセシビリティ
- [x] **ARIA属性**: Radix UIに標準搭載（WAI-ARIA準拠）- 確定
- [x] **キーボード操作**: Radix UIに標準搭載（Tab/Enter/Escape等）- 確定
- [x] **スクリーンリーダー**: Radix UIに標準搭載 - 確定
- [x] **カラーコントラスト**: WCAG AA基準を満たす - 確定
- [x] **フォーカス表示**: キーボード操作時の視覚的フィードバック実装 - 確定
- [x] **ARIAラベル**: 全インタラクティブ要素に実装 - 確定

**Radix UIのアクセシビリティ機能:**
- フォーカス管理（Focus Trap、Focus Lock）
- キーボードナビゲーション（矢印キー、Tab、Enter、Escape）
- ARIA属性の自動設定（role, aria-label, aria-describedby等）
- スクリーンリーダー対応（Live Regions、Announcements）

**カスタムコンポーネントのアクセシビリティ要件:**
- すべてのボタン・リンクにaria-label追加
- フォーカス時に明確なアウトライン表示（outline: 2px solid $primary-500）
- カラーコントラスト比4.5:1以上（テキスト）、3:1以上（UI要素）
- キーボードのみで全操作可能

### テスト
- [x] **単体テスト**: Jest + React Testing Library - 確定
- [x] **E2Eテスト**: Playwright - 確定
- [x] **Storybook**: 実施 - 確定
- [x] **カバレッジ目標**: 80%以上 - 確定

**テスト方針:**
- 共通コンポーネント: 単体テスト必須
- カスタムフック: 単体テスト必須
- ページ・フィーチャー: E2Eテスト
- API Routes: 統合テスト

**Storybook方針:**
- 共通コンポーネント（common/）は全てストーリー作成
- 機能コンポーネント（features/）は主要なもののみ
- デザインシステムのドキュメント化
- インタラクションテスト活用

### 命名規則
- [x] **変数・関数**: lowerCamelCase - 確定
- [x] **コンポーネントファイル名**: PascalCase - 確定
- [x] **CSS Modules**: `.module.scss`使用 - 確定
- [x] **Props型**: 同一ファイル内で定義 - 確定

**命名規則詳細:**
```typescript
// コンポーネント: PascalCase
export const MovieTile = () => {};

// 変数・関数: lowerCamelCase
const movieData = useMovies();
const handleClick = () => {};

// カスタムフック: use + PascalCase
export const useAuth = () => {};

// 型定義: PascalCase（同一ファイル）
type MovieTileProps = {
  movie: Movie;
  onClick: () => void;
};

// ファイル名
// - コンポーネント: MovieTile.tsx
// - フック: useAuth.ts
// - 型: types.ts
// - スタイル: MovieTile.module.scss
```
