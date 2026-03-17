**ステータス: 完了**

## フェーズ2: 認証機能（1-2週間）

- [x] 1. usersテーブルにroleカラム追加 + 管理者Seeder
- [x] 2. 新規登録フロー（フォーム + API + パスワードハッシュ化）
- [x] 3. ログイン・セッション管理
- [x] 4. パスワード変更機能
- [x] 5. セキュリティ対策（レート制限、CSRF、XSS）
- [x] 6. UX改善（ローディング、エラーメッセージ、自動遷移）

### 新規登録フロー（NextAuth.js Credentials Provider）
- [x] 登録フォームUI実装（react-hook-form）
- [x] バリデーションスキーマ実装（zod）
  - メールアドレス形式チェック
  - パスワードポリシー: 8文字以上、英字（大文字・小文字）+ 数字必須
- [ ] NextAuth.js Credentials Provider設定
- [x] カスタム登録API実装（`/api/auth/register`）
- [x] パスワードハッシュ化実装（bcrypt）
- [ ] axiosインスタンスでAPI呼び出し

### 管理者ユーザー
- [x] usersテーブルにroleカラム追加（デフォルト: 'user'、管理者: 'admin'）
- [x] 管理者Seeder作成
  - role = 'admin' で挿入
  - Supabase SQLまたはスクリプトで管理者ユーザーを追加

### ログイン・セッション管理（NextAuth.js）
- [x] ログインフォームUI実装（react-hook-form + zod）
- [x] NextAuth.js signIn()統合
- [x] Session Callbacksカスタマイズ（JWT、24時間有効期限）
- [x] NextAuth.js Middlewareでルート保護
- [x] axiosインターセプターでセッション管理

### パスワード変更機能
- [x] パスワード変更機能実装
  - アカウント設定画面実装
  - パスワード変更フォームUI実装（react-hook-form + zod）
    - 現在のパスワード入力
    - 新しいパスワード入力
    - 新しいパスワード（確認）入力
  - パスワード変更API実装（`/api/user/change-password`）
  - 現在のパスワード確認
  - 新パスワードバリデーション（8文字以上、英字大小 + 数字）

### セキュリティ対策
- [x] レート制限実装（3回までの試行制限）
  - ログイン: 3回失敗で30分ロック
  - パスワード変更: 3回失敗で30分ロック
- [x] CSRF対策（NextAuth.js sameSite: 'lax' + httpOnly + Secure Cookie）
- [x] XSS対策（セキュリティヘッダー: CSP, X-Content-Type-Options, X-Frame-Options, HSTS等）
- [x] パスワードポリシー実装（zod schemaで実装済み）

### UX改善
- [x] ローディング状態実装
  - 全画面ローディングコンポーネント（オーバーレイ + 操作ブロック）
  - API呼び出し中のローディング表示
  - ローディングサークル + メッセージ表示
- [x] エラーメッセージ改善
  - ユーザーフレンドリーで具体的なメッセージ
  - zodバリデーションエラーのカスタマイズ
  - Toast通知でエラー表示（5秒）
- [x] 自動遷移実装
  - ログイン成功後 → ホーム画面へ自動遷移
