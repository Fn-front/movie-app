# コンポーネント一覧

## コンポーネント分類

### Common（共通コンポーネント）
汎用的で再利用可能なUIコンポーネント

### Features（機能別コンポーネント）
特定の機能に特化したコンポーネント

### Layouts（レイアウトコンポーネント）
ページ構造を決定するコンポーネント

---

## Common Components

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

**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `title`: string
- `children`: ReactNode
- `size`: 'sm' | 'md' | 'lg' | 'xl'

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

### Loading
ローディングインジケーター

**Props:**
- `size`: 'sm' | 'md' | 'lg'
- `fullScreen`: boolean

**使用例:**
```tsx
<Loading size="lg" fullScreen />
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

**Props:**
- `onSubmit`: (otp: string) => Promise<void>
- `onResend`: () => Promise<void>
- `email`: string

**表示内容:**
- 6桁OTP入力フィールド
- 検証ボタン
- 再送信ボタン

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
- `user`: User
- `onCalendarClick`: () => void

**表示内容:**
- ユーザーアイコン・名前
- カレンダーボタン
- 見たい映画リスト

**使用例:**
```tsx
<Sidebar
  user={currentUser}
  onCalendarClick={handleShowCalendar}
/>
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
- [ ] **状態管理**: どのコンポーネントでuseStateを使うか？
- [ ] **Props vs Context**: ユーザー情報はProps渡し？Context？
- [ ] **カスタムフック**: どの処理をフックに切り出すか？

### UIライブラリ
- [ ] **ヘッドレスUI**: Radix UI / Headless UI使用する？
- [ ] **アイコン**: React Icons / Heroicons / 自作SVG?
- [ ] **アニメーション**: Framer Motion使用する？

### パフォーマンス
- [ ] **React.memo**: どのコンポーネントにメモ化を適用するか？
- [ ] **仮想化**: 大量の映画リストに仮想スクロール必要？
- [ ] **遅延ロード**: 画像の遅延読み込み戦略は？

### アクセシビリティ
- [ ] **ARIA属性**: 各コンポーネントのARIA対応は？
- [ ] **キーボード操作**: Tab/Enter/Escapeキー対応は？
- [ ] **スクリーンリーダー**: 音声読み上げ対応は？

### テスト
- [ ] **単体テスト**: Jest + React Testing Library?
- [ ] **E2Eテスト**: Playwright / Cypress?
- [ ] **Storybookv: コンポーネントカタログ作成する？

### 命名規則
- [ ] **ファイル名**: PascalCase? kebab-case?
- [ ] **CSS Modules**: `.module.scss`使用する？
- [ ] **Props型**: 型定義ファイルを分離する？
