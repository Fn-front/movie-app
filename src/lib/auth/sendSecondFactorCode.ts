/**
 * 第2要素のコードを生成してメールで送る
 *
 * **第2要素のコードを作る唯一の場所。** 送信経路は4本あるが、いずれもここを通す。
 *
 *   1. パスワードログイン（`auth.ts` の `authorize`）
 *   2. OAuth ログイン（`auth.ts` の `jwt` コールバック）
 *   3. 設定画面での有効化（`POST /api/user/totp/setup`）
 *   4. 設定変更の本人確認（`POST /api/user/totp/send-challenge`）
 *
 * 1か所に集めているのは、レート制限・再送間隔・失敗時の後始末を
 * 経路ごとに書き分けると必ずどれかが抜けるため。
 */

import { SupabaseClient } from '@supabase/supabase-js';

import { OTP_CONFIG } from '@/constants/otp';
import { RATE_LIMIT_ACTION, RATE_LIMIT_CONFIG } from '@/constants/rateLimit';
import { TWO_FACTOR_OTP_ACTION } from '@/constants/secondFactor';
import { generateOtpCode, hashOtpCode, sendOtpEmail } from '@/lib/otp';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { normalizeEmail } from '@/utils/email';

import { toDbError } from './dbError';

/**
 * 送信の結果
 *
 * ⚠️ `LIMIT_EXCEEDED` を `SENT` と同じ扱いにしてはいけない。1通も送って
 * いないのに「メールを確認してください」と出すと、届かないコードを待たせる
 * ことになる。この状態の出口はリカバリーコードだけなので、呼び出し側は
 * そこへ誘導する。
 */
export const SEND_SECOND_FACTOR_RESULT = {
  /** 送信した */
  SENT: 'sent',
  /** 再送間隔（60秒）内。直前のコードがまだ生きている */
  THROTTLED: 'throttled',
  /** 送信回数の上限。1通も送っていない */
  LIMIT_EXCEEDED: 'limit_exceeded',
  /**
   * 送信回数の上限だが、**直前に送ったコードがまだ有効**（GHSA-p899-6g7w-v7hg）
   *
   * ⚠️ `THROTTLED` と混ぜない。あちらは「60秒待てば送り直せる」で、
   * こちらは最長60分送り直せない。同じ値にすると
   * `send-challenge` が「しばらく待ってから再送信してください。」を返し、
   * **待っても直らない案内**になる（レビューで実測）。
   *
   * 出口は共通して「受信箱の有効なコードを入力する」。`LIMIT_EXCEEDED` と
   * 違ってリカバリーコードへ誘導しない —— 手元に答えがあるため。
   */
  LIMIT_EXCEEDED_CODE_VALID: 'limit_exceeded_code_valid',
  /** 送信そのものが失敗した。打ち直しても直らない */
  SEND_FAILED: 'send_failed',
} as const;

export type SendSecondFactorResult =
  (typeof SEND_SECOND_FACTOR_RESULT)[keyof typeof SEND_SECOND_FACTOR_RESULT];

/**
 * 第2要素のコードを送る
 *
 * ⚠️ **`email` をリクエストボディから渡してはいけない。** 必ずセッション、
 * または `users` テーブルから引いた値を渡すこと。ボディを信用すると、
 * 任意のアドレスへ自サービス名義のコードメールを送れる（#641）。
 *
 * ⚠️ `authorize` から呼ぶときの宛先は `user.email`。`authorize` スコープの
 * `email` ローカル変数はユーザー名ログインで空文字になり、全ユーザー名
 * アカウントが `otp_codes.email = ''` の1行を共有してコードが混線する。
 *
 * @param supabase - service_role のクライアント
 * @param userId - 対象ユーザー（レート制限の識別子にも使う）
 * @param email - 送信先。サーバー側で確定した値のみ
 * @param promptIdentifier - 送信元ごとの層の識別子（`メール|IP`）。
 *   ログイン経路だけが渡す。詳細は下の `TWO_FACTOR_SEND_PROMPT` のコメント
 * @returns 送信の結果
 */
