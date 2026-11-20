/**
 * CRON の失敗をメールで通知する（#979）
 *
 * CRON の失敗は `console.error` と Vercel の実行履歴に残るだけで、
 * 誰も見なければ気づけなかった。**単発の失敗より恒常的な失敗が怖い。**
 *
 *   `CRON_SECRET` の不一致      → 全 CRON が 401 で素通り。画面は正常に見える
 *   service role キーの失効     → 全 CRON が DB 接続エラー
 *   TMDb / OpenAI のキーの失効  → 同期とレコメンドだけが静かに止まる
 *
 * とくに `/api/cron/cleanup-expired-records` は**個人データの消去**なので、
 * 止まっていることに気づけないのが問題そのもの（#933 / #978 / #1300）。
 *
 * ⚠️ 外部のエラートラッキングは入れない。既にある Resend で足りるし、
 * `.claude/CLAUDE.md` の「不要な外部依存を追加しない」に沿う。
 */

import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';

import { APP_NAME } from '@/constants/app';
import { DEFAULT_FROM_EMAIL } from '@/constants/email';
import { RATE_LIMIT_ACTION, RATE_LIMIT_CONFIG } from '@/constants/rateLimit';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL;

/** 通知の内容 */
export interface CronFailureNotice {
  /** CRON の名前（`cleanup-expired-records` 等）。連投抑止の識別子にも使う */
  cronName: string;
  /** 何が起きたか。メール本文に入る */
  reason: string;
}

/**
 * 同じ CRON の通知を1日1通に抑えてよいか
 *
 * ⚠️ **判定できないときは送る（fail-open）。** 他のレート制限とは逆向き。
 * ここが数えているのは「通知を送った回数」だけで、落ちても誰も困らない。
 * 黙ると**アラートそのものが失われる**ので、重複して届くほうがましと判断する。
 */
async function shouldNotify(
  supabase: SupabaseClient,
  cronName: string,
): Promise<boolean> {
  try {
    const result = await checkRateLimit(
      supabase,
      cronName,
      RATE_LIMIT_ACTION.CRON_FAILURE_NOTICE,
      RATE_LIMIT_CONFIG.CRON_FAILURE_NOTICE.maxAttempts,
      RATE_LIMIT_CONFIG.CRON_FAILURE_NOTICE.windowMinutes,
    );

    return result.allowed;
  } catch (error) {
    console.error(
      `[notifyCronFailure] 連投抑止の判定に失敗（通知は送ります）: ${cronName}`,
      error,
    );
    return true;
  }
}

/**
 * CRON の失敗を通知する
 *
 * ⚠️ **この関数は throw しない。** 呼び出し側は CRON の catch 節で、
 * 既にレスポンスを決めた後に呼ぶ。ここで例外を漏らすと、通知が送れない
 * だけで済むはずの障害がルートの応答まで壊す
 * （`sendPasswordInvalidatedEmail` と同じ契約）。
 *
 * @param supabase - service role クライアント。null なら連投抑止を諦めて送る
 * @param notice - CRON 名と理由
 * @returns 送信できたかどうか（送らなかった場合も false）
 */
export async function notifyCronFailure(
  supabase: SupabaseClient | null,
  { cronName, reason }: CronFailureNotice,
): Promise<boolean> {
  // 宛先が無ければ何もしない。
  //
  // ⚠️ ここで throw しない。通知先を設定していない環境（ローカル・プレビュー）
  // でも CRON は動くし、設定漏れで本処理を壊す理由が無い
  const to = process.env.CRON_ALERT_EMAIL;

  if (!to) {
    console.warn(
      `[notifyCronFailure] CRON_ALERT_EMAIL が未設定のため通知しません: ${cronName}`,
    );
    return false;
  }

  if (!resendApiKey) {
    console.error('[notifyCronFailure] RESEND_API_KEY is not configured');
    return false;
  }

  // ⚠️ 以降はすべて try の中に閉じる（この関数は throw しない契約）
  try {
    // supabase が無いのは「DB へ繋げないこと自体が失敗の原因」のケース。
    // 連投抑止はできないが、そういうときこそ通知が要る
    if (supabase && !(await shouldNotify(supabase, cronName))) {
      return false;
    }

    const resend = new Resend(resendApiKey);

    const { error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to,
      subject: `[${APP_NAME}] CRON が失敗しました: ${cronName}`,
      text: [
        'CRON の実行に失敗しました。',
        '',
        `CRON: ${cronName}`,
        `理由: ${reason}`,
        '',
        '同じ CRON の通知は1日1通に抑えています。',
        '復旧しても通知は出ないため、沈黙は「正常」を意味しません。',
        'Vercel の実行履歴で結果を確認してください。',
      ].join('\n'),
    });

    if (error) {
      console.error('[notifyCronFailure] 通知の送信に失敗:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[notifyCronFailure] 通知の送信に失敗:', error);
    return false;
  }
}
