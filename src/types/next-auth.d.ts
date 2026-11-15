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
    /**
     * 第2要素（二段階認証コード）の入力が未了か。
     *
     * true のとき `user` は空にしてある。proxy を通らない `/api/*` から
     * 認証コード未入力のまま使われるのを防ぐため、「ログイン済み」として
     * 扱わない。画面遷移の判定にはこのフラグを使う。
     */
    totpPending?: boolean;
    /**
     * 第2要素を**検証できなかった**か（#1148）。
     *
     * DB の不調などで確認そのものが成立しなかったときに true になる。
     * 「コードが違う」とは別物で、入れ直しても直らない。画面はこれを見て
     * 「一時的に確認できません」を出し分ける。
     */
    totpUnavailable?: boolean;
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
    /** 第2要素の入力が未了か。認証コードの検証に成功すると false になる */
    totpPending?: boolean;
    /**
     * 第2要素を検証できなかったか（#1148）。
     *
     * jwt コールバックの冒頭で毎回消すので、**その回の結果だけ**を表す。
     * 残ると復旧後も「一時的に確認できません」が出続ける
     */
    totpUnavailable?: boolean;
  }
}
