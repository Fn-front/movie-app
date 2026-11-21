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

#### ⚠️ 代わりに IP 単位の層を手前へ重ねる（#1331）

メール単位は「**同一の宛先で何回試せるか**」しか抑えていない。**識別子を
いくつ作れるか**は抑えていないので、宛先を変えるだけで `rate_limits` の行を
無制限に増やせる。未認証ルートはこれが外部から自由にできる。

行が膨らむと保持期間の掃除が `statement_timeout = 8s` を超えて全ロールバックし、
1行も消えないまま翌日さらに増える詰み方をしうる（#1330）。

置き換えではなく**手前に1層足す**。送信元IPは検証より前に確定するので、
IP 層は**原則どおり検証より前**に置く。

| ルート | 1層目（検証より前） | 2層目（検証の後 / 例外1） |
|---|---|---|
| `auth/password-reset/request` | `password_reset_request_ip` | `password_reset_request` |
| `auth/register` | `register_ip` | `register` / `otp_send_daily` |
| `auth/otp/verify` | `otp_verify_ip` | `otp_verify` |
| `auth/otp/send` | `otp_send_ip` | `otp_send_daily`（例外2） |
| NextAuth `credentials` | `login_ip`（`auth.ts`） | `login` |
| NextAuth `credentials` の第2要素の送信 | `two_factor_send_prompt`（`メール\|IP`） | `two_factor_send`（利用者） |

IP 層には `enforcePublicRateLimit`（`src/helpers/publicRateLimit.ts`）を使う。
`clientIp === 'unknown'` のときは**消費せず通す**（fail-open）点に注意。

> ⚠️ **利用者単位の枠は、識別子を知っている相手から守れない**
> （GHSA-p899-6g7w-v7hg）。`TWO_FACTOR_SEND` は利用者単位なので、
> パスワードを知る第三者が「コードを入れずにパスワードだけ」を61秒間隔で
> 投げ続けると、被害者の枠を使い切って**メールOTPでのログインを妨害できる**。
> `login` は第2要素のプロンプト時に解放される（#1283）ので積み上がらない。
>
> ここでも対処は同じ **「手前に送信元ごとの層を重ねる」**。
>
> #### ⛔ 「半分」では足りない
>
> 送信元を n 個使えば `n × promptMax` まで送れるので、利用者の枠を使い切るのに
> 要る送信元の数は **`ceil(利用者単位の上限 / 送信元ごとの上限)`**。
> 半分にすると **2 で成立する** —— 初版が実際にそうで、レビューで指摘された。
> `two_factor_send_prompt` は 3回/60分にして 4 まで上げている。
>
> **これは緩和であって、塞ぎ切ってはいない。** 送信元を揃えられる相手には
> 依然として通る。IPv6 は `getClientIp` が丸めないため回線1本で識別子を
> 量産でき、既存の `login_ip` 等も同じ穴を持つ（#1379）。
>
> ⚠️ 比べるのは **`maxAttempts / windowMinutes`**。`maxAttempts` だけだと
> `{ maxAttempts: 9, windowMinutes: 1 }`（54倍ゆるい）でもテストが通る。
> `src/lib/rateLimit/rateLimit.test.ts` で両方を固定している。
>
> #### ⛔ 消費は「1通送る直前」に置く
>
> 送信元ごとの層でも**資源はメールボックス**なので、**例外2 と同じ扱い**。
> 再送間隔（60秒）の判定より後ろへ置くこと。
>
> 初版は `authorize` の中、`sendSecondFactorCode` を呼ぶ**前**に置いていた。
> 再送間隔の判定はヘルパーの中なので、**1通も送らないリクエストが枠を食う**。
> `loginSchema` は `totpCode` を持たないため、**コード欄が空のまま「ログイン」を
> 押すだけ**でこの経路に入る（送信ボタンは再送ボタンと違いカウントダウンで
> 無効化されない）。上限ぶん繰り返すと1通も届かないまま締め出される。
>
> これは `sendSecondFactorCode` が利用者単位の枠について**明示的に避けている**
> 失敗と同じ形で、それをひとつ上の層で再現していた。
>
> ⚠️ 送信元IPが `unknown` のときは**層を掛けない**。`buildLoginIdentifier` が
> メール単独へ退化し、全員が同じカウンタを共有するので、誰でも上限ぶんの
> リクエストで被害者を締め出せる（修正前より悪化する）。`login_ip` が
> unknown をスキップするのと同じ扱い。

