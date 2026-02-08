/**
 * NextAuth.js v5 設定
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

import { AUTH_ERROR_MESSAGES } from '@/constants';

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
      },
      async authorize(credentials) {
        if (!supabase) {
          throw new Error(AUTH_ERROR_MESSAGES.DB_CONNECTION_ERROR);
        }

        if (!credentials?.email || !credentials?.password) {
          throw new Error(AUTH_ERROR_MESSAGES.CREDENTIALS_REQUIRED);
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        // ユーザー取得
        const { data: user, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .single();

        if (error || !user) {
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

        // 認証成功
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
    async jwt({ token, user }) {
      // 初回ログイン時にユーザー情報をトークンに追加
      if (user) {
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
