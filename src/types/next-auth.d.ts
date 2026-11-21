/**
 * NextAuth.js 型定義拡張
 */

import type { SecondFactorMethod } from '@/constants/secondFactor';

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
    /**
     * 有効になっている第2要素の方式。
     *
     * `totpPending` のとき `user` を空にしているため、これが無いと画面は
     * 「認証アプリのコード」と「メールに送ったコード」を出し分けられない。
     * OAuth 側の認証は済んでいるので露出して問題ない。
     */
    secondFactorMethod?: SecondFactorMethod;
    /**
     * 第2要素のコードを**送信できなかった**か。
     *
     * `totpUnavailable`（検証できなかった）とは別物。どちらも
     * 「コードが違う」と区別しないと、届いていないコードを打ち直し続ける。
     */
    secondFactorSendFailed?: boolean;
    /**
     * 第2要素のコードが**送信上限で1通も送られなかった**か。
     *
     * `secondFactorSendFailed`（送信そのものの失敗）とは分ける。
     * どちらも「コードが違う」とは別物だが、出口が違う —— こちらは
     * リカバリーコードしか残っていない。
     */
    secondFactorSendLimited?: boolean;
    /**
     * 送信上限だが、**受信箱のコードがまだ有効**（GHSA-p899-6g7w-v7hg）
     *
     * ⚠️ `secondFactorSendLimited` と分ける。あちらは出口がリカバリーコード
     * しか無いが、こちらはメールで届いたコードがそのまま使える。
     */
    secondFactorCodeStillValid?: boolean;
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
    /** 有効になっている第2要素の方式。画面の出し分けと再送の判定に使う */
    secondFactorMethod?: SecondFactorMethod;
    /**
     * 第2要素のコードを送信できなかったか。
     *
     * jwt コールバックの冒頭で毎回消すので、**その回の結果だけ**を表す。
     * 残ると再送に成功しても「送信できませんでした」が出続ける
     */
    secondFactorSendFailed?: boolean;
    /**
     * 第2要素のコードが**送信上限で1通も送られなかった**か。
     *
     * `secondFactorSendFailed`（送信そのものの失敗）とは分ける。
     * どちらも「コードが違う」とは別物だが、出口が違う —— こちらは
     * リカバリーコードしか残っていない。
     */
    secondFactorSendLimited?: boolean;
    /** 送信上限だが受信箱のコードは有効（GHSA-p899-6g7w-v7hg） */
    secondFactorCodeStillValid?: boolean;
  }
}
