/**
 * NextAuth.js v5 設定
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Supabase environment variables are not defined');
}

// サービスロールキーでクライアント作成（RLSをバイパス）
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('メールアドレスとパスワードを入力してください');
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
          throw new Error('メールアドレスまたはパスワードが正しくありません');
        }

        // メール認証チェック
        if (!user.is_verified) {
          throw new Error('メールアドレスが認証されていません');
        }

        // パスワード照合
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
          throw new Error('メールアドレスまたはパスワードが正しくありません');
        }

        // 認証成功
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar_url,
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
      }
      return token;
    },

    async session({ session, token }) {
      // セッションにユーザー情報を追加
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string | null;
        session.user.image = token.picture as string | null;
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
