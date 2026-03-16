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

### Providers（プロバイダーコンポーネント）
アプリ全体の状態・コンテキストを管理するコンポーネント

---

## Common Components

**実装方針:**
- Radix UIプリミティブをベースに、SCSS Modulesでカスタムスタイリング
- 各コンポーネントはプロジェクト固有のデザインシステムに準拠

### Button
ボタンコンポーネント

**Props:**
```typescript
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  fullWidth?: boolean;
  isLoading?: boolean;
}
```

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

### Textarea
テキストエリア入力フィールド

**Props:**
```typescript
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  showCount?: boolean;
  maxLength?: number;
}
```

---

### Select
セレクトボックス

**ベース**: `@radix-ui/react-select`

**Props:**
- `value`: string
- `onValueChange`: (value: string) => void
- `options`: Array<{ value: string; label: string }>
- `placeholder`: string
- `disabled`: boolean
- `className`: string
- `aria-label`: string

**使用例:**
```tsx
<Select
  value={selectedSort}
  onValueChange={setSortBy}
  options={[
    { value: 'release_date', label: '公開日順' },
    { value: 'popularity', label: '人気順' },
  ]}
  aria-label="ソート順を選択"
/>
```

---

### Checkbox
チェックボックス

**ベース**: `@radix-ui/react-checkbox`

**Props:**
```typescript
interface CheckboxProps {
  label?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
}
```

---

### Tabs
タブ切り替え

**ベース**: `@radix-ui/react-tabs`

**Props:**
```typescript
interface TabOption {
  label: string;
  value: string;
  disabled?: boolean;
}

interface TabsProps {
  options: readonly TabOption[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
  children?: ReactNode;
}
```

---

### Badge
バッジコンポーネント

**Props:**
```typescript
type BadgeVariant = 'default' | 'primary' | 'success' | 'error' | 'warning';
type BadgeSize = 'sm' | 'md';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  onRemove?: () => void;
  className?: string;
}
```

---

### Card
カードコンテナ

**Props:**
- `children`: ReactNode
- `hover`: boolean
- `onClick`: () => void
- `className`: string

---

### Modal / Dialog
モーダルダイアログ

**ベース**: `@radix-ui/react-dialog`

**Props:**
```typescript
interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
}

interface ModalHeaderProps {
  children: ReactNode;
  className?: string;
}

interface ModalBodyProps {
  children: ReactNode;
  className?: string;
}

interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}
```

**機能:**
- ESCキーで閉じる（Radix UI標準）
- オーバーレイクリックで閉じる
- フォーカストラップ（モーダル内でフォーカス固定）
- スクロールロック

---

### DropdownMenu
ドロップダウンメニュー

**ベース**: `@radix-ui/react-dropdown-menu`

**Props:**
```typescript
interface DropdownMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

interface DropdownMenuProps {
  trigger: ReactNode;
  items: DropdownMenuItem[];
  align?: 'start' | 'center' | 'end';
  className?: string;
}
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

**グローバル使用:**
```tsx
const { showToast } = useToast();
showToast({ message: 'ログインに成功しました', type: 'success' });
```

---

### Loading
ローディングインジケーター

**Props:**
- `size`: 'sm' | 'md' | 'lg'
- `fullScreen`: boolean
- `label`: string (optional)

---

### Heading
見出しコンポーネント

**Props:**
```typescript
interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  align?: 'left' | 'center' | 'right';
}
```

---

### Pagination
ページネーション

**Props:**
```typescript
interface PaginationProps extends HTMLAttributes<HTMLDivElement> {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  maxPageButtons?: number;
  className?: string;
}
```

---

### Skeleton
スケルトンローディング

**Props:**
```typescript
type SkeletonVariant = 'text' | 'rect' | 'circle';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  className?: string;
}
```

---

### EmptyState
空状態表示

**Props:**
```typescript
interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}
```

---

### Avatar
ユーザーアバター

**Props:**
- `src`: string
- `alt`: string
- `size`: 'sm' | 'md' | 'lg'
- `fallback`: string

---

## Movie UI Components

### MovieTile
映画サムネイルタイル

**Props:**
```typescript
interface MovieTileProps {
  movie: MovieCacheItem;
  genres: Record<number, string>;
  onClick: (movieId: number) => void;
  isInWatchlist: boolean;
  onWatchlistToggle: (movieId: number) => void;
  watchlistDisabled: boolean;
  onFavoriteToggle: (movie, favorite) => void;
  favoriteDisabled: boolean;
}
```

---

### MovieTileSkeleton
映画タイルのスケルトンローディング

**Props:**
```typescript
interface MovieTileSkeletonProps {
  count?: number;
}
```

---

### FilterModal
映画フィルターモーダル

**ベース**: `@radix-ui/react-dialog`

**Props:**
```typescript
interface FilterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  genres: Record<number, string>;
  selectedGenreIds: number[];
  selectedDateRange: DateRange;
  isRevivalFilter: boolean | undefined;
  onApply: (genreIds: number[], dateRange: DateRange, isRevival: boolean | undefined) => void;
}
```

---

### MovieDetailModal
映画詳細モーダル

**Props:**
- `movieId`: number | null
- `title`: string | undefined
- `showFinancialInfo`: boolean
- `onClose`: () => void

---

### MovieDetailContent
映画詳細のコンテンツ部分

**Props:**
```typescript
interface MovieDetailContentProps {
  movieId: number;
  showFinancialInfo?: boolean;
}
```

---

## Feature Components

### MovieListContent
映画一覧コンテンツ（upcoming / nowShowing 共有）

**Props:**
```typescript
interface MovieListContentProps {
  title: string;
  movieList: UseMovieListReturn;
}
```

内部で `MovieListToolbar`、`MovieGrid` に分割。`useMovieListContent` フックでロジック管理。

---

### NowShowingMovieList
劇場公開中の映画一覧（ホームページ用）

**Props:**
```typescript
interface NowShowingMovieListProps {
  movies: NowShowingMovie[];
}
```

---

### MovieContent
ホームページの映画コンテンツ部分

**Props:** なし（内部で `useHome` フックを使用）

---

### RecommendationSection
AIレコメンド映画セクション

**データ取得方式**: Server Component（page.tsx）でサーバーサイド取得 → propsで渡す

**Props:**
```typescript
interface RecommendationSectionProps {
  recommendations: Recommendation[];
  hasFavorites: boolean;
}
```

**表示状態（3パターン）:**
1. **お気に入り0件**（`hasFavorites: false`）: 登録促進テキスト
2. **レコメンド未生成**（`recommendations.length === 0`）: 「準備中」テキスト
3. **レコメンドあり**: MovieTileグリッド + 推薦理由テキスト

---

### FavoriteButton
映画タイルのお気に入りハートアイコン

**Props:**
```typescript
interface FavoriteButtonProps {
  favorite: MovieFavoriteInfo | null;
  onClick: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}