export async function sendSecondFactorCode(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  promptIdentifier?: string,
): Promise<SendSecondFactorResult> {
  const normalizedEmail = normalizeEmail(email);

  // 再送間隔。**枠の消費より前に**判定する。
  // ここで枠を消費すると、ボタンの二度押しだけで上限に達して
  // 1時間ログインできなくなる
  const { data: recent, error: recentError } = await supabase
    .from('otp_codes')
    // ⚠️ `expires_at` も読む。上限に達したときに「まだ使えるコードが
    //    届いているか」を判定するのに使う（下の LIMIT_EXCEEDED の分岐）
    .select('created_at, expires_at')
    .eq('email', normalizedEmail)
    .eq('action_type', TWO_FACTOR_OTP_ACTION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 握り潰すと「前回送信なし」に化け、DB が詰まっている間だけ再送間隔が
  // 素通りする。メールボックスへの連投を止める仕組みなので、
  // 効かない窓を作らない（#1164 と同じ理由）
  if (recentError) {
    throw toDbError(recentError, 'read otp_codes for second factor send');
  }

  if (recent) {
    const elapsedSeconds =
      (Date.now() - new Date(recent.created_at).getTime()) / 1000;

    if (elapsedSeconds < OTP_CONFIG.RESEND_INTERVAL_SECONDS) {
      return SEND_SECOND_FACTOR_RESULT.THROTTLED;
    }
  }

  /** 直前に送ったコードがまだ使えるか */
  const hasValidCode = Boolean(
    recent && new Date(recent.expires_at).getTime() > Date.now(),
  );

  // ⛔ **送信元ごとの層**（GHSA-p899-6g7w-v7hg）。
  //
  //   `TWO_FACTOR_SEND`（10回/60分）は**利用者単位**なので、パスワードを
  //   知る第三者が「コードを入れずにパスワードだけ」を61秒間隔で投げ続けると、
  //   被害者の枠を使い切って**メールOTPでのログインを妨害できる**。
  //   `authorize` 側で `login` の枠も解放されるため積み上がらない。
  //
  // ⚠️ **再送間隔の判定より後ろに置くこと。** 前に置くと、1通も送らない
  //   リクエスト（二度押し・コード欄が空のままの送信）が枠を食う。
  //   枠は戻せない（`RELEASABLE_RATE_LIMIT_ACTIONS` に無く、DB側の許可リスト
  //   にも無い）ので、正規の利用者が5回の二度押しで60分締め出される。
  //   これは下の `TWO_FACTOR_SEND` が :71 で明示的に避けている失敗と同じ形で、
  //   初版は**それをひとつ上の層で再現していた**（レビューで実測）。
  if (promptIdentifier) {
    const promptLimit = await checkRateLimit(
      supabase,
      promptIdentifier,
      RATE_LIMIT_ACTION.TWO_FACTOR_SEND_PROMPT,
      RATE_LIMIT_CONFIG.TWO_FACTOR_SEND_PROMPT.maxAttempts,
      RATE_LIMIT_CONFIG.TWO_FACTOR_SEND_PROMPT.windowMinutes,
    );

    if (!promptLimit.allowed) {
      return hasValidCode
        ? SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED_CODE_VALID
        : SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED;
    }
  }

  // ここから先は実際に送る。枠を消費する
  // （`.claude/rules/api-route.md` の例外2 — 守る資源はメールボックス）
  //
  // 識別子はユーザーID。メールアドレスにすると、宛先や表記を変えるだけで
  // カウンタが分かれて送信数を掛け算できる（#641 / #644）
  const limitResult = await checkRateLimit(
    supabase,
    userId,
    RATE_LIMIT_ACTION.TWO_FACTOR_SEND,
    RATE_LIMIT_CONFIG.TWO_FACTOR_SEND.maxAttempts,
    RATE_LIMIT_CONFIG.TWO_FACTOR_SEND.windowMinutes,
  );

  if (!limitResult.allowed) {
    // ⚠️ **使えるコードが既に届いているなら行き止まりにしない**
    //    （GHSA-p899-6g7w-v7hg）。
    //
    //    枠を使い切らせる妨害は、宛先が `users.email` に固定されているため
    //    **被害者の受信箱に有効なコードを送り込む**形でしか成立しない。
    //    その状態で「リカバリーコードを使え」と案内するのは、手元に答えが
    //    あるのに別の出口へ誘導していることになる。
    //
    // ⚠️ ここを `THROTTLED` にしない。あちらは「60秒待てば送れる」の意味で、
    //    `send-challenge` が待っても直らない案内を返す（初版の誤り）。
    return hasValidCode
      ? SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED_CODE_VALID
      : SEND_SECOND_FACTOR_RESULT.LIMIT_EXCEEDED;
  }

  const code = generateOtpCode();

  /** 同一宛先の第2要素コードをすべて消す */
  const clearExistingCodes = () =>
    supabase
      .from('otp_codes')
      .delete()
      .eq('email', normalizedEmail)
      .eq('action_type', TWO_FACTOR_OTP_ACTION);

  // 前のコードは無効にする。複数生きていると、古いコードでも通ってしまう
  const { error: clearError } = await clearExistingCodes();

  if (clearError) {
    throw toDbError(clearError, 'clear previous second factor codes');
  }

  const { error: insertError } = await supabase.from('otp_codes').insert({
    email: normalizedEmail,
    code_hash: hashOtpCode(code, normalizedEmail),
    action_type: TWO_FACTOR_OTP_ACTION,
    expires_at: new Date(
      Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000,
    ).toISOString(),
  });

  if (insertError) {
    throw toDbError(insertError, 'insert second factor code');
  }

  const sent = await sendOtpEmail(normalizedEmail, code, TWO_FACTOR_OTP_ACTION);

  if (!sent) {
    // ⚠️ **枠は戻さない。** 行だけ消す。
    //
    // この経路を押さえているのは2つしかない。
    //
    //   | 防御 | 根拠 |
    //   |---|---|
    //   | `TWO_FACTOR_SEND`（10回/60分） | `rate_limits` の `attempts` |
    //   | 再送間隔（60秒） | **直前の `otp_codes` 行の `created_at` だけ** |
    //
    // 以前はここで枠を戻し、かつ行も消していた。行が消えると次の
    // リクエストは「前回送信なし」と判定されて再送間隔を素通りし、枠も
    // 戻っているので `TWO_FACTOR_SEND` にも当たらない。**両方同時に
    // 外れるため、送信が失敗し続ける状況では歯止めが無くなる**
    // （1リクエスト = 送信APIの1コール）。
    //
    // 行を残す手もあるが（`/api/auth/otp/send` はそちら）、第2要素では
    // 届いていないコードの行が残るせいで、次の試行が「先ほど送った
    // 確認コードがまだ有効です」になる。1通も届いていないのにそう出るのは
    // #1285 で直したばかりの誤解そのものなので採らない。
    //
    // 枠を数えるのは**失敗した送信も外部APIを1回消費している**ため。
    // 10回失敗する状況は送信側の障害で、11回目が通る見込みは薄い。
    //
    // その間はリカバリーコードでログインできる（`verifySecondFactor` は
    // 方式判定より前にリカバリーコードを分岐させるので、この枠を通らない）。
    // ⚠️ ただし**使い切っている利用者は最大60分ログインできない**。
    // 送信障害が前提なので、そもそもコードも届かない状態ではある。
    //
    // なおロックが始まるのは11回目のリクエストで、10回失敗して放置すれば
    // `consume_rate_limit` のアイドル判定で枠は戻る（利用者に有利な側）。
    await clearExistingCodes();

    return SEND_SECOND_FACTOR_RESULT.SEND_FAILED;
  }

  return SEND_SECOND_FACTOR_RESULT.SENT;
}
