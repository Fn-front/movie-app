/**
 * ユーザー関連の定数
 */

import { errorMessage, successMessage } from './common';

/**
 * 設定エラーメッセージ
 */
export const SETTINGS_ERROR_MESSAGES = {
  FETCH_FAILED: errorMessage.fetchFailed('設定'),
  UPDATE_FAILED: errorMessage.updateFailed('設定'),
} as const;

/**
 * 設定成功メッセージ
 */
export const SETTINGS_SUCCESS_MESSAGES = {
  UPDATED: successMessage.updated('設定'),
} as const;

/**
 * プロフィールエラーメッセージ
 */
export const PROFILE_ERROR_MESSAGES = {
  UPDATE_FAILED: errorMessage.updateFailed('表示名'),
} as const;

/**
 * プロフィール成功メッセージ
 */
export const PROFILE_SUCCESS_MESSAGES = {
  UPDATED: successMessage.updated('表示名'),
} as const;

/**
 * アクセス解析Cookieへの同意状態として保存・送信しうる値
 *
 * UI が扱う `CookieConsentState` には、ハイドレート前を表す `unknown` が
 * 加わる。`unknown` はクライアント内部の表現であり、localStorage にも
 * API にも流さないため、ここには含めない。
 */
export const COOKIE_CONSENT_VALUES = ['unset', 'granted', 'denied'] as const;

/**
 * 同意状態（保存・API 用の3値）
 */
export type ConsentValue = (typeof COOKIE_CONSENT_VALUES)[number];

/**
 * 同意を取得した時点のポリシー版
 *
 * 外部送信先やプライバシーポリシーの内容が変わったらこの値を上げる。
 * 上げると、古い版で得た同意は「未決定」として扱われバナーが再表示される
 * （記録自体は端末・サーバーとも消さない）。
 */
export const COOKIE_CONSENT_VERSION = 1;

/**
 * Cookie同意まわりの文言
 */
export const COOKIE_CONSENT_MESSAGES = {
  /** 同意の意思表示は端末に残っているので、失敗を過大に伝えない */
  SYNC_FAILED_TITLE: '設定の同期に失敗しました',
  SYNC_FAILED_DESCRIPTION:
    'この端末には反映済みです。他の端末への反映は次回アクセス時に再試行します。',
} as const;

/**
 * 同意日時として受け付ける下限
 *
 * 同意日時はクライアントが申告した値なので、機能が存在しなかった時期を
 * 名乗れてしまうと証跡として誤解を生む。これより前はサーバー受信時刻へ
 * クランプする。値は本機能のマイグレーション日。
 */
export const COOKIE_CONSENT_MIN_AT = '2026-11-03T00:00:00.000Z';