> ⚠️ `auth/otp/send` だけ塞いでいる穴が違う（#1341）。未登録アドレスだと
> 列挙防止の early return に落ちて `OTP_SEND_DAILY` を消費しないため、
> **`rate_limits` の行は増えない**。IP 層が守っているのは
> 「1リクエストごとの `users` SELECT と `randomDelay()` の 200〜500ms」。
> 列挙を防ぐために**わざと重くしている**処理なので、天井が無いとそのコストが
> そのまま攻撃者の武器になる。

### 例外2: 守る資源が検証の後ろにあるルート

レート制限が守っているのが DB ではなく**外部APIの費用やメールボックス**で、
そこへ到達するのが検証の後になるルートは、資源を消費する直前に置く。

| ルート | 守る資源 | 置く位置 |
|---|---|---|
| `movies/suggest-title` | OpenAI の呼び出し費用 | キャッシュ照合の後（ヒット時は消費しない） |
| `auth/otp/send` | メールボックス（日次通数） | 送信の直前（1通も送らないパスで枠を減らさない） |
| `auth/register` | 同上 | ユーザー作成の前・早期returnの後 |

#### ⚠️ 例外2 を選べるのは「早期 return が外から誘発できない」ときだけ

例外2 の利点は「1通も送らないパスで枠を減らさない」こと。だがその早期 return が
**攻撃者の入力で自由に踏める**なら、**枠を1つも消費しない経路**を与えることになる。

`user/email-change/request` が実際にそうなった（#1359 のレビュー）。枠を
`sendEmailChangeCode` の中に置いたため、**重複チェックで弾くパスが到達せず**、
認証済みアカウント1つで全登録アドレスを無制限に列挙でき、各リクエストが
`bcrypt.compare` を1回ずつ消費した。**原則どおり（検証より前）へ戻した。**

代償として、同じ間違いを繰り返すと1通も届かないまま枠が減る。これは
**原則が元から承知している代償**（上記）で、列挙と bcrypt の消費を止めるほうが重い。

上の3ルートが例外2 のままでよい理由は、早期 return が外から踏めないか、
踏めても安い（`movies/suggest-title` のキャッシュヒットは DB 1回）から。

#### 消費できなかったら戻す

例外2のルートは「資源を消費する直前」で数えるが、**そこから先で失敗して
1つも消費しなかったら枠を戻す**（#1260）。戻さないと、1通も届いていないのに
`本日の送信上限に達しました` へ落ちる。

```ts
const emailSent = await sendOtpEmail(email, code, action);

if (!emailSent) {
  await releaseRateLimit(supabase, email, RATE_LIMIT_ACTION.OTP_SEND_DAILY);
  return emailSendFailedResponse();
}
```

⚠️ **`resetRateLimit` を使わない。** あちらは行ごと DELETE するので、
同じ窓の中で成功した分まで帳消しになる。`releaseRateLimit`
（`src/lib/rateLimit/rateLimit.ts`）は1回分だけ戻す。

⚠️ **戻すのと一緒に「作ったもの」まで消さない。** `auth/otp/send` の
60秒の再送間隔チェックは `otp_codes` の最新行だけを根拠にしているため、
失敗した行を消すと次のリクエストが素通りする。枠も戻している状態では
**この経路の保護が全部無くなる**（レビューで実測。50回連打が50回とも
送信APIへ到達した）。

#### 失敗したとき、歯止めを**全部**手放さない

送信経路の歯止めは3種類しかない。失敗時にこれが全部無くなると、送信が
失敗し続ける状況で**1リクエスト = 送信APIの1コール**を無限に繰り返せる。

