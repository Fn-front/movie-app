/**
 * NextAuth.js 型定義拡張
 */

import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      image: string | null;
      role: string;
      /** パスワードが設定済みか（ソーシャルログインのみのユーザーは false） */
      hasPassword: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    role: string;
    hasPassword: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    name: string | null;
    picture: string | null;
    role: string;
    hasPassword: boolean;
    passwordChangedAt: string | null;
    lastPasswordCheck: number;
    lastLoginUpdate?: number;
    issuedAt?: number;
    invalidated?: boolean;
  }
}