```

- 未登録: 白抜きハート → クリックでRatingModal表示
- 登録済み: 塗りつぶしハート（`$secondary-600`）→ クリックで評価変更

---

### FavoriteRatingModal
お気に入り評価入力モーダル

**ベース**: `@radix-ui/react-dialog`

**Props:**
```typescript
interface FavoriteRatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  movieTitle: string;
  currentFavorite: MovieFavoriteInfo | null;
  onSubmit: (rating: number) => void;
  onDelete?: () => void;
}
```

---

### RatingIndicator
評価値インジケーター（1〜10点）

**Props:**
```typescript
interface RatingIndicatorProps {
  rating: number;
  onRatingChange?: (rating: number) => void;
  size?: 'sm' | 'md';
}
```

- `onRatingChange` 指定時: インタラクティブモード（モーダル内）
- 未指定時: 読み取り専用（一覧画面）

---

### FavoriteList
お気に入り一覧グリッド

**Props:**
```typescript
interface FavoriteListProps {
  favorites: FavoriteItem[];
  isLoading: boolean;
  onFavoriteToggle: (movie, favorite) => void;
  isFavoriteProcessing?: (tmdbMovieId: number) => boolean;
  onClick?: (tmdbMovieId: number) => void;
}
```

---

### FavoritesPage
お気に入りページ

**Props:** なし（内部で `useFavoritesPage` フックを使用）

---

### WatchlistAddButton
ウォッチリスト追加ボタン

**Props:**
```typescript
interface WatchlistAddButtonProps {
  isInWatchlist: boolean;
  onClick: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}