1. **枠**（`rate_limits` の `attempts`）
2. **再送間隔**（直前の `otp_codes` 行の `created_at` **だけ**が根拠）
3. **別カウンタ**（手前の IP 層や、戻していない別の制限）

既存3経路はそれぞれ違う形で、どれも**最低1つは残している**。

| 経路 | 枠 | 行 | 残る歯止め |
|---|---|---|---|
| `auth/otp/send`（送信失敗） | 戻す | **残す** | 再送間隔（60秒）＋ `otp_send_ip` |
| `sendSecondFactorCode`（送信失敗） | **戻さない** | 消す | `TWO_FACTOR_SEND`（10回/60分） |
| `auth/register`（送信失敗） | 戻す（`OTP_SEND_DAILY`） | 消す | **`REGISTER`（5回/60分）を戻していない**＋ `register_ip` |
| `user/email-change/request`（送信失敗） | **戻さない** | 消す | `EMAIL_CHANGE_REQUEST`（5回/60分） |

- `auth/otp/send` が行を残せるのは、残っても害が無いから。
- **第2要素が逆なのは**、行を残すと届いていないコードの行が根拠になって
  次の試行が「先ほど送った確認コードがまだ有効です」になるため（#1285 で
  直した誤解そのもの）。代わりに枠を数える —— 失敗した送信も外部APIを
  1回消費しているので、数えるほうが実態に合う。
- **`auth/register` が両方手放せるのは**、そもそも再送間隔チェックが無く
  （`RESEND_INTERVAL` を見ているのは `otp/send` だけ）、`REGISTER` の枠を
  意図的に戻していないから。3番目の歯止めが残っている。
- **`user/email-change/request` は第2要素と同じ形**。行を残すと届いていない
  コードが根拠になって次の試行が再送間隔に当たるので消し、代わりに枠を
  数える。枠は原則どおり認証の直後に消費済みで、戻していない。

⛔ 新しい送信経路を足すときは、**失敗パスで何が残るかを数えること**。
「利用者を締め出したくない」で全部戻すと歯止めが消える。

> ⚠️ `auth/otp/send` の **INSERT 失敗**パスは枠を戻し、行も作られていない
> （`route.ts` の `releaseRateLimit` → `throw`）。残るのは `otp_send_ip`
> （40回/15分）だけ。DB障害でしか起きず攻撃者が誘発しづらいので許容して
> いるが、同じ形であることは認識しておく。

⚠️ 戻す識別子は**数えたときと同じもの**。`password_change` は宛先を
セッションユーザーに固定しているので（#641）、ボディ由来のアドレスで
戻すと任意のアドレスの枠を減らせる。

### ヘルパーに同梱しない

レート制限を「検証済みの入力を受け取るヘルパー」の中に書くと、**ヘルパーごと
検証の後ろに固定される**。原則を守れなくなるので、制限だけ別の関数に切り出して
呼び出し側が認証の直後に呼ぶ。

前例: `src/helpers/secondFactorGuard.ts` の `checkSecondFactorRateLimit` ／
`requireSecondFactor`（後者はコードの検証が要るため検証の後ろにしか置けない）。

> ⚠️ **これは「検証より前に置けなくなる」ことを避ける規則**であって、
> 「ヘルパーの中に書くな」ではない。
>
> `sendSecondFactorCode` の中にある3つ（`TWO_FACTOR_SEND` ×2 /
> `TWO_FACTOR_SEND_PROMPT`）は**意図的にそこにある**。守る資源が
> メールボックスで、消費位置が**再送間隔の判定より後ろ**でなければ
> ならないため（例外2）。手前に出すと1通も送らないリクエストが枠を食う。
> 経緯は上記「消費は『1通送る直前』に置く」。

### 新しいルートを書くとき

**レート制限1つにつき1回、上から順に判定する。** 最初に当たったものを採る。
1ハンドラに複数のレート制限がある場合（`auth/register` は2つ）は、それぞれ別々に
判定すること。

1. 守るものが**外部APIの費用やメールボックス**で、そこへ到達するのが検証の後か
   → **例外2**。資源を消費する直前に置く
