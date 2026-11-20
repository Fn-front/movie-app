/**
 * NextAuth.js v5 設定
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

import {
  AUTH_ERROR_CODE,
  AUTH_ERROR_MESSAGES,
  DUMMY_PASSWORD_HASH,
  SESSION_CONFIG,
  ROUTES,
  SUPABASE_ERROR_CODE,
  USER_ROLE,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  SECOND_FACTOR_METHOD,
  getSessionCookieName,
  getSessionCookieOptions,
} from '@/constants';
import { isSessionExpired } from '@/lib/auth/sessionExpiry';
import { fetchVerifiedGitHubProfile } from '@/lib/auth/githubProfile';
import { getClientIp } from '@/lib/http/getClientIp';
import { normalizeEmail } from '@/utils/email';
import {
  isEmailIdentifier,
  normalizeUsername,
} from '@/lib/auth/accountIdentity';
import { buildLoginIdentifier } from '@/lib/rateLimit/loginIdentifier';
import { checkRateLimit, resetRateLimit } from '@/lib/rateLimit/rateLimit';
import {
  getSecondFactorMethod,
  SECOND_FACTOR_VERIFY_RESULT,
  verifySecondFactor,
} from '@/lib/auth/secondFactor';
import {
  SEND_SECOND_FACTOR_RESULT,
  sendSecondFactorCode,
} from '@/lib/auth/sendSecondFactorCode';
import { CredentialsSignInError } from '@/lib/auth/authErrors';
import {
  lookupSessionUser,
  SESSION_USER_COLUMNS,
} from '@/lib/auth/sessionUserLookup';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ビルド時は警告のみ（実行時にエラーチェック）
if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Warning: Supabase environment variables are not defined');
}

// サービスロールキーでクライアント作成（RLSをバイパス）
const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        verificationToken: { label: 'Verification Token', type: 'text' },
        totpCode: { label: 'TOTP Code', type: 'text' },
      },
      async authorize(credentials, request) {
        if (!supabase) {
          throw new Error(AUTH_ERROR_MESSAGES.DB_CONNECTION_ERROR);
        }

        if (!credentials?.email) {
          throw new Error(AUTH_ERROR_MESSAGES.CREDENTIALS_REQUIRED);
        }

        // ログイン欄はメールアドレスとユーザー名を兼用する。ユーザー名の文字種に
        // `@` を含めないため、`@` の有無で曖昧さなく振り分けられる。
        const rawIdentifier = credentials.email as string;
        const isEmailLogin = isEmailIdentifier(rawIdentifier);

        // 表記揺れで別アカウント扱いにならないよう、DBを引く前に正規化する
        const email = isEmailLogin ? normalizeEmail(rawIdentifier) : '';
        const username = isEmailLogin ? '' : normalizeUsername(rawIdentifier);

        const clientIp = getClientIp(request);
        // レート制限の識別子は「アカウントを特定する文字列」であればよく、
        // メールかユーザー名かは問わない（buildLoginIdentifier は単純連結）。
        // 両者の文字空間は `@` の有無で分かれるため衝突しない。
        const loginIdentifier = buildLoginIdentifier(
          isEmailLogin ? email : username,
          clientIp,
        );

        // 送信元単位のレート制限。1つの送信元からの大量試行を止める
        if (clientIp !== 'unknown') {
          const ipLimitResult = await checkRateLimit(
            supabase,
            clientIp,
            RATE_LIMIT_ACTION.LOGIN_IP,
            RATE_LIMIT_CONFIG.LOGIN_IP.maxAttempts,
            RATE_LIMIT_CONFIG.LOGIN_IP.windowMinutes,
          );

          // ⚠️ `CredentialsSignInError` で投げる（#1254）。プレーンな `Error`
          // だと Auth.js が `code` を載せないため（`@auth/core/index.js:133`）、
          // クライアントで「メールアドレスまたはパスワードが正しくありません」に
          // 丸められる。**待てば直る**ことが伝わらず、打ち直すほど悪化する。
          //
          // 列挙にはならない。この判定はユーザーを引く**前**なので、
          // アカウントの有無に関係なく同じ条件で起きる
          if (!ipLimitResult.allowed) {
            throw new CredentialsSignInError(AUTH_ERROR_CODE.RATE_LIMITED);
          }
        }

        // アカウント×送信元のレート制限。
        // 識別子に送信元を含めるため、第三者が誤ったパスワードを試しても
        // ロックされるのはその第三者自身であり、正当な利用者は締め出されない
        const rateLimitResult = await checkRateLimit(
          supabase,
          loginIdentifier,
          RATE_LIMIT_ACTION.LOGIN,
          RATE_LIMIT_CONFIG.LOGIN_ACCOUNT.maxAttempts,
          RATE_LIMIT_CONFIG.LOGIN_ACCOUNT.windowMinutes,
        );

        // 理由は上の送信元単位と同じ（#1254）。こちらも識別子に
        // メールアドレスを含むが、**行を引く前**なので存在の有無で
        // 挙動が変わらず、列挙にはならない
        if (!rateLimitResult.allowed) {
          throw new CredentialsSignInError(AUTH_ERROR_CODE.RATE_LIMITED);
        }

        // ユーザー取得。
        // ユーザー名は大小文字・区切りの揺れを吸収して保存しているため、
        // 照合も正規化済みの値で行う（idx_users_username_lower と対応）。
        const { data: user, error } = isEmailLogin
          ? await supabase.from('users').select('*').eq('email', email).single()
          : await supabase
              .from('users')
              .select('*')
              .eq('username', username)
              .single();

        if (error || !user) {
          // 応答時間でアカウントの有無を判定させない（#1256）。
          //
          // ここで即 return すると「存在しない: 1ms」「存在する: ~250ms」と
          // 分かれ、メールアドレスの一覧を持つ相手が登録済みのものを時間差で
          // 絞り込める。照合相手が居ないぶんをダミーで埋めて揃える。
          //
          if (credentials?.password) {
            await bcrypt.compare(
              credentials.password as string,
              DUMMY_PASSWORD_HASH,
            );
          }

          throw new Error(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
        }

        // パスワードログイン
        if (!credentials?.password) {
          throw new Error(AUTH_ERROR_MESSAGES.CREDENTIALS_REQUIRED);
        }

        const password = credentials.password as string;

        // パスワード未設定（ソーシャルログインのみのユーザー）
        if (!user.password_hash) {
          // 上と同じ理由（#1256）。ここも照合相手が居ないので、
          // 即 return すると「ソーシャル専用アカウントである」ことが
          // 応答時間で分かる
          await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
          throw new Error(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
        }

        // パスワード照合
        const isPasswordValid = await bcrypt.compare(
          password,
          user.password_hash,
        );

        if (!isPasswordValid) {
          throw new Error(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
        }

        // メール認証チェック（#1247）
        //
        // ⚠️ **パスワード照合の後に置く。** 以前は前にあり
        // （「不要なbcrypt計算を回避」）、プレーンな `Error` を投げていた。
        // Auth.js はプレーンな Error に `code` を載せないため、画面には
        // 「メールアドレスまたはパスワードが正しくありません」としか出ず、
        // **パスワードは正しいのに**理由が分からないまま詰んでいた。
        //
        // 理由を返すには、パスワードを知らない相手に返さないことが前提に
        // なる。でないと「このメールは登録済み」が漏れてアカウント列挙を
        // 許す。すぐ下の第2要素と同じ理屈で、照合の後ろへ移した。
        //
        // 代償として未認証ユーザーへの試行でも bcrypt が走るが、ここは
        // `login` のレート制限を通過した後なので許容する
        if (!user.is_verified) {
          throw new CredentialsSignInError(AUTH_ERROR_CODE.EMAIL_NOT_VERIFIED);
        }

        // 第2要素。パスワードが正しいことを確かめてからでないと、
        // 「二段階認証を使っているアカウントかどうか」を第三者に教えてしまう
        const secondFactorMethod = await getSecondFactorMethod(
          supabase,
          user.id,
        );

        if (secondFactorMethod) {
          const totpCode = (credentials.totpCode as string | undefined)?.trim();

          if (!totpCode) {
            // ⚠️ ここへ到達する＝**パスワードは正しい**。
            //
            // ログインの試行回数を消費したままにすると、このあとの
            // 「コード入力 → 打ち間違え → 再送 → もう一度打ち間違え」で
            // 5回/30分をすぐ使い切る。メールOTP は遅延・迷惑メール振り分け・
            // コピペミスがあるぶん、TOTP より到達しやすい。
            //
            // 解放してもパスワードを知らない相手には枠が減ったまま残る
            // （:324 の成功時リセットと同じ理屈）。
            //
            // ⚠️ 逆に「コード未入力のときは消費しない」と書いてはいけない。
            // 判定がパスワード照合より後ろへ動き、パスワードが違う
            // リクエストが枠を一度も消費しなくなって**アカウント単位の
            // 5回/30分が消滅する**。残るのは LOGIN_IP だけで、
            // clientIp が unknown なら丸ごとスキップされる
            await resetRateLimit(
              supabase,
              loginIdentifier,
              RATE_LIMIT_ACTION.LOGIN,
            );

            if (secondFactorMethod === SECOND_FACTOR_METHOD.EMAIL_OTP) {
              // ⚠️ 宛先は `user.email`。スコープにある `email` ローカル変数は
              // ユーザー名ログインで空文字になり、全ユーザー名アカウントが
              // `otp_codes.email = ''` の1行を共有してコードが混線する
              const sendResult = await sendSecondFactorCode(
                supabase,
                user.id,
                user.email,
              );

              if (sendResult === SEND_SECOND_FACTOR_RESULT.SEND_FAILED) {
                // 「コードが違う」と区別する。打ち直しても直らない（#1148）
                throw new CredentialsSignInError(
                  AUTH_ERROR_CODE.SECOND_FACTOR_SEND_FAILED,
                );
              }

              if (sendResult === SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED) {
                // 1通も送っていない。コードを待たせず、
                // リカバリーコードへ誘導する
                throw new CredentialsSignInError(
                  AUTH_ERROR_CODE.SECOND_FACTOR_SEND_LIMITED,
                );
              }

              // SENT / THROTTLED。THROTTLED は直前に送ったコードがまだ生きている
              throw new CredentialsSignInError(
                AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED,
              );
            }

            // クライアントはこれを受けて認証コードの入力欄を出す
            throw new CredentialsSignInError(AUTH_ERROR_CODE.TOTP_REQUIRED);
          }

          // コード自体の総当たりを止める。識別子はユーザーIDを使う
          // （ここに到達するにはパスワードが要るため、第三者が他人の
          // アカウントをロックすることはできない）
          const totpLimitResult = await checkRateLimit(
            supabase,
            user.id,
            RATE_LIMIT_ACTION.TOTP_VERIFY,
            RATE_LIMIT_CONFIG.TOTP_VERIFY.maxAttempts,
            RATE_LIMIT_CONFIG.TOTP_VERIFY.windowMinutes,
          );

          if (!totpLimitResult.allowed) {
            throw new CredentialsSignInError(AUTH_ERROR_CODE.RATE_LIMITED);
          }

          const verifyResult = await verifySecondFactor(
            supabase,
            user.id,
            totpCode,
          );

          if (verifyResult === SECOND_FACTOR_VERIFY_RESULT.REUSED) {
            throw new CredentialsSignInError(AUTH_ERROR_CODE.TOTP_REUSED);
          }

          if (verifyResult !== SECOND_FACTOR_VERIFY_RESULT.SUCCESS) {
            throw new CredentialsSignInError(AUTH_ERROR_CODE.TOTP_INVALID);
          }

          await resetRateLimit(
            supabase,
            user.id,
            RATE_LIMIT_ACTION.TOTP_VERIFY,
          );
        }

        // 認証成功 — レート制限リセット。
        // 送信元単位（LOGIN_IP）はリセットしない。正当なログイン1回で、
        // 同じ送信元からの総当たり分までご破算になってしまうため
        await resetRateLimit(
          supabase,
          loginIdentifier,
          RATE_LIMIT_ACTION.LOGIN,
        );

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar_url,
          role: user.role,
          hasPassword: Boolean(user.password_hash),
          passwordChangedAt: user.password_changed_at || null,
        };
      },
    }),

    // Google OAuth
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),

    // GitHub OAuth
    // userinfo を差し替え、検証済みメールのみを採用する。
    // 既定実装は公開メールが無いとき `primary ?? emails[0]` を verified を見ずに
    // 採用するため、未検証メールによるアカウント乗っ取りが成立しうる
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      userinfo: {
        url: 'https://api.github.com/user',
        async request({ tokens }: { tokens: { access_token?: string } }) {
          return fetchVerifiedGitHubProfile(tokens.access_token ?? '');
        },
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: SESSION_CONFIG.IDLE_MAX_AGE_S,
  },

  pages: {
    signIn: ROUTES.LOGIN,
    error: ROUTES.AUTH_ERROR,
  },

  callbacks: {
    async signIn({ user, account, profile }) {
      // Credentials Provider: last_login_at を更新して通す
      if (account?.provider === 'credentials') {
        if (supabase && user.id) {
          const { error: loginUpdateError } = await supabase
            .from('users')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', user.id);

          if (loginUpdateError) {
            console.warn(
              'Failed to update last_login_at for user:',
              loginUpdateError,
            );
          }
        }
        return true;
      }

      // OAuthログイン: アカウントリンク処理
      if (
        !supabase ||
        !account?.provider ||
        !account?.providerAccountId ||
        !user?.email
      ) {
        return false;
      }

      // メール検証状態の確認。
      // 下の処理はメール一致で既存アカウントへリンクするため、プロバイダ側で
      // 未検証のメールを信用すると、そのアドレスを自分のアカウントに追加した
      // 攻撃者が他人のアカウントへログインできてしまう。
      // Google は email_verified を返し、GitHub は userinfo 差し替えで付与している
      const emailVerified = (profile as { email_verified?: unknown } | null)
        ?.email_verified;

      if (emailVerified !== true) {
        return false;
      }

      // プロバイダが返す表記（GitHub は利用者が入力したまま保持しうる）を
      // 正規化してから既存アカウントを引く。表記違いで取りこぼすと、
      // リンクされず同一人物の重複アカウントが黙って作られる。
      const email = normalizeEmail(user.email);

      // 既存ユーザーを検索
      const { data: existingUser, error: findError } = await supabase
        .from('users')
        .select('id, avatar_url')
        .eq('email', email)
        .single();

      // DBエラー（"not found"以外）は失敗とする
      if (findError && findError.code !== SUPABASE_ERROR_CODE.NOT_FOUND) {
        return false;
      }

      let userId: string;

      if (existingUser) {
        // 既存ユーザー → アカウントリンク
        userId = existingUser.id;

        // OAuthプロフィール情報でアバターを更新（未設定の場合のみ）
        if ((profile?.image || user.image) && !existingUser.avatar_url) {
          await supabase
            .from('users')
            .update({ avatar_url: user.image ?? profile?.image ?? null })
            .eq('id', userId);
        }
      } else {
        // 新規ユーザー作成（is_verified = true）
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            email,
            name: user.name ?? null,
            avatar_url: user.image ?? null,
            is_verified: true,
          })
          .select('id')
          .single();

        if (createError || !newUser) {
          return false;
        }

        userId = newUser.id;
      }

      // accountsテーブルにプロバイダー情報を upsert。
      //
      // access_token / refresh_token / id_token は保存しない。本アプリは JWT
      // セッション戦略でアダプタを使っておらず、これらを読み出すコードが存在
      // しないため、持っていても漏洩時の被害面を広げるだけ（#650）。
      // 将来プロバイダAPIを叩く機能が必要になったら、暗号化付きで再導入する。
      const { error: accountError } = await supabase.from('accounts').upsert(
        {
          user_id: userId,
          provider: account.provider,
          provider_account_id: account.providerAccountId,
          type: account.type ?? 'oauth',
        },
        { onConflict: 'provider,provider_account_id' },
      );

      if (accountError) {
        return false;
      }

      // last_login_at を更新
      const { error: loginUpdateError } = await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', userId);

      if (loginUpdateError) {
        console.warn(
          'Failed to update last_login_at for user:',
          loginUpdateError,
        );
      }

      // userオブジェクトにidをセット（jwtコールバックで使用）
      user.id = userId;

      return true;
    },

    async jwt({ token, user, account, trigger, session }) {
      // ⚠️ **このコールバックから例外を外へ出さないこと**（#1148）。
      //
      // `@auth/core` は jwt コールバックの例外を**すべて**捕まえて
      // セッションCookieを削除する（`lib/actions/session.js` の catch）。
      // 「JWT が検証できない」ケースを想定した後始末だが、例外の種類を見ない。
      //
      // Cookie が消えると認証コード画面（/auth/two-factor）は
      // 「認証コードが正しくありません」を出し続け、利用者は OAuth ログインから
      // やり直すしかなくなる。DB の不調で詰むのは割に合わない。
      //
      // ⚠️ **本当に JWT が壊れている場合はここへ来ない。** `jwt.decode()` の
      // 失敗は同じ try の中で先に投げられ、従来どおり Cookie が消える
      // （session.js:24）。握り潰しているのは自前のコールバックの中だけ。
      try {
        // 前回の失敗を引きずらない。再試行で復旧していれば消える
        delete token.totpUnavailable;
        // 同上。消さないと「送信できませんでした」が画面に出続ける
        delete token.secondFactorSendFailed;
        delete token.secondFactorSendLimited;

        // 初回ログイン時にユーザー情報をトークンに追加
        if (user) {
          if (account?.provider && account.provider !== 'credentials') {
            // OAuthログイン: DBからユーザー情報を取得
            token.id = user.id;
            token.email = user.email;
            token.name = user.name;
            token.picture = user.image;
            token.role = USER_ROLE.USER;
            token.hasPassword = false;
            token.passwordChangedAt = null;
            token.lastLoginUpdate = Date.now();
            token.issuedAt = Date.now();
            token.totpPending = false;

            if (supabase && user.id) {
              const { data: dbUser, error: lookupError } = await supabase
                .from('users')
                .select('role, password_hash, password_changed_at')
                .eq('id', user.id)
                .single();

              // ⚠️ **`error` を捨ててはいけない**（#1207。#1193 と同じ形）。
              //
              // postgrest-js はネットワーク障害を **throw せず**
              // `{ data: null, error }` を返すため、捨てると「取得に失敗した」と
              // 「行が無い」を区別できない。ここで取り損ねたまま
              // `lastPasswordCheck` を立てると、`passwordChangedAt: null` の
              // トークンのまま**5分間、パスワード変更による失効確認が
              // 静かにスキップされる**。
              //
              // ⚠️ `PGRST116`（0件）だけは「確定した答え」なので先送りしない
              // （#1193 と同じ判断。先送りすると消えた行を毎リクエスト引き続ける）。
              const lookupFailed =
                Boolean(lookupError) &&
                lookupError?.code !== SUPABASE_ERROR_CODE.NOT_FOUND;

              if (lookupFailed) {
                console.error('OAuth sign-in user lookup failed:', lookupError);
              } else {
                if (dbUser) {
                  token.role = dbUser.role ?? USER_ROLE.USER;
                  token.hasPassword = Boolean(dbUser.password_hash);
                  token.passwordChangedAt = dbUser.password_changed_at ?? null;
                }

                // ⚠️ **確認できたときだけ立てる。** 失敗時に立てないことで、
                // 下の定期チェックが（`lastPasswordCheck` 未設定 ＝ 0 なので）
                // すぐ引き直す。引き直しも失敗した場合は、そちらの #1193 の
                // ガードが 10 秒後の再試行へ落とすので毎リクエストは叩かない
                token.lastPasswordCheck = Date.now();
              }

              // OAuth は Credentials と違い authorize を通らないため、
              // 第2要素はここで要求する。プロバイダ側の2FA設定に依存せず、
              // このアプリ独自の第2要素を必ず挟む
              //
              // ⚠️ `Boolean()` で包む。`!== null` だと、モックが未設定で
              // `undefined` を返したときに true（第2要素が有効）へ倒れる
              const oauthMethod = await getSecondFactorMethod(
                supabase,
                user.id,
              );

              token.totpPending = Boolean(oauthMethod);
              token.secondFactorMethod = oauthMethod ?? undefined;

              // メールOTP は手元でコードを作れないので、この場で送る。
              // 画面（/auth/two-factor）は `session.secondFactorMethod` を見て
              // 入力欄と再送ボタンを出し分ける
              if (
                oauthMethod === SECOND_FACTOR_METHOD.EMAIL_OTP &&
                user.email
              ) {
                const sendResult = await sendSecondFactorCode(
                  supabase,
                  user.id,
                  user.email,
                );

                // ⚠️ このコールバックからは例外を出せない（上の #1148 の注記）。
                // 送信できなかったことはフラグで画面へ伝える。
                //
                // ⚠️ `LIMIT_EXCEEDED` を取りこぼさないこと。1通も送っていないのに
                // 「メールに送ったコードを入力してください」と出すと、届かない
                // コードを待たせることになる。出口はリカバリーコードだけ
                token.secondFactorSendFailed =
                  sendResult === SEND_SECOND_FACTOR_RESULT.SEND_FAILED
                    ? true
                    : undefined;
                token.secondFactorSendLimited =
                  sendResult === SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED
                    ? true
                    : undefined;
              }
            }
          } else {
            // Credentialsログイン
            token.id = user.id;
            token.email = user.email;
            token.name = user.name;
            token.picture = user.image;
            token.role = user.role;
            token.hasPassword = Boolean(
              (user as unknown as { hasPassword?: boolean }).hasPassword,
            );
            token.passwordChangedAt =
              (user as unknown as { passwordChangedAt: string | null })
                .passwordChangedAt ?? null;
            token.lastPasswordCheck = Date.now();
            token.lastLoginUpdate = Date.now();
            token.issuedAt = Date.now();
            // Credentials 経路は authorize で第2要素まで検証済み
            token.totpPending = false;
          }
        }

        // メールアドレスの変更をセッションへ反映する（#1359）。
        //
        // ⚠️ **`token.email` は初回サインイン時にしか入らない。**
        //   代入は `if (user)` の中の2箇所だけで、`trigger === 'update'` では
        //   更新されない。`@auth/core` の `session` アクションも `newSession` を
        //   トークンへマージせず、jwt コールバックへ渡すだけ。
        //
        //   反映しないと表示が古いだけでは済まない。パスワード変更は
        //   画面が持つ旧アドレスで OTP を要求するが、送信は DB から引き直すため
        //   **コードは新アドレスへ届き、検証は旧アドレスで引いて必ず 400** になる。
        //   再ログインするまでパスワードを変更できなくなる。
        //
        // ⚠️ 第2要素の分岐（`token.totpPending` でガード）より前に置く。
        //   あちらに混ぜると、変更の反映が二段階認証の途中でしか効かない
        if (
          trigger === 'update' &&
          supabase &&
          token.id &&
          !token.totpPending
        ) {
          const { data: refreshed } = await supabase
            .from('users')
            .select('email')
            .eq('id', token.id as string)
            .single();

          // 取れなければ据え置く。握り潰してよいのは、ここで失敗しても
          // 古い値が残るだけで認証の判断には使わないため
          if (refreshed?.email) {
            token.email = refreshed.email;
          }
        }

        // 第2要素の検証（OAuth 経路の続き）。
        //
        // 検証はここで行う。クライアントから渡せるのは入力されたコードだけで、
        // 「検証済み」という結果そのものは渡せない。
        if (trigger === 'update' && token.totpPending && supabase && token.id) {
          const totpCode = (session as { totpCode?: unknown } | undefined)
            ?.totpCode;
          const resend = (session as { resend?: unknown } | undefined)?.resend;

          // メールOTP の再送。検証と同じ `update()` 経路を共有する。
          //
          // ⚠️ 画面側で検証と相互排他にすること。NextAuth の JWT は
          // ステートレスで、`update()` は「Cookie を読む → jwt → 書き戻す」を
          // 独立に行う。再送（Resend の往復で遅い）と検証（速い）が並行すると、
          // 再送が後から `totpPending: true` を書き戻して**成功した検証が
          // 巻き戻る**（`useTwoFactorChallenge` の `isSubmitting` と同じ形）。
          if (
            resend === true &&
            token.secondFactorMethod === SECOND_FACTOR_METHOD.EMAIL_OTP
          ) {
            // ⚠️ 宛先は `token.email` ではなく `users` から引く。
            // 検証側（`verifyEmailOtpCode`）も `users` を見ているので、
            // トークンの値を使うとメールアドレスを変更した利用者で
            // 送信先と照合先がずれ、コードが永久に一致しなくなる
            const { data: resendUser } = await supabase
              .from('users')
              .select('email')
              .eq('id', token.id)
              .single();

            if (resendUser?.email) {
              const sendResult = await sendSecondFactorCode(
                supabase,
                token.id,
                resendUser.email,
              );

              // 初回送信と同じ理由で LIMIT_EXCEEDED も伝える
              token.secondFactorSendFailed =
                sendResult === SEND_SECOND_FACTOR_RESULT.SEND_FAILED
                  ? true
                  : undefined;
              token.secondFactorSendLimited =
                sendResult === SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED
                  ? true
                  : undefined;
            }
          }

          if (typeof totpCode === 'string' && totpCode.trim()) {
            const totpLimitResult = await checkRateLimit(
              supabase,
              token.id,
              RATE_LIMIT_ACTION.TOTP_VERIFY,
              RATE_LIMIT_CONFIG.TOTP_VERIFY.maxAttempts,
              RATE_LIMIT_CONFIG.TOTP_VERIFY.windowMinutes,
            );

            if (totpLimitResult.allowed) {
              // ⚠️ ここから例外を外へ出さないこと。
              // `@auth/core` は jwt コールバックの例外を**すべて**捕まえて
              // セッションCookieを削除する（`lib/actions/session.js` の catch。
              // 「JWT が検証できない」ケースを想定した後始末だが、例外の種類を
              // 見ない）。Cookie が消えると認証コード画面は「正しくありません」を
              // 出し続け、利用者は OAuth ログインからやり直すしかなくなる。
              //
              // 第2要素を通さないのは DB エラーでも同じ（fail-closed は保つ）。
              // 変えるのは「セッションごと壊すか、画面に留まって再試行できるか」
              let verifyResult;
              try {
                verifyResult = await verifySecondFactor(
                  supabase,
                  token.id,
                  totpCode.trim(),
                );
              } catch (error) {
                console.error('TOTP verification failed:', error);
                // 「コードが違う」のではなく「確認できなかった」。
                // 画面の文言を分けるために区別する（#1148）
                token.totpUnavailable = true;
              }

              if (verifyResult === SECOND_FACTOR_VERIFY_RESULT.SUCCESS) {
                token.totpPending = false;
                await resetRateLimit(
                  supabase,
                  token.id,
                  RATE_LIMIT_ACTION.TOTP_VERIFY,
                );
              }
            }
          }
        }

        // 絶対有効期限チェック（ログインから7日間）
        if (!token.invalidated && isSessionExpired(token.issuedAt)) {
          token.invalidated = true;
          return token;
        }

        // パスワード変更によるセッション無効化チェック（5分間隔）
        if (token.id && supabase && !token.invalidated) {
          const now = Date.now();

          if (
            now - (token.lastPasswordCheck || 0) >
            SESSION_CONFIG.PASSWORD_CHECK_INTERVAL_MS
          ) {
            // ⚠️ 直接 supabase を叩かず `lookupSessionUser` を通す（#1281）。
            // 画面読み込みで複数のAPIが同時に飛ぶと、全部が同じ（古い）Cookie を
            // 持つのでこの窓が一斉に切れ、同じ行を人数ぶんではなく**本数ぶん**
            // 引いていた（実測: 同時5本で8回）。束を1回に畳む。
            // TTL は1秒。伸ばすと強制失効・admin 剥奪の検知が遅れる
            const { data, error: lookupError } = await lookupSessionUser(
              token.id,
              async () => {
                const { data: row, error } = await supabase
                  .from('users')
                  .select(SESSION_USER_COLUMNS)
                  .eq('id', token.id as string)
                  .single();

                // ⚠️ `password_hash` はキャッシュに載せる前に捨てる。
                // 要るのは「設定されているか」だけで、bcrypt ハッシュを
                // プロセス内に置き続ける理由が無い
                return {
                  data: row
                    ? {
                        hasPassword: Boolean(row.password_hash),
                        passwordChangedAt: row.password_changed_at,
                        role: row.role,
                      }
                    : null,
                  error,
                };
              },
              now,
            );

            // ⚠️ **`error` を捨ててはいけない**（#1193）。
            //
            // postgrest-js はネットワーク障害を **throw せず**
            // `{ data: null, error }` を返す（`PostgrestBuilder.ts` の
            // `res.catch(...)`）。捨てると「取得に失敗した」と
            // 「行が無い」を区別できず、確認を終えたことにして
            // `lastPasswordCheck` を進めてしまう。
            // その結果、**パスワード変更による強制失効の確認が5分間
            // 静かにスキップされる**（admin 剥奪の追従も同じ）。
            //
            // ⚠️ **`PGRST116`（0件）以外はすべて先送りする。**
            // 「`code` が空のときだけ」に狭めてはいけない。postgrest-js が
            // `code: ''` を入れるのは伝送路の失敗だけで、PostgREST が返す
            // エラー（権限 `42501` / タイムアウト `57014` 等）は実際のコード、
            // 非JSONのエラーボディ（ゲートウェイの 502 等）では `undefined`
            // になる。狭めるとそれらで本件が再発する。
            //
            // `PGRST116` だけは「確定した答え」なので先送りしない。
            // 先送りすると、消えた行を毎リクエスト引き続けることになる。
            if (
              lookupError &&
              lookupError.code !== SUPABASE_ERROR_CODE.NOT_FOUND
            ) {
              console.error('Password change check failed:', lookupError);

              // ⚠️ 据え置きではなく**短く待つ**。権限事故やスキーマキャッシュの
              // ような恒久的な失敗では、据え置くと毎リクエスト引き直して
              // 弱っているDBを押し続ける。失効の窓は 5分 → 10秒 に縮む
              token.lastPasswordCheck =
                now -
                SESSION_CONFIG.PASSWORD_CHECK_INTERVAL_MS +
                SESSION_CONFIG.PASSWORD_CHECK_RETRY_MS;
              return token;
            }

            if (data?.passwordChangedAt) {
              const dbChangedAt = new Date(data.passwordChangedAt).getTime();

              // ⚠️ ベースラインが無いときは **0 ではなく発行時刻**に倒す（#1207）。
              //
              // `passwordChangedAt` が無いのは2通りある。「一度も変更して
              // いない」と「**取得に失敗して分からない**」。0 に倒すと後者が
              // 必ず `dbChangedAt > 0` になり、変更されていないのに失効する。
              //
              // 実際に起きる。OAuth 初回で `users` の取得に失敗すると
              // `passwordChangedAt: null` のままトークンが出来上がり、DB が
              // 復旧した次の確認でこの比較に入る。対象は「一度でもパスワードを
              // 変更・リセットし、かつ同じメールで OAuth ログインする利用者」。
              //
              // 発行時刻を基準にすれば意味が変わらない。セッションは
              // 「そのパスワード変更より後」に認証されて発行されているので、
              // 過去の変更で失効させる理由が無い。発行より後の変更は
              // 従来どおり失効する
              const tokenChangedAt = token.passwordChangedAt
                ? new Date(token.passwordChangedAt).getTime()
                : (token.issuedAt ?? 0);

              if (dbChangedAt > tokenChangedAt) {
                // パスワードが変更された — セッション無効化
                token.invalidated = true;
                return token;
              }
            }

            // パスワード未設定だったユーザーが設定した場合に追従する
            // （パスワード変更フォームが「現在のパスワード」欄を出すかの判定に使う）
            if (data) {
              token.hasPassword = data.hasPassword;

              // ロールも追従させる。ログイン時にしか取らないと、admin を剥奪しても
              // トークンの絶対有効期限（7日）まで admin のまま管理機能を使えてしまう。
              // 上のパスワード確認と同じ問い合わせに相乗りするため、クエリは増えない
              token.role = data.role ?? USER_ROLE.USER;
            }

            token.lastPasswordCheck = now;
          }
        }

        // last_login_at のスロットリング更新（1時間間隔）
        if (token.id && supabase && !token.invalidated) {
          const now = Date.now();

          if (
            now - (token.lastLoginUpdate || 0) >
            SESSION_CONFIG.LOGIN_UPDATE_INTERVAL_MS
          ) {
            await supabase
              .from('users')
              .update({ last_login_at: new Date().toISOString() })
              .eq('id', token.id);

            token.lastLoginUpdate = now;
          }
        }

        return token;
      } catch (error) {
        // ⚠️⚠️ **初回サインインだけは握り潰さない。**
        //
        // この分岐（`user` がある）では `token.totpPending` の既定が false で、
        // `getSecondFactorMethod()` の結果を待って初めて true になる。そして
        // `getSecondFactorMethod` は DB エラーで**意図的に throw する**
        // （`src/lib/auth/secondFactor.ts`。false に倒すと第2要素が
        // 丸ごと飛ぶため）。
        //
        // ここで握り潰すと `totpPending: false` のトークンが返り、
        // `@auth/core` はそれをそのまま署名して Cookie を発行する。
        // **二段階認証を有効にしている OAuth 利用者が、コードを一度も
        // 入れずに7日間有効なセッションを得る。**
        //
        // `user_totp` に限局した障害（GRANT/RLS の事故・PostgREST の
        // スキーマキャッシュ・statement_timeout）では `signIn` コールバックが
        // 通ってここだけ落ちるため、現実に起こりうる。
        //
        // #1148 が塞ぎたいのは「認証コードを入力している最中」（update 経路）
        // なので、初回サインインを従来どおり失敗させても意図は損なわれない。
        if (user) throw error;

        console.error('JWT callback failed:', error);

        // 既存セッションの更新経路。トークンをそのまま返す。`totpPending` も
        // `invalidated` も維持されるので第2要素は通らないまま（fail-closed は
        // 保つ）。変わるのは「セッションごと壊すか、画面に留まって再試行
        // できるか」。
        //
        // ⚠️ 代償として、パスワード変更による強制失効の確認がこのリクエストで
        // 素通りする。`lastPasswordCheck` はクエリの後でしか更新しないので
        // 次のリクエストで再確認が走る。
        // ただし **postgrest-js はネットワーク障害を throw せず
        // `{ data: null, error }` を返す**ため、現実に多い失敗モードは
        // そもそもこの catch に来ない（別の既存問題）。
        token.totpUnavailable = true;
        return token;
      }
    },

    async session({ session, token }) {
      // 無効化されたトークンの場合、空のユーザー情報を返す
      if (token.invalidated) {
        session.user.id = '';
        session.user.email = '';
        session.user.name = null;
        session.user.image = null;
        session.user.role = '';
        session.user.hasPassword = false;
        return session;
      }

      // 第2要素が未了のセッションは「ログイン済み」として扱わない。
      // `/api/*` は proxy の判定を素通りするため、ここで空にしておかないと
      // 認証コードを入れないままAPIを使えてしまう。
      // 本人が誰かは JWT 側に残っているので、認証コードの検証は続行できる
      if (token.totpPending) {
        session.user.id = '';
        session.user.email = '';
        session.user.name = null;
        session.user.image = null;
        session.user.role = '';
        session.user.hasPassword = false;
        session.totpPending = true;
        // 第2要素を「確認できなかった」ことを画面へ伝える（#1148）。
        // コードの正誤と区別しないと、正しいコードを入れ直しても
        // 「正しくありません」が出続ける理由が利用者に分からない
        session.totpUnavailable = Boolean(token.totpUnavailable);
        // 方式を渡す。上でユーザー情報を空にしているため、これが無いと
        // 画面は「認証アプリのコード」と「メールに送ったコード」を
        // 出し分けられない。OAuth 認証は済んでいるので露出して問題ない
        session.secondFactorMethod = token.secondFactorMethod;
        // 送信そのものが成立しなかったことを伝える。
        // 「コードが違う」と同じ文言にすると、届いていないコードを
        // 打ち直し続けることになる
        session.secondFactorSendFailed = Boolean(token.secondFactorSendFailed);
        // 1通も送れていないので、コードを待たせずリカバリーコードへ誘導する
        session.secondFactorSendLimited = Boolean(
          token.secondFactorSendLimited,
        );
        return session;
      }

      // セッションにユーザー情報を追加
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string | null;
        session.user.image = token.picture as string | null;
        session.user.role = token.role as string;
        session.user.hasPassword = Boolean(token.hasPassword);
      }
      return session;
    },
  },

  // CSRF対策
  useSecureCookies: process.env.NODE_ENV === 'production',
  cookies: {
    sessionToken: {
      // proxy（失効セッションのCookie削除）と定義を共有する。
      // 片方だけ変えると別のCookieとして扱われ、削除が効かなくなる（#1174）
      name: getSessionCookieName(),
      options: getSessionCookieOptions(),
    },
  },

  // デバッグモード（AUTH_DEBUG=true で明示的に有効化）
  debug: process.env.AUTH_DEBUG === 'true',
});
