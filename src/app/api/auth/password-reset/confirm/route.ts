/**
 * パスワード再設定API
 * POST /api/auth/password-reset/confirm
 *
 * メールのリンクに載っていたトークンと引き換えにパスワードを再設定する。
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { passwordResetConfirmApiSchema } from '@/schema/auth';
import {
  PASSWORD_RESET_CONFIG,
  PASSWORD_RESET_MESSAGES,
} from '@/constants/passwordReset';
import {
  getSessionCookieName,
  getSessionCookieOptions,
} from '@/constants/auth';
import {
  HTTP_STATUS,
  ERROR_CODE,
  AUTH_ERROR_MESSAGES,
  BCRYPT_COST,
  RATE_LIMIT_ACTION,
} from '@/constants';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { consumePasswordResetToken } from '@/lib/auth/passwordResetToken';
import { getClientIp } from '@/lib/http/getClientIp';
import { rejectPwnedPassword } from '@/helpers/pwnedPasswordGuard';

/** 消費できなかった理由ごとの文言 */
const TOKEN_FAILURE_MESSAGES = {
  used: PASSWORD_RESET_MESSAGES.TOKEN_ALREADY_USED,
  expired: PASSWORD_RESET_MESSAGES.TOKEN_EXPIRED,
  invalid: PASSWORD_RESET_MESSAGES.INVALID_TOKEN,
} as const;

/**
 * トークンを使えなかったことを伝える
 *
 * 理由ごとに文言を変える（#1232）。1本に潰していたときは、設定を終えた人が
 * リンクを開き直すと「有効期限が切れています」と出ていた。期限は切れて
 * おらず使用済みなだけで、本人は設定が失敗したと受け取ってしまう。
 *
 * トークンは256bitの乱数で正規の所持者しか持てないため、理由を伝えても
 * 総当たりで得られる情報は増えない。
 *
 * ⚠️ `used` の文言で「設定は完了している」と断定しないこと。トークンを
 * 消費したあとに失敗する経路がある（下の新旧同一チェック、users の更新
 * 失敗）。そこで弾かれた人が再送信するとこの応答に当たるが、その場合
 * パスワードは設定されていない。
 *
 * 次に何をすればよいか（再送 / 管理者へ依頼）は画面のフッターが出し分ける
 * （#1225）。ここは**何が起きたか**だけを言う。
 */
const tokenFailureResponse = (status: 'used' | 'expired' | 'invalid') =>
  NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODE.BAD_REQUEST,
        message: TOKEN_FAILURE_MESSAGES[status],
      },
    },
    { status: HTTP_STATUS.BAD_REQUEST },
  );