2. 識別子が**検証済みのボディの値**から作られるか
   → **例外1**。検証の直後に置く
3. それ以外（識別子がセッション / 送信元IP / パス・クエリから直接取れる）
   → **原則**。検証より前に置く
4. **例外を選んだらコメントに理由を書く**。後から読む人が原則違反と誤認して
   戻してしまう（`settings` PUT が実際にそうなった）

> ⚠️ 順番が逆だと誤判定する。`movies/suggest-title` の識別子は `session.user.id`
> なので、3 を先に当てると「原則」と出るが、正解は例外2（守っているのは
> OpenAI の費用であり、キャッシュ照合には検証済みの query が要る）。

### ここでいう「検証」

**リクエストの入力を検査して 400 を返す処理すべて**を指す。zod の `safeParse` に
限らない。`movies/[id]` の `Number.isNaN(movieId)`、`awards` の year 範囲チェックの
ような手書きの検査も同じ扱いにする。

### 例外の一覧（ここだけが検証より後ろ）

**これ以外のハンドラはすべて原則どおり**（レート制限 → 検証）。個別の一覧は
ルート追加で必ず腐るため置かない。逆順にするときは必ずこの表へ追記すること。

| ハンドラ | 該当 |
|---|---|
| `auth/otp/send` POST | 例外1・例外2 |
| `auth/otp/verify` POST | 例外1 |
| `auth/register` POST（`REGISTER`） | 例外1 |
| `auth/register` POST（`OTP_SEND_DAILY`） | 例外2 |
| `auth/password-reset/request` POST | 例外1 |
| `movies/suggest-title` GET | 例外2 |
| `user/totp/setup` POST（`TWO_FACTOR_SEND`） | 例外2（`TOTP_SETTINGS_VERIFY` のほうは原則どおり） |
| `user/totp/send-challenge` POST（`TWO_FACTOR_SEND`） | 例外2 |

> ⚠️ `user/email-change/request` / `confirm` は**どちらも原則どおり**
> （`EMAIL_CHANGE_REQUEST` / `EMAIL_CHANGE_VERIFY` を検証より前に消費）。
> request を例外2 にして失敗した経緯は上記「例外2 を選べるのは」を参照。
>
> 送信と検証でカウンタを分けているのは、失敗した検証が送信枠を食うと
> **コードを送り直せなくなる**ため。

> ⚠️ これらの `TWO_FACTOR_SEND` は `sendSecondFactorCode`
> （`src/lib/auth/sendSecondFactorCode.ts`）の**中**にある。ルートの本文を
> 読んでも `checkRateLimit` が見つからないので、棚卸しのときに取りこぼさないこと。
>
> ⚠️ 同じ関数の中に **`TWO_FACTOR_SEND_PROMPT`** もある（計3箇所）。
> こちらは第4引数 `promptIdentifier` を渡した経路だけで効くので、
> **呼び出し側を見ないと効いているか分からない**。渡しているのは
> `auth.ts` の `authorize`（パスワードログイン）だけで、設定画面と
> OAuth の経路では掛からない。
>
> なお `user/totp/send-challenge` は `TOTP_SETTINGS_VERIFY` を**消費しない**。
> 送信系と検証系でカウンタを重ねると、メールOTP の利用者は無効化のたびに
> 「コード送信＋コード入力」で2枠使い、2回しくじるだけで15分間
> `setup` / `enable` / `disable` / `recovery-codes` / `send-challenge` が
> すべて 429 になる。
>
> ⚠️ 一方 `user/totp/setup` は **方式によらず** `TOTP_SETTINGS_VERIFY` を
> 原則どおり（検証より前に）消費する。一度これを `method=totp` の分岐だけに
> 移したが後退だった —— メールOTP 側で効くはずの `TWO_FACTOR_SEND` は
> `sendSecondFactorCode` の中にあり、**再送間隔に当たると `checkRateLimit` へ
> 到達しない**ため、60秒以内の連打が1件もカウントされないまま
> `user_totp` の DELETE + INSERT を繰り返せた。

