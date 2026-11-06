---
description: Next.js API Route作成・編集時のルール
globs:
  - "src/app/api/**"
---

# API Routeルール

## 【必須】認証・セキュリティ

- NextAuth.js による認証チェックを必ず行う
- DB-based レート制限を実装する

## 【必須】レート制限と検証の順序

> 背景: ルートごとに順序が逆になっていた（#940）。順序は挙動を変えるため、
> 読み手が毎回ルートを開いて確認しないと判断できない状態になっていた。

### 原則

**レート制限は、識別子が確定した直後 — 検証より前 — に置く。**

```ts
export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return unauthorizedResponse();

  const supabase = createServiceRoleClient();
  if (!supabase) return dbConnectionErrorResponse();

  // ← ここ。session.user.id はもう確定している
  const rateLimitResult = await checkRateLimit(supabase, session.user.id, ...);
  if (!rateLimitResult.allowed) return rateLimitExceededResponse(rateLimitResult);

  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success) return validationErrorResponse(result);
  // ...
}
```

理由は**カウント回避を塞ぐこと**。検証を先に置くと、形式だけ崩したリクエストは
400 で返るがカウンタを消費しない。攻撃者は不正な形式を挟むだけで試行回数を
いくらでも稼げる。

代償として、クライアントのバグで不正なリクエストを投げ続けると利用者が
意図せずロックされうる。これは**承知のうえで受け入れる**。検知しづらい
総当たりより、再現して直せるクライアントのバグのほうが扱いやすい。

### 例外1: 識別子がボディ由来のルート

識別子を検証済みのボディの値から作るルートは、**検証より前に識別子が存在しない**
ため原則を適用できない。検証の直後に置く。

| ルート | 識別子 |
|---|---|
| `auth/otp/send` | `email`（ボディ） |
| `auth/otp/verify` | `buildLoginIdentifier(email, ip)` |
| `auth/register` | `buildLoginIdentifier(email, ip)` |
| `auth/password-reset/request` | `email`（ボディ） |

**識別子を IP 単独に替えて原則へ寄せてはいけない。** これらはメールアドレス単位で
数えることが保護の目的そのもので、IP ごとにカウンタが分かれると送信数を IP 数だけ
掛け算できる（#641 / #644）。

### 例外2: 守る資源が検証の後ろにあるルート

レート制限が守っているのが DB ではなく**外部APIの費用やメールボックス**で、
そこへ到達するのが検証の後になるルートは、資源を消費する直前に置く。

| ルート | 守る資源 | 置く位置 |
|---|---|---|
| `movies/suggest-title` | OpenAI の呼び出し費用 | キャッシュ照合の後（ヒット時は消費しない） |
| `auth/otp/send` | メールボックス（日次通数） | 送信の直前（1通も送らないパスで枠を減らさない） |
| `auth/register` | 同上 | ユーザー作成の前・早期returnの後 |

### ヘルパーに同梱しない

レート制限を「検証済みの入力を受け取るヘルパー」の中に書くと、**ヘルパーごと
検証の後ろに固定される**。原則を守れなくなるので、制限だけ別の関数に切り出して
呼び出し側が認証の直後に呼ぶ。

前例: `src/helpers/totpGuard.ts` の `checkSecondFactorRateLimit` ／
`requireSecondFactor`（後者はコードの検証が要るため検証の後ろにしか置けない）。

### 新しいルートを書くとき

1. 識別子は何か → `session.user.id` / `clientIp` なら**原則どおり検証より前**
2. ボディ由来なら → 例外1。検証の直後
3. 守るものが外部APIやメールなら → 例外2。資源の直前
4. **例外を選んだらコメントに理由を書く**。後から読む人が原則違反と誤認して
   戻してしまう（`settings` PUT が実際にそうなった）

### 現状の一覧（#940 時点）

検証を伴うルートの全16ハンドラ。これ以外は検証が無いか、レート制限が無い。

| 原則どおり（レート制限 → 検証） | 例外（検証 → レート制限） |
|---|---|
| `auth/password-reset/confirm` POST | `auth/otp/send` POST（例外1・2） |
| `filters` PUT | `auth/otp/verify` POST（例外1） |
| `theaters/[slug]` GET | `auth/register` POST（例外1・2） |
| `user/change-password` POST | `auth/password-reset/request` POST（例外1） |
| `user/profile` PUT | `movies/suggest-title` GET（例外2） |
| `user/settings` PUT | |
| `user/totp/enable` POST | |
| `user/totp/disable` POST | |
| `user/totp/recovery-codes` POST | |
| `watchlist/calendar` GET | |
| `watchlist/watched` GET | |

各ハンドラのテストに `処理順` の describe があり、順序を回帰テストしている。

## 【必須】レスポンス形式

- 統一エラーレスポンス形式を使用する