export async function POST(request: Request) {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // 失敗リクエストを垂れ流させない。
    // トークンは256bitの乱数なので総当たりは成立しないが、送信元単位で止める。
    // 識別子にトークンを使うと、毎回違う値になって制限が機能しない。
    //
    // 送信元IPは検証より前に確定しているので、ここで消費する。検証を先に置くと、
    // 形式だけ崩したリクエストを挟んでカウンタを消費せずに試行を続けられる
    // （`.claude/rules/api-route.md`「レート制限と検証の順序」）
    const clientIp = getClientIp(request);

    if (clientIp !== 'unknown') {
      const limitResult = await checkRateLimit(
        supabase,
        clientIp,
        RATE_LIMIT_ACTION.PASSWORD_RESET_CONFIRM,
        PASSWORD_RESET_CONFIG.CONFIRM_LIMIT.maxAttempts,
        PASSWORD_RESET_CONFIG.CONFIRM_LIMIT.windowMinutes,
      );

      if (!limitResult.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
              message: AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
            },
          },
          {
            status: HTTP_STATUS.TOO_MANY_REQUESTS,
            headers: limitResult.retryAfter
              ? { 'Retry-After': String(limitResult.retryAfter) }
              : undefined,
          },
        );
      }
    }

    const body = await request.json();
    const result = passwordResetConfirmApiSchema.safeParse(body);

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

    const { token, password } = result.data;

    // 漏洩パスワードの照合。
    //
    // トークンを消費する前に弾く。後に置くと、ここで差し戻された利用者の
    // リンクが使用済みになり、再発行からやり直すことになる。
    const pwnedResponse = await rejectPwnedPassword(password);
    if (pwnedResponse) return pwnedResponse;

    // トークンの検証と消費を1文で行う。パスワードを更新してから消費すると、
    // 同じリンクを同時に2回開かれたときに両方とも通る
    const consumed = await consumePasswordResetToken(supabase, token);

    if (consumed.status !== 'consumed') {
      return tokenFailureResponse(consumed.status);
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, password_hash')
      .eq('id', consumed.userId)
      .maybeSingle();

    // ⚠️ error を捨ててはいけない。`.maybeSingle()` は読み取りに失敗しても
    // `data: null` を返すため、DB の一時障害が下の「リンクが無効」に化ける。
    // トークンは直前に消費済み（`consumePasswordResetToken`）なので、
    // そうなった利用者はリセットの再申請からやり直しになる。パスワードを
    // 忘れている＝他にログイン手段が無い状態なので傷が深い。
    // 行が無いだけなら maybeSingle は error を返さないため、ここに来るのは
    // 本物の読み取り失敗だけ。500 を返して再試行してもらう（#1167）
    if (userError) {
      throw userError;
    }

    // トークンは有効だったのに対象ユーザーが居ない（削除直後など）。
    // 利用者から見れば使えないリンクなので `invalid` として扱う
    if (!user) {
      return tokenFailureResponse('invalid');
    }

    // 新旧同一チェック。トークンは既に消費済みなので、ここで弾かれた利用者は
    // 再発行が必要になる。パスワードが変わっていないのに
    // password_changed_at を進めてセッションを飛ばすよりは分かりやすい
    if (user.password_hash) {
      const isSamePassword = await bcrypt.compare(password, user.password_hash);

      if (isSamePassword) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODE.BAD_REQUEST,
              message: PASSWORD_RESET_MESSAGES.SAME_PASSWORD,
            },
          },
          { status: HTTP_STATUS.BAD_REQUEST },
        );
      }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    // password_changed_at を更新することで既存セッションが無効化される
    // （src/lib/auth/auth.ts の jwt コールバックが突き合わせている）。
    // リセットは「アカウントを取り戻す」操作なので、奪われていた側の
    // セッションを残してはいけない。
    //
    // 二段階認証（user_totp）には触れない。解除してしまうと、メール受信箱を
    // 押さえただけで第2要素を外せることになり、#642 が塞いだ穴が別経路で開く
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        password_changed_at: new Date().toISOString(),
      })
      .eq('id', consumed.userId);

    if (updateError) {
      throw updateError;
    }

    const response = NextResponse.json(
      { success: true, message: PASSWORD_RESET_MESSAGES.RESET_COMPLETED },
      { status: HTTP_STATUS.OK },
    );

    // このブラウザの前のセッションを失効させる（#1234）。
    //
    // 別アカウントでログインしたまま設定リンクを開くと、成功後に
    // `/auth/signin` へ行っても proxy が「認証済み」と見て `/` へ送り返す
    // （`src/proxy.ts:149-151`）。**設定したアカウントではなく前のアカウント
    // のまま**使い続けることになり、共有端末では前の利用者の画面を操作して
    // しまう。パスワードを設定した＝持ち主が入れ替わった（あるいは本人が
    // 認証をやり直した）ので、前のセッションを残す理由が無い。
    //
    // 対象ユーザー自身のセッションは `password_changed_at` で失効するが、
    // それは**別アカウント**のセッションには効かない。
    //
    // ⚠️ `cookies.delete(name)` を使わない（#1174）。文字列を渡すと options が
    // undefined になり、`Secure` も `HttpOnly` も付かない `Set-Cookie` が返る。
    // 本番の Cookie 名は `__Secure-` 接頭辞付きで、ブラウザは `Secure` の無い
    // `Set-Cookie` を**拒否する**ため、削除指示そのものが捨てられる。
    // 発行時（`auth.ts` の cookies.sessionToken）と同じ属性で空値を上書きする。
    // `src/proxy.ts:114-118` が同じ形
    response.cookies.set(getSessionCookieName(), '', {
      ...getSessionCookieOptions(),
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('Password reset confirm error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: PASSWORD_RESET_MESSAGES.RESET_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