レート制限と検証の両方を持つハンドラのテストには `処理順` の describe があり、
「レート制限超過 かつ 入力が不正」のリクエストが 429 を返すか 400 を返すかで
順序を回帰テストしている。新しくそういうハンドラを足すときは、同じ describe を
付けること。

> `admin/accounts/[id]/reissue` POST は #1223 で `処理順` を追加した。
> `admin/accounts` POST は #1221 で `処理順` を追加した。

#### ⚠️ レート制限が2層あるルートのテスト

**該当するのは `withAdminAuth` のルートだけではない。** #1331 で
`auth/password-reset/request` / `auth/register` / `auth/otp/verify` も
IP 層が手前に付いて2層になった。下の注意はそのまま当てはまる。

> ⚠️ ただしこの3ルートは、テストのリクエストに転送ヘッダが無いと
> `getClientIp` が `'unknown'` を返し、**1層目がそもそも呼ばれない**。
> 1層目を観測したいテストは `x-vercel-forwarded-for` を付けること
> （各 route.test.ts の `createRequestFromIp`）。逆に、2層目だけを見たい
> 既存の `処理順` テストはヘッダ無しの `createRequest` のままでよい。

##### `withAdminAuth` の場合

`withAdminAuth` は handler を呼ぶ**前に**自前で `checkRateLimit` を回す
（`ADMIN_ROLE_CHECK` / #965。`src/helpers/adminAuth.ts`）。ルート固有の制限は
その後、handler の中にある。

テストで `mockCheckRateLimit.mockResolvedValueOnce({ allowed: false })` を
**1つだけ積むと1層目が消費し**、handler に入る前に 429 が返る。429 は観測
できるのでテストは緑になるが、固定したい「handler 内のレート制限 → 検証」は
何も検証していない。#934 で入れた GET のテストが実際にそうなっていた
（`route.ts` のレート制限超過の return がカバレッジで未到達だった）。

1層目を明示的に通してから2層目を落とすこと。`toHaveBeenNthCalledWith(2, ...)`
で2層目の action 名まで確認すると、層の取り違えに気づける。

```js
mockCheckRateLimit
  .mockResolvedValueOnce({ allowed: true })                    // admin_role_check
  .mockResolvedValueOnce({ allowed: false, retryAfter: 600 }); // ルート固有
```

### 棚卸しのしかた

検証の書き方が複数あるので、grep 1本では必ず取りこぼす。#940 では3回見落とした。

| 検証 | レート制限 |
|---|---|
| `safeParse(` | `checkRateLimit(` |
| `parseAndValidate(`（`src/helpers/requestValidation.ts`） | `enforcePublicRateLimit(`（`src/helpers/publicRateLimit.ts`） |
| 手書き（`Number.isNaN` / 範囲チェック等） | `checkSecondFactorRateLimit(`（`src/helpers/totpGuard.ts`） |
| | `createInMemoryRateLimiter(`（`csp-report` のみ） |

確実なのは `VALIDATION_ERROR` / `HTTP_STATUS.BAD_REQUEST` の出現行と、上記
レート制限呼び出しの行番号を**ハンドラ単位で**比較する方法。

### 公開ルート（未認証で叩ける）

`src/helpers/publicRateLimit.ts` の `enforcePublicRateLimit` を使う。識別子は
認証済みならユーザーID、そうでなければ送信元IP。**どちらも検証より前に確定する
ので原則どおり**に置く（`movies` / `movies/[id]` / `movies/search` /
`movies/genres` / `person/[id]`）。

⚠️ このヘルパーは2つの条件で**制限を掛けずに通す**（fail-open）。順序を正しく
しても保護が無い場合があることに注意。

- service role クライアントを作れない（環境変数未設定）— `publicRateLimit.ts:52`
- 未認証かつ送信元IPが `unknown` — 同 `:66`（本番の Vercel エッジでは発生しない）

同じく `auth/password-reset/confirm` も `clientIp === 'unknown'` のときは
レート制限そのものを実行しない（`route.ts:58`）。

## 【必須】レスポンス形式

- 統一エラーレスポンス形式を使用する
