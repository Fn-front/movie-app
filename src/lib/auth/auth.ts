/**
 * NextAuth.js v5 設定
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

import { AUTH_ERROR_MESSAGES } from '@/constants';
import { OTP_CONFIG } from '@/constants/otp';
import { checkRateLimit, resetRateLimit } from '@/lib/rateLimit/rateLimit';

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
      },
      async authorize(credentials) {
        if (!supabase) {
          throw new Error(AUTH_ERROR_MESSAGES.DB_CONNECTION_ERROR);
        }

        if (!credentials?.email) {
          throw new Error(AUTH_ERROR_MESSAGES.CREDENTIALS_REQUIRED);
        }

        const email = credentials.email as string;
        const loginMethod = (credentials.loginMethod as string) || 'password';

        // レート制限チェック（emailベース: 3回失敗で30分ロック）
        const rateLimitResult = await checkRateLimit(supabase, email, 'login');

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

        if (loginMethod === 'otp') {
          // メール認証チェック
          if (!user.is_verified) {
            throw new Error(AUTH_ERROR_MESSAGES.EMAIL_NOT_VERIFIED);
          }

          // OTPログイン: otp_codesのverified_atを確認
          const { data: verifiedOtp } = await supabase
            .from('otp_codes')
            .select('id, verified_at')
            .eq('email', email)
            .eq('action_type', 'login')
            .not('verified_at', 'is', null)
            .order('verified_at', { ascending: false })
            .limit(1)
            .single();

          if (!verifiedOtp) {
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
        }

        // 認証成功 — レート制限リセット
        await resetRateLimit(supabase, email, 'login');

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar_url,
          role: user.role,
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
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24時間
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  callbacks: {
    async signIn({ user, account, profile }) {
      // Credentials Providerはそのまま通す
      if (account?.provider === 'credentials') {
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

      const email = user.email;

      // 既存ユーザーを検索
      const { data: existingUser, error: findError } = await supabase
        .from('users')
        .select('id, avatar_url')
        .eq('email', email)
        .single();

      // DBエラー（"not found"以外）は失敗とする
      if (findError && findError.code !== 'PGRST116') {
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

      // accountsテーブルにプロバイダー情報を upsert
      const { error: accountError } = await supabase.from('accounts').upsert(
        {
          user_id: userId,
          provider: account.provider,
          provider_account_id: account.providerAccountId,
          type: account.type ?? 'oauth',
          access_token: account.access_token ?? null,
          refresh_token: account.refresh_token ?? null,
          expires_at: account.expires_at ?? null,
          token_type: account.token_type ?? null,
          scope: account.scope ?? null,
          id_token: account.id_token ?? null,
        },
        { onConflict: 'provider,provider_account_id' },
      );

      if (accountError) {
        return false;
      }

      // userオブジェクトにidをセット（jwtコールバックで使用）
      user.id = userId;

      return true;
    },

    async jwt({ token, user, account }) {
      // 初回ログイン時にユーザー情報をトークンに追加
      if (user) {
        if (account?.provider && account.provider !== 'credentials') {
          // OAuthログイン: DBからユーザー情報を取得
          token.id = user.id;
          token.email = user.email;
          token.name = user.name;
          token.picture = user.image;
          token.role = 'user';
          token.passwordChangedAt = null;
          token.lastPasswordCheck = Date.now();

          if (supabase && user.id) {
            const { data: dbUser } = await supabase
              .from('users')
              .select('role, password_changed_at')
              .eq('id', user.id)
              .single();

            if (dbUser) {
              token.role = dbUser.role ?? 'user';
              token.passwordChangedAt = dbUser.password_changed_at ?? null;
            }
          }
        } else {
          // Credentialsログイン
          token.id = user.id;
          token.email = user.email;
          token.name = user.name;
          token.picture = user.image;
          token.role = user.role;
          token.passwordChangedAt =
            (user as unknown as { passwordChangedAt: string | null })
              .passwordChangedAt ?? null;
          token.lastPasswordCheck = Date.now();
        }
      }

      // パスワード変更によるセッション無効化チェック（5分間隔）
      if (token.id && supabase && !token.invalidated) {
        const now = Date.now();
        const CHECK_INTERVAL = 5 * 60 * 1000; // 5分

        if (now - (token.lastPasswordCheck || 0) > CHECK_INTERVAL) {
          const { data } = await supabase
            .from('users')
            .select('password_changed_at')
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

          token.lastPasswordCheck = now;
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
        return session;
      }

      // セッションにユーザー情報を追加
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string | null;
        session.user.image = token.picture as string | null;
        session.user.role = token.role as string;
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

  // デバッグモード（開発環境のみ）
  debug: process.env.NODE_ENV === 'development',
});
