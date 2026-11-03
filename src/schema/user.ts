/**
 * ユーザー設定関連のバリデーションスキーマ
 */

import { z } from 'zod';

import { COOKIE_CONSENT_VALUES, STREAMING_SCOPE_VALUES } from '@/constants';
import type { ConsentValue, StreamingScope } from '@/constants';

/**
 * テーマの選択肢
 * `system` は OS 設定（prefers-color-scheme）に追従する未設定既定値。
 * 切り替えUI（スイッチ/RadioGroup）はライト/ダークの2択で、明示操作時は
 * light/dark を保存する。system は主に未設定ユーザーの既定として使う。
 */
export const THEME_VALUES = ['light', 'dark', 'system'] as const;

/**
 * 表示名更新のバリデーションスキーマ
 */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(1, '表示名を入力してください')
    .max(100, '表示名は100文字以内で入力してください')
    .regex(/\S/, '空白のみの表示名は使用できません'),
});

/**
 * 表示名更新フォームの型
 */
export type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;

/**
 * ユーザー設定更新のバリデーションスキーマ
 *
 * `cookieConsentAt` に offset を許すのは、クライアントが送る値が
 * `toISOString()` の `…Z` だけでなく、サーバーから降ろした PostgREST 形式
 * （`…+00:00`）の往復でも成立する必要があるため。
 *
 * `cookieConsentVersion` は受け付けない。版をクライアント申告にすると、
 * 版だけ単独で送って古い同意を現行版に見せかけ、再同意を回避できてしまう。
 * サーバーが自分の COOKIE_CONSENT_VERSION を書く。
 * なお z.object は未知のキーを黙って除去するだけで 400 にはしない。
 */
export const updateSettingsSchema = z
  .object({
    theme: z.enum(THEME_VALUES).optional(),
    notificationEnabled: z.boolean().optional(),
    /** ウォッチリストで「配信中」とみなす範囲 */
    streamingNoticeScope: z.enum(STREAMING_SCOPE_VALUES).optional(),
    /** アクセス解析Cookieへの同意状態 */
    cookieConsent: z.enum(COOKIE_CONSENT_VALUES).optional(),
    /** 同意／撤回した日時 */
    cookieConsentAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    // 片方だけ送れると、状態を変えずに同意日時だけ任意の過去値へ
    // 書き換えられる（証跡の改ざん）
    const hasState = value.cookieConsent !== undefined;
    const hasAt = value.cookieConsentAt !== undefined;
    if (hasState === hasAt) return;

    ctx.addIssue({
      code: 'custom',
      path: [hasState ? 'cookieConsentAt' : 'cookieConsent'],
      message:
        'cookieConsent と cookieConsentAt は必ずセットで指定してください',
    });
  });

/**
 * ユーザー設定更新の型
 */
export type UpdateSettingsFormData = z.infer<typeof updateSettingsSchema>;

/**
 * 同意状態と日時はペアでのみ指定できる
 *
 * スキーマ側の superRefine と同じ制約を型でも表し、片方だけ渡すコードが
 * 型を通って実行時 400 になるのを防ぐ。
 */
type ConsentPairInput =
  | { cookieConsent: ConsentValue; cookieConsentAt: string | null }
  | { cookieConsent?: undefined; cookieConsentAt?: undefined };

/**
 * `updateSettings` の引数型
 *
 * `Partial<UserSettings>` ではペアの制約を表せず、サーバーが書く
 * `cookieConsentVersion` まで渡せてしまうため専用に定義する。
 */
export type UpdateSettingsInput = {
  theme?: (typeof THEME_VALUES)[number];
  notificationEnabled?: boolean;
  streamingNoticeScope?: StreamingScope;
} & ConsentPairInput;

/**
 * ユーザー設定のレスポンス型
 */
export interface UserSettings {
  theme: (typeof THEME_VALUES)[number];
  notificationEnabled: boolean;
  /** ウォッチリストで「配信中」とみなす範囲 */
  streamingNoticeScope: StreamingScope;
  /** アクセス解析Cookieへの同意状態 */
  cookieConsent: ConsentValue;
  /** 同意／撤回した日時。未記録なら null */
  cookieConsentAt: string | null;
  /** 同意した時点のポリシー版。移行前の行は null */
  cookieConsentVersion: number | null;
}