```

---

### WatchlistList
ウォッチリスト一覧

**Props:**
```typescript
interface WatchlistListProps {
  watchlist: WatchlistItem[];
  isLoading: boolean;
  onClick?: (tmdbMovieId: number) => void;
  onDelete?: (id: string) => void;
}
```

---

### WatchlistPanel
サイドバーのウォッチリストパネル

**Props:** なし（内部で状態管理）

---

### WatchlistPage
ウォッチリストページ

**Props:** なし（内部で `useWatchlistPage` フックを使用）

---

### CalendarDialog
カレンダーダイアログコンポーネント

**ベース**: `@radix-ui/react-dialog` + `react-day-picker`

**Props:**
- `isOpen`: boolean
- `onClose`: () => void

---

### CalendarMovieList
カレンダー内の選択日の映画一覧

**Props:**
- `movies`: Array<{ id: string; tmdb_movie_id: number; title: string; poster_path: string | null; release_date: string }>
- `onMovieClick`: (movieId: number) => void

---

### SearchPage
検索結果ページ

**Props:** なし（内部で `useSearchPage` フックを使用）

---

### SearchBar
Header用検索バー

**Props:**
- `defaultValue`: string
- `placeholder`: string

---

### SearchResults
検索結果一覧

**Props:**
```typescript
interface SearchResultsProps {
  movies: Movie[];
  totalResults: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onMovieClick: (movieId: number) => void;
  isLoading: boolean;
}
```

---

### SettingsPage
設定画面統合コンポーネント

**表示セクション:**
- プロフィール（DisplayNameForm）
- パスワード変更（ChangePasswordForm）
- 通知設定（NotificationSettings）
- 外観/テーマ（ThemeSettings）
- 興味なし一覧（DismissedMoviesList）

---

### DisplayNameForm
表示名変更フォーム（react-hook-form + zod）

**Props:** なし（内部でセッション情報を取得）

---

### ChangePasswordForm
パスワード変更フォーム（OTP検証 + 新パスワード入力）

**フォーム**: react-hook-form + zod

**Props:**
```typescript
interface ChangePasswordFormProps {
  email: string;
}
```

**ステップ:**
1. 「確認コードを送信」ボタン → OTP送信
2. OTPコード入力
3. 新パスワード入力 + 変更ボタン

---

### NotificationSettings
通知設定ON/OFF切り替え（オプティミスティックUI）

**Props:** なし

---

### ThemeSettings
テーマ切り替え（light/dark）

**Props:** なし

---

### DismissedMoviesList
興味なし映画一覧（設定ページ用）

**Props:** なし（内部でAPIからデータ取得）

---

## Auth Components

### LoginForm
ログインフォーム

**Props:**
```typescript
interface LoginFormProps {
  onOtpLoginClick?: () => void;
}
```

- ログイン処理は内部実装（onSubmit Props不要）
- 新規登録への遷移も内部でルーター使用

---

### RegisterForm
新規登録フォーム

**Props:**
- `onLoginClick`: () => void

---

### SocialLoginButtons
ソーシャルログインボタン群

**Props:**
- `onGoogleLogin`: () => void
- `onGithubLogin`: () => void
- `disabled`: boolean

---

### OtpLoginForm
メールOTPログインフォーム

**Props:**
- `onSubmit`: (email: string) => Promise<void>
- `onBackToLogin`: () => void

---

### OTPVerification
OTP検証フォーム

**Props:**
- `onSubmit`: (otp: string) => Promise<void>
- `onResend`: () => Promise<void>
- `email`: string
- `action`: 'registration' | 'login' | 'password_change'

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
├──────┴──────────────┤
│       Footer        │
└─────────────────────┘
```

---

### Header
ヘッダーコンポーネント

**Props:**
- `user`: User | null
- `onLogout`: () => void

---

### Sidebar
サイドバーコンポーネント

**Props:**
- `navigation`: ReactNode
- `userSection`: ReactNode
- `calendarButton`: ReactNode
- `watchlist`: ReactNode

---

### Footer
フッターコンポーネント

**Props:**
```typescript
interface FooterProps extends HTMLAttributes<HTMLElement> {
  copyright?: string;
  links?: Array<{ label: string; href: string }>;
  children?: ReactNode;
  className?: string;
}
```

---

### MobileDrawer
モバイルドロワーメニュー

**Props:**
```typescript
interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

---

### MobileMenuButton
モバイルメニュートグルボタン

**Props:**
```typescript
interface MobileMenuButtonProps {
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}
```

---

### UserMenu
ユーザープロフィール + ポップオーバーメニュー（サイドバー下部）

**ベース**: `@radix-ui/react-dropdown-menu`

**Props:** なし（内部でuseSession()からセッション情報を取得）

---

## Provider Components

### AppSessionProvider
NextAuth.jsセッションプロバイダー

**Props:**
```typescript
interface AppSessionProviderProps {
  children: ReactNode;
}
```

---

### AppQueryProvider
TanStack Queryプロバイダー

**Props:**
```typescript
interface AppQueryProviderProps {
  children: ReactNode;
}
```

---

### AppToastProvider
トースト通知プロバイダー

**Props:**
```typescript
interface AppToastProviderProps {
  children: ReactNode;
}
```

---

### ThemeProvider
テーマ初期化コンポーネント（localStorageからテーマを復元）

**Props:** なし

---

### SessionExpiryHandler
セッション期限切れ監視コンポーネント

**Props:** なし

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

**画像サイズガイド:**
- `w92`: サムネイル（ウォッチリストアイテム）
- `w185`: 小さいポスター
- `w500`: 通常のポスター（一覧画面）
- `w780`: 大きいポスター（詳細画面）
- `original`: オリジナルサイズ

---

## 設計原則

### ロジック分離
- コンポーネント: UIレンダリングのみに専念
- カスタムフック: データ取得、状態管理、ビジネスロジック

### UIライブラリ
- **ヘッドレスUI**: Radix UI
- **アイコン**: React Icons
- **アニメーション**: 基本的に行わない（opacity/transform程度のCSS transition）

### パフォーマンス
- **React.memo**: 全コンポーネントで必須
- **useCallback**: 全イベントハンドラーで必須
- **useMemo**: 計算コストの高い処理で使用
- **displayName**: 全コンポーネントに設定

### アクセシビリティ
- ARIA属性: Radix UIに標準搭載（WAI-ARIA準拠）
- キーボード操作: Radix UIに標準搭載
- カラーコントラスト: WCAG AA基準
- フォーカス表示: キーボード操作時の視覚的フィードバック

### テスト
- 単体テスト: Jest + React Testing Library
- カバレッジ目標: 80%以上
