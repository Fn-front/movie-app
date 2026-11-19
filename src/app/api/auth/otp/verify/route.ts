/**
 * OTP検証API
 * POST /api/auth/otp/verify
 */

import { NextResponse } from 'next/server';

import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { checkRateLimit, resetRateLimit } from '@/lib/rateLimit/rateLimit';
import { buildLoginIdentifier } from '@/lib/rateLimit/loginIdentifier';
import { getClientIp } from '@/lib/http/getClientIp';
import { generateVerificationToken, verifyOtpCode } from '@/lib/otp';
import { sendPasswordInvalidatedEmail } from '@/lib/auth/sendPasswordInvalidatedEmail';
import { otpVerifySchema } from '@/schema/otp';
import {
  OTP_ACTION,
  OTP_CONFIG,
  OTP_ERROR_MESSAGES,
  OTP_SUCCESS_MESSAGES,
  HTTP_STATUS,
  ERROR_CODE,
  AUTH_ERROR_MESSAGES,
  RATE_LIMIT_ACTION,
} from '@/constants';

export async function POST(request: Request) {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // リクエストボディのバリデーション
    const body = await request.json();
    const result = otpVerifySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const { email, code, action } = result.data;

    // 検証試行のレート制限チェック（メールアドレス単位）
    // OTP行のattemptsは送信のたびにリセットされるため、
    // エンドポイント単位で独立した試行カウントを設けて多層防御とする。
    // 上限超過時はウィンドウ分だけロックし、検証成功時に後述の resetRateLimit で解除する
    // 識別子はアカウント×送信元。メールアドレス単独だと、コードを知らない
    // 第三者が誤ったコードを送り続けるだけで被害者の検証を封鎖できる（#644と同種）。
    // 送信元を含めればロックされるのは試行した本人だけになる。
    // コード総当たりに対しては、OTP行自身の attempts（MAX_ATTEMPTS）が
    // 送信元に関係なく効くため、この変更で弱くはならない。
    //
    // 識別子が検証済みのボディ由来なので、検証より前には出せない
    // （`.claude/rules/api-route.md`「レート制限と検証の順序」の例外1）
    const verifyIdentifier = buildLoginIdentifier(email, getClientIp(request));

    const verifyLimitResult = await checkRateLimit(
      supabase,
      verifyIdentifier,
      RATE_LIMIT_ACTION.OTP_VERIFY,
      OTP_CONFIG.VERIFY_RATE_LIMIT,
      OTP_CONFIG.VERIFY_RATE_LIMIT_WINDOW_MINUTES,
    );

    if (!verifyLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
            message: OTP_ERROR_MESSAGES.VERIFY_RATE_LIMIT_EXCEEDED,
          },
        },
        {
          status: HTTP_STATUS.TOO_MANY_REQUESTS,
          headers: verifyLimitResult.retryAfter
            ? { 'Retry-After': String(verifyLimitResult.retryAfter) }
            : undefined,
        },
      );
    }

    // otp_codesテーブルから該当レコード検索（最新の未検証OTP）
    const { data: otpRecord, error: fetchError } = await supabase
      .from('otp_codes')
      .select('id, code_hash, attempts, expires_at')
      .eq('email', email)
      .eq('action_type', action)
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !otpRecord) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: OTP_ERROR_MESSAGES.CODE_NOT_FOUND,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 有効期限チェック
    const now = new Date();
    const expiresAt = new Date(otpRecord.expires_at);

    if (now > expiresAt) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: OTP_ERROR_MESSAGES.CODE_EXPIRED,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 試行回数チェック（前回までの分）。
    // ⚠️ 下の照合失敗側にも**加算後**の判定がある。両方必要で、片方では足りない。
    // ここはコードを送らずに叩かれた場合や、別タブからの並行リクエストを弾く
    if (otpRecord.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
            message: OTP_ERROR_MESSAGES.MAX_ATTEMPTS_EXCEEDED,
          },
        },
        { status: HTTP_STATUS.TOO_MANY_REQUESTS },
      );
    }

    // コード照合
    // 平文比較ではなく HMAC の timingSafeEqual 照合（#640）
    if (!verifyOtpCode(code, email, otpRecord.code_hash)) {
      // 試行回数をインクリメント
      const newAttempts = otpRecord.attempts + 1;
      await supabase
        .from('otp_codes')
        .update({ attempts: newAttempts })
        .eq('id', otpRecord.id);

      // ⚠️ **加算後**の値で上限を見る（#1248）。入口の判定だけだと、上限に
      // 達した回も「確認コードが間違っています。」としか返らず、再送信の
      // 導線も出ない。利用者は必ず1回、もう使えないコードを打つことになる。
      //
      // 「あと何回で上限か」を教えることになるが、上限に達したことは
      // どのみち次のリクエストで分かるので、攻撃者が得る情報は変わらない
      const isExhausted = newAttempts >= OTP_CONFIG.MAX_ATTEMPTS;

      return NextResponse.json(
        {
          success: false,
          error: {
            code: isExhausted
              ? ERROR_CODE.RATE_LIMIT_EXCEEDED
              : ERROR_CODE.BAD_REQUEST,
            message: isExhausted
              ? OTP_ERROR_MESSAGES.MAX_ATTEMPTS_EXCEEDED
              : OTP_ERROR_MESSAGES.INVALID_CODE,
          },
        },
        {
          status: isExhausted
            ? HTTP_STATUS.TOO_MANY_REQUESTS
            : HTTP_STATUS.BAD_REQUEST,
        },
      );
    }

    // アクション別後処理
    if (action === OTP_ACTION.REGISTRATION) {
      // is_verified = true に更新
      const { error: updateError } = await supabase
        .from('users')
        .update({ is_verified: true })
        .eq('email', email);

      if (updateError) {
        throw updateError;
      }

      // OTPレコード削除
      await supabase.from('otp_codes').delete().eq('id', otpRecord.id);

      // 検証成功のためレート制限をリセット（正当なユーザーの再検証を妨げない）
      await resetRateLimit(
        supabase,
        verifyIdentifier,
        RATE_LIMIT_ACTION.OTP_VERIFY,
      );

      return NextResponse.json(
        {
          success: true,
          message: OTP_SUCCESS_MESSAGES.EMAIL_VERIFIED,
        },
        { status: HTTP_STATUS.OK },
      );
    }

    if (action === OTP_ACTION.LOGIN || action === OTP_ACTION.PASSWORD_CHANGE) {
      // LOGIN のコードを受け取れた＝そのメールアドレスの持ち主だと証明できた
      // ので、未認証なら認証済みにする（#1257）。
      //
      // 以前は REGISTRATION でしか立てなかったため、登録して確認コードを
      // 入れる前に離脱した人が「メールでログイン」を選ぶと、**正しいコードを
      // 入れたのに最後の signIn で弾かれて**いた。しかもその送信で日次枠を
      // 1つ消費済みで、案内される「新規登録をやり直す」も同じ枠を使う。
      //
      // ⚠️ **トークンの発行より前に置く。** 後ろに置くと、ここで失敗した
      // ときには `otp_codes` に `verified_at` が入っており、500 で平文
      // トークンも返らない。再試行は `verified_at IS NULL` の検索（`:99`）に
      // 当たらず「確認コードが見つかりません」になる＝**コードは焼けたのに
      // ログインもできない**。先に立てておけば、後続が失敗しても同じコードで
      // やり直せる（立つのはメールボックス所有の証明だけで、それ自体に害は
      // ない）。REGISTRATION 分岐も同じ理由で users 更新が先にある。
      //
      // ⚠️ **昇格と同時に `password_hash` を失効させる（#1302）。**
      // 「被害者が未検証で登録 → 離脱 → 第三者が同じアドレスで register」の
      // 順だと、`password_hash` は第三者のものに上書きされている
      // （`auth/register/route.ts` の既存ユーザー分岐／#645）。認証済みにすると
      // register 側が「認証済みなら上書きしない」で止めるため、#645 が用意して
      // いた「行き止まり → 再登録 → 上書き」という自動回復ループも閉じる。
      //
      // **未検証の間に設定されたパスワードは、出自を区別する手段が無い。**
      // 上書きは旧パスワードとの照合なしに行われるので、本人のものか第三者の
      // ものかはDBを見ても分からない。ここはメールボックスを押さえている本人
      // だけが通る経路なので、安全側に倒して一律で失効させる。
      //
      // ⚠️ `.eq('is_verified', false)` が効くので、**既に認証済みのユーザーの
      // パスワードは絶対に消えない**。影響は「未検証で放置 → メールでログイン」
      // の一度きりで、本人は設定画面（`hasPassword: false` なら現在の
      // パスワード欄が出ない）か再設定リンクから設定し直せる。
      //
      // ⚠️ `password_changed_at` は触らない。昇格前はパスワードログイン自体が
      // `email_not_verified` で弾かれる（#1247）ので、失効させるべき第三者の
      // セッションがそもそも存在しない。
      //
      // ⚠️ `REGISTRATION` 分岐には入れない。あちらは利用者がいま登録フォームで
      // 決めたパスワードなので、消すと通常の新規登録が毎回パスワード無しで
      // 終わる。
      //
      // ⚠️ `PASSWORD_CHANGE` では立てない。あちらはログイン中の本人確認で、
      // 対象は必ず認証済みのユーザー。立てる意味がないうえ、
      // 「どの操作で認証済みになるか」を広げすぎない
      if (action === OTP_ACTION.LOGIN) {
        const { data: promotedUsers, error: verifyError } = await supabase
          .from('users')
          .update({ is_verified: true, password_hash: null })
          .eq('email', email)
          .eq('is_verified', false)
          .select('id');

        // ⚠️ 握り潰さない。失敗したまま進むと、検証済みトークンは発行された
        // のに `authorize` が `email_not_verified` で弾く（#1247）という
        // 噛み合わない状態になる
        if (verifyError) {
          throw verifyError;
        }

        // 実際に昇格した（＝パスワードを消した）ときだけ通知する。
        // 失効させたことを伝えないと、利用者は次のパスワードログインが
        // 「メールアドレスまたはパスワードが正しくありません。」で弾かれる
        // 理由を知るすべがない。
        //
        // ⚠️ 送信結果でログインを止めない。失効そのものは上で確定しており、
        // ここで 500 にすると正しいコードを入れた利用者がログインできない
        // 行き止まりを作る（#1258 と同種）。送信側も throw しない契約なので
        // ここで囲わない。日次送信枠も消費しない
        // （OTPではなくセキュリティ通知で、昇格1回につき高々1通）
        if (promotedUsers && promotedUsers.length > 0) {
          await sendPasswordInvalidatedEmail(email);
        }
      }

      // 検証済みトークンを発行する。
      // 「OTP検証が済んでいる」ことの証明をメールアドレス（公開識別子）ではなく
      // このトークンで行うことで、被害者の検証直後に第三者が signIn / change-password
      // を叩いて成り代わる経路を塞ぐ。平文はこのレスポンスでのみ返す。
      const { token, tokenHash } = generateVerificationToken();

      const { error: updateError } = await supabase
        .from('otp_codes')
        .update({
          verified_at: now.toISOString(),
          verification_token_hash: tokenHash,
        })
        .eq('id', otpRecord.id);

      if (updateError) {
        throw updateError;
      }

      // 検証成功のためレート制限をリセット（正当なユーザーの再検証を妨げない）
      await resetRateLimit(
        supabase,
        verifyIdentifier,
        RATE_LIMIT_ACTION.OTP_VERIFY,
      );

      return NextResponse.json(
        {
          success: true,
          message: OTP_SUCCESS_MESSAGES.CODE_VERIFIED,
          data: { verificationToken: token },
        },
        { status: HTTP_STATUS.OK },
      );
    }

    // 想定外のアクション（zodバリデーション通過後のため到達しないはずだが防御的に処理）
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.BAD_REQUEST,
          message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
        },
      },
      { status: HTTP_STATUS.BAD_REQUEST },
    );
  } catch (error) {
    console.error('OTP verify error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: OTP_ERROR_MESSAGES.VERIFY_SERVER_ERROR,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
