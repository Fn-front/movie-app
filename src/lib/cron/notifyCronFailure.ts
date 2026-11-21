/**
 * CRON の失敗をメールで通知する（#979）
 *
 * CRON の失敗は `console.error` と Vercel の実行履歴に残るだけで、
 * 誰も見なければ気づけなかった。**単発の失敗より恒常的な失敗が怖い。**
 *
 *   `CRON_SECRET` の未設定      → 全 CRON が 401 で素通り。画面は正常に見える
 *   service role キーの失効     → 全 CRON が DB 接続エラー
 *
 * ⚠️ **この2つしか拾えていない。** 鍵の「不一致」は意図的に通知しない
 * （`cronAuth.ts` 参照）。TMDb / OpenAI のキーが失効して同期が全件失敗する
 * ケースも、作品ごとに catch して 200 を返す設計のため乗らない（#1354）。
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
import { createInMemoryRateLimiter } from '@/lib/rateLimit/inMemoryRateLimit';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL;

/**
 * DB に依存しない最低限の歯止め（プロセス内・60秒に1通）
 *
 * ⚠️ **これが無いと「1リクエスト = Resend 1コール」になる経路がある。**
 *
 * 下の `shouldNotify` は判定できないとき通す（fail-open）。判定できないのは
 * 次の2つで、どちらも**同時に起きやすい**:
 *
 *   - service role クライアントを作れない（環境変数が入っていない）
 *   - `consume_rate_limit` が例外を返す（DB障害）
 *
 * `verifyCronAuth` は `CRON_SECRET` 未設定で通知するが、`/api/cron/*` は
 * **未認証で誰でも叩ける**。新しい環境に環境変数を入れ忘れた状態
 * ——`CRON_SECRET` も Supabase の鍵も無い —— はまさにこの組み合わせで、
 * DB の抑止が効かないまま外部から連打できてしまう。
 *
 * `.claude/rules/api-route.md` の「失敗したとき、歯止めを**全部**手放さない」
 * と同じ話。fail-open は保ったまま、DB を見なくても効く層を手前に置く。
 *
 * ⚠️ インスタンス単位なので厳密ではない（コールドスタートでリセットされる）。
 * 横断の重複排除は DB 側（1日1通）が引き続き担う。ここは
 * **桁を落とすためだけ**の層。
 *
 * ⚠️ 窓を DB と同じ24時間にしない。インスタンスごとに1通で頭打ちになり、
 * 障害時に「どのインスタンスも既に送った」状態が長く残って**本物の通知を
 * 落とす**。60秒は日次 CRON には十分長く、連打には十分短い。
 */
const localThrottle = createInMemoryRateLimiter({
  maxRequests: 1,
  windowMs: 60_000,
  // CRON は9本しかない。識別子は外部から増やせない
  maxKeys: 100,
});

/** 通知の内容 */
export interface CronFailureNotice {
  /** CRON の名前（`cleanup-expired-records` 等）。連投抑止の識別子にも使う */
  cronName: string;
  /** 何が起きたか。メール本文に入る */
  reason: string;
  /**
   * 深刻度（既定: `failure`）（#433）
   *
   * - `failure` … 処理が失敗した。放っておいても直らないことが多い
   * - `incomplete` … 処理は走ったが終わり切らなかった（時間切れ・反復上限）
   *
   * ⚠️ **連投抑止のカウンタを分けるために使う。** 抑止は1日1通で識別子が
   * `cronName` だけなので、分けないと**打ち切りの通知が本物の失敗の枠を
   * 食う**。打ち切りが定常的に起きている CRON で翌日に本当の失敗が起きても
   * 通知が出ない、という形で効く。
   *
   * ⚠️ 件名・本文も出し分ける。`incomplete` は 200 で返している実行なので、
   * 「CRON が失敗しました」と書くと 500 との区別が文面で潰れ、
   * アラート疲れで本物の失敗を無視する訓練になる。
   */
  severity?: 'failure' | 'incomplete';
}

/** 深刻度ごとの文言 */
const SEVERITY_TEXT = {
  failure: {
    subject: 'CRON が失敗しました',
    lead: 'CRON の実行に失敗しました。',
  },
  incomplete: {
    subject: 'CRON が終わり切りませんでした',
    lead: 'CRON は実行されましたが、処理を終え切れませんでした。',
  },
} as const;

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
  severity: 'failure' | 'incomplete',
): Promise<boolean> {
  try {
    const result = await checkRateLimit(
      supabase,
      // ⚠️ 深刻度ごとに別カウンタ。同じ識別子にすると打ち切りの通知が
      //    本物の失敗の枠（1日1通）を食う（#433）
      severity === 'failure' ? cronName : `${cronName}:${severity}`,
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
  { cronName, reason, severity = 'failure' }: CronFailureNotice,
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
    // ⚠️ **DB より先に見る。** DB の抑止が効かない状況（鍵が無い・DB障害）でも
    // 必ず通る層にしておく。ここを後ろに置くと `shouldNotify` の fail-open を
    // 通り抜けた分がそのまま送信APIへ出ていく
    // ⚠️ プロセス内の歯止めも深刻度ごとに分ける。同じキーだと打ち切りの
    //    通知が60秒窓を占有して本物の失敗を落とす
    const throttleKey = severity === 'failure' ? cronName : `${cronName}:${severity}`;

    if (!localThrottle.check(throttleKey)) {
      console.warn(
        `[notifyCronFailure] 直前に通知済みのため送りません（60秒）: ${cronName}`,
      );
      return false;
    }

    // supabase が無いのは「DB へ繋げないこと自体が失敗の原因」のケース。
    // 連投抑止はできないが、そういうときこそ通知が要る
    if (supabase && !(await shouldNotify(supabase, cronName, severity))) {
      return false;
    }

    const resend = new Resend(resendApiKey);

    const { error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to,
      subject: `[${APP_NAME}] ${SEVERITY_TEXT[severity].subject}: ${cronName}`,
      text: [
        SEVERITY_TEXT[severity].lead,
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
