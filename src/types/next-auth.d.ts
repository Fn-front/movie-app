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
    };
  }

  interface User {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    role: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    name: string | null;
    picture: string | null;
    role: string;
    passwordChangedAt: string | null;
    lastPasswordCheck: number;
    issuedAt?: number;
    invalidated?: boolean;
  }
}
