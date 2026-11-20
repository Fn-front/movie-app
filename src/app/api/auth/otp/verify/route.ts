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
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { enforcePublicRateLimit } from '@/helpers/publicRateLimit';

export async function POST(request: Request) {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // 送信元単位のブレーキ。**検証より前**に置く（原則どおり）。
    // 送信元IPはボディを読まなくても確定するため、例外1には当たらない。
    //
    // 下の OTP_VERIFY（email|ip）は「同一の宛先で何回試せるか」しか
    // 抑えておらず、**宛先を変えるだけで `rate_limits` の行を無制限に
    // 増やせた**。コード総当たりへの備えは OTP行自身の attempts と
    // OTP_VERIFY が担うので、ここは行数の天井が目的（枠は厚め）。
    const ipLimitResponse = await enforcePublicRateLimit({
      request,
      action: RATE_LIMIT_ACTION.OTP_VERIFY_IP,
      limit: RATE_LIMIT_CONFIG.OTP_VERIFY_IP,
      supabase,
    });
    if (ipLimitResponse) return ipLimitResponse;

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
      // ⚠️ **係争中のパスワードは昇格と同時に失効させる（#1325）。**
      //
      // 「被害者が未検証で登録 → 第三者が同じアドレスで register」の順だと、
      // `password_hash` は第三者のものに上書きされている
      // （`auth/register/route.ts` の既存ユーザー分岐／#645）。第三者の
      // register は被害者宛の未検証コードを DELETE するので、被害者は
      // 「コードが違う」を見て**再送**し、そのコードで検証を終える。
      // 再送（`auth/otp/send`）は `password_hash` に触らないため、
      // 第三者のハッシュを載せたまま `is_verified` が立っていた。
      //
      // 未検証の間に設定されたパスワードは**出自を区別する手段が無い**。
      // 上書きは旧パスワードとの照合なしに行われるので、本人のものか
      // 第三者のものかはDBを見ても分からない。#1302 が LOGIN 経路で
      // 採ったのと同じ判断で、安全側に倒して失効させる。
      //
      // ⛔ 無条件に消してはいけない。通常の新規登録が毎回パスワード無しで
      //   終わる。消すのは `users.password_contested` が立っているときだけ ——
      //   つまり**他人の未検証登録を上書きして設定された**パスワード。
      //   「同じパスワードでのやり直し」は register 側で除外済み。
      //
      // ⚠️ 印は **`users`** に持つ。`otp_codes` に持たせると、
      //   (1) 攻撃者が同じ register を2回送るだけで印の付いた行ごと
      //       消えて印なしの行に置き換わる、
      //   (2) 引き継ぎ元の行が無いと「係争なし」に倒れる（fail-open）、
      //   の2つの穴が開く。どちらもレビューで実測した。
      const { data: userRow, error: userLookupError } = await supabase
        .from('users')
        .select('password_contested')
        .eq('email', email)
        .single();

      // 握りつぶさない。読めないまま昇格させると「消さない」側に倒れ、
      // 保護が無言で外れる
      if (userLookupError) {
        throw userLookupError;
      }

      const passwordContested = userRow?.password_contested === true;

      // ⚠️ `.eq('is_verified', false)` を付ける。これで**既に認証済みの
      //   ユーザーのパスワードは絶対に消えない**。無いと、何らかの経路で
      //   先に昇格した後に古い REGISTRATION のコードを投入して、
      //   認証済みユーザーの password_hash を NULL にできてしまう。
      const { data: promotedUsers, error: updateError } = await supabase
        .from('users')
        .update({
          is_verified: true,
          ...(passwordContested
            ? // 印も一緒に下ろす。ここで下ろさないと、再設定したパスワードが
              // 次の昇格（起きないが）で消えうるし、印の意味が「過去に係争が
              // あった」へずれて読めなくなる
              { password_hash: null, password_contested: false }
            : {}),
        })
        .eq('email', email)
        .eq('is_verified', false)
        .select('id');

      if (updateError) {
        throw updateError;
      }

      // 失効させたことを伝えないと、利用者は次のパスワードログインが
      // 「メールアドレスまたはパスワードが正しくありません。」で弾かれる
      // 理由を知るすべがない。
      //
      // ⚠️ 送信結果で検証を止めない。失効そのものは上で確定しており、
      // ここで 500 にすると正しいコードを入れた利用者が行き止まりに入る
      // （#1258 と同種）
      if (passwordContested && promotedUsers && promotedUsers.length > 0) {
        await sendPasswordInvalidatedEmail(email);
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

    if (action === OTP_ACTION.PASSWORD_CHANGE) {
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
