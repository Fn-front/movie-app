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
  SESSION_CONFIG,
  ROUTES,
  SUPABASE_ERROR_CODE,
  LOGIN_METHOD,
  USER_ROLE,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { OTP_ACTION, OTP_CONFIG } from '@/constants/otp';
import { isSessionExpired } from '@/lib/auth/sessionExpiry';
import { hashVerificationToken } from '@/lib/otp/verificationToken';
import { fetchVerifiedGitHubProfile } from '@/lib/auth/githubProfile';
import { getClientIp } from '@/lib/http/getClientIp';
import { buildLoginIdentifier } from '@/lib/rateLimit/loginIdentifier';
import { checkRateLimit, resetRateLimit } from '@/lib/rateLimit/rateLimit';
import {
  isTotpEnabled,
  TOTP_VERIFY_RESULT,
  verifySecondFactor,
} from '@/lib/auth/totpVerification';
import { CredentialsSignInError } from '@/lib/auth/authErrors';

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
        loginMethod: { label: 'Login Method', type: 'text' },
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

        const email = credentials.email as string;
        const loginMethod =
          (credentials.loginMethod as string) || LOGIN_METHOD.PASSWORD;

        const clientIp = getClientIp(request);
        const loginIdentifier = buildLoginIdentifier(email, clientIp);

        // 送信元単位のレート制限。1つの送信元からの大量試行を止める
        if (clientIp !== 'unknown') {
          const ipLimitResult = await checkRateLimit(
            supabase,
            clientIp,
            RATE_LIMIT_ACTION.LOGIN_IP,
            RATE_LIMIT_CONFIG.LOGIN_IP.maxAttempts,
            RATE_LIMIT_CONFIG.LOGIN_IP.windowMinutes,
          );

          if (!ipLimitResult.allowed) {
            throw new Error(AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED);
          }
        }

        // アカウント×送信元のレート制限。
        // 識別子に送信元を含めるため、第三者が誤ったパスワードを試しても
        // ロックされるのはその第三者自身であり、正当な利用者は締め出されない
        const rateLimitResult = await checkRateLimit(
          supabase,
          loginIdentifier,
          OTP_ACTION.LOGIN,
          RATE_LIMIT_CONFIG.LOGIN_ACCOUNT.maxAttempts,
          RATE_LIMIT_CONFIG.LOGIN_ACCOUNT.windowMinutes,
        );

        if (!rateLimitResult.allowed) {
          throw new Error(AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED);
        }

        // ユーザー取得
        const { data: user, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .single();

        if (error || !user) {
          throw new Error(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
        }

        if (loginMethod === LOGIN_METHOD.OTP) {
          // メール認証チェック
          if (!user.is_verified) {
            throw new Error(AUTH_ERROR_MESSAGES.EMAIL_NOT_VERIFIED);
          }

          // 二段階認証が有効なら、この経路は使わせない。
          // メールのコードだけで入れる経路は「第2要素」ではなく
          // 「パスワードの代替」であり、残すと最も弱い経路が全体の強度を
          // 決めてしまう（#642）。パスワードを忘れた場合はリセットで復旧する
          if (await isTotpEnabled(supabase, user.id)) {
            throw new CredentialsSignInError(
              AUTH_ERROR_CODE.OTP_LOGIN_DISABLED,
            );
          }

          // OTPログイン: otp/verify が発行した検証済みトークンで本人確認する。
          // メールアドレスで行を引くと、被害者が検証を終えた直後に第三者が
          // email だけでログインできてしまうため、トークンハッシュで引く。
          const verificationToken = credentials.verificationToken as
            | string
            | undefined;

          if (!verificationToken) {
            throw new Error(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
          }

          const { data: verifiedOtp } = await supabase
            .from('otp_codes')
            .select('id, email, verified_at')
            .eq(
              'verification_token_hash',
              hashVerificationToken(verificationToken),
            )
            .eq('action_type', OTP_ACTION.LOGIN)
            .single();

          // トークンが示す行のメールアドレスと、ログイン対象が一致すること。
          // 別アカウントのトークンで成り代わるのを防ぐ
          if (!verifiedOtp || verifiedOtp.email !== email) {
            throw new Error(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
          }

          // 検証済みOTPの有効期限チェック（verified_atから5分以内）
          const verifiedAt = new Date(verifiedOtp.verified_at).getTime();
          const expiryMs = OTP_CONFIG.VERIFIED_TOKEN_EXPIRY_MINUTES * 60 * 1000;

          if (Date.now() - verifiedAt > expiryMs) {
            // 期限切れのOTPを削除
            await supabase.from('otp_codes').delete().eq('id', verifiedOtp.id);
            throw new Error(AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS);
          }

          // 検証済みOTPを削除（ワンタイム使用）
          await supabase.from('otp_codes').delete().eq('id', verifiedOtp.id);
        } else {
          // パスワードログイン
          if (!credentials?.password) {
            throw new Error(AUTH_ERROR_MESSAGES.CREDENTIALS_REQUIRED);
          }

          const password = credentials.password as string;

          // メール認証チェック（パスワード照合前に実施し、不要なbcrypt計算を回避）
          if (!user.is_verified) {
            throw new Error(AUTH_ERROR_MESSAGES.EMAIL_NOT_VERIFIED);
          }

          // パスワード未設定（ソーシャルログインのみのユーザー）
          if (!user.password_hash) {
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

          // 第2要素。パスワードが正しいことを確かめてからでないと、
          // 「二段階認証を使っているアカウントかどうか」を第三者に教えてしまう
          if (await isTotpEnabled(supabase, user.id)) {
            const totpCode = (
              credentials.totpCode as string | undefined
            )?.trim();

            if (!totpCode) {
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

            if (verifyResult === TOTP_VERIFY_RESULT.REUSED) {
              throw new CredentialsSignInError(AUTH_ERROR_CODE.TOTP_REUSED);
            }

            if (verifyResult !== TOTP_VERIFY_RESULT.SUCCESS) {
              throw new CredentialsSignInError(AUTH_ERROR_CODE.TOTP_INVALID);
            }

            await resetRateLimit(
              supabase,
              user.id,
              RATE_LIMIT_ACTION.TOTP_VERIFY,
            );
          }
        }

        // 認証成功 — レート制限リセット。
        // 送信元単位（LOGIN_IP）はリセットしない。正当なログイン1回で、
        // 同じ送信元からの総当たり分までご破算になってしまうため
        await resetRateLimit(supabase, loginIdentifier, OTP_ACTION.LOGIN);

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

      const email = user.email;

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
          token.lastPasswordCheck = Date.now();
          token.lastLoginUpdate = Date.now();
          token.issuedAt = Date.now();
          token.totpPending = false;

          if (supabase && user.id) {
            const { data: dbUser } = await supabase
              .from('users')
              .select('role, password_hash, password_changed_at')
              .eq('id', user.id)
              .single();

            if (dbUser) {
              token.role = dbUser.role ?? USER_ROLE.USER;
              token.hasPassword = Boolean(dbUser.password_hash);
              token.passwordChangedAt = dbUser.password_changed_at ?? null;
            }

            // OAuth は Credentials と違い authorize を通らないため、
            // 第2要素はここで要求する。プロバイダ側の2FA設定に依存せず、
            // このアプリ独自の第2要素を必ず挟む
            token.totpPending = await isTotpEnabled(supabase, user.id);
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

      // 第2要素の検証（OAuth 経路の続き）。
      //
      // 検証はここで行う。クライアントから渡せるのは入力されたコードだけで、
      // 「検証済み」という結果そのものは渡せない。
      if (trigger === 'update' && token.totpPending && supabase && token.id) {
        const totpCode = (session as { totpCode?: unknown } | undefined)
          ?.totpCode;

        if (typeof totpCode === 'string' && totpCode.trim()) {
          const totpLimitResult = await checkRateLimit(
            supabase,
            token.id,
            RATE_LIMIT_ACTION.TOTP_VERIFY,
            RATE_LIMIT_CONFIG.TOTP_VERIFY.maxAttempts,
            RATE_LIMIT_CONFIG.TOTP_VERIFY.windowMinutes,
          );

          if (totpLimitResult.allowed) {
            const verifyResult = await verifySecondFactor(
              supabase,
              token.id,
              totpCode.trim(),
            );

            if (verifyResult === TOTP_VERIFY_RESULT.SUCCESS) {
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
          const { data } = await supabase
            .from('users')
            .select('password_hash, password_changed_at')
            .eq('id', token.id)
            .single();

          if (data?.password_changed_at) {
            const dbChangedAt = new Date(data.password_changed_at).getTime();
            const tokenChangedAt = token.passwordChangedAt
              ? new Date(token.passwordChangedAt).getTime()
              : 0;

            if (dbChangedAt > tokenChangedAt) {
              // パスワードが変更された — セッション無効化
              token.invalidated = true;
              return token;
            }
          }

          // パスワード未設定だったユーザーが設定した場合に追従する
          // （パスワード変更フォームが「現在のパスワード」欄を出すかの判定に使う）
          if (data) {
            token.hasPassword = Boolean(data.password_hash);
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
      name:
        process.env.NODE_ENV === 'production'
          ? '__Secure-next-auth.session-token'
          : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  // デバッグモード（AUTH_DEBUG=true で明示的に有効化）
  debug: process.env.AUTH_DEBUG === 'true',
});
