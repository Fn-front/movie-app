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
import {
  consumePasswordResetToken,
  peekPasswordResetToken,
} from '@/lib/auth/passwordResetToken';
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
 * 消費したあとに失敗する経路が**まだ1つ残っている**（users の更新失敗）。
 * そこで弾かれた人が再送信するとこの応答に当たるが、その場合パスワードは
 * 設定されていない。
 *
 * ⚠️ かつてここに「新旧同一チェックは #1235 で消費より前へ移した」と
 * 書いていたが、**そのチェック自体を #1243 で外した**（有効なリンクを
 * 握っている人にとって現在のパスワードを判定するオラクルになるため）。
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

    // ⚠️ まだ消費しない（#1235）。
    //
    // 消費を先に置くと、この下の**回復可能なエラー**で弾かれた利用者が
    // リンクを失う。再発行が必要になり、発行アカウントなら自力では
    // 再発行できない（#1226）。
    //
    // ⚠️ かつての代表例は「現在と同じパスワードを打ち直した」だったが、
    //    その検査は #1243 で外した（オラクルになるため）。いまここに残る
    //    回復可能なエラーは漏洩パスワードの差し戻しと `userError` の500。
    //
    // 原子性は失っていない。弾けるものを弾いたあと、最後に条件付き UPDATE
    // （`consumePasswordResetToken`）で確定させる。読んでから書くまでに
    // 別のリクエストが消費していれば、そこで 0 行になって `used` が返る
    const peeked = await peekPasswordResetToken(supabase, token);

    if (peeked.status !== 'valid') {
      return tokenFailureResponse(peeked.status);
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      // ⚠️ `password_hash` は見ない（#1243）。照合すると、結果を使わなくても
      //    `bcrypt.compare` の有無が応答時間に出てオラクルになる
      .select('id')
      .eq('id', peeked.userId)
      .maybeSingle();

    // ⚠️ error を捨ててはいけない。`.maybeSingle()` は読み取りに失敗しても
    // `data: null` を返すため、DB の一時障害が下の「リンクが無効」に化ける。
    // 行が無いだけなら maybeSingle は error を返さないため、ここに来るのは
    // 本物の読み取り失敗だけ。500 を返して再試行してもらう（#1167）。
    // トークンはまだ焼いていないので、再試行は成功しうる
    if (userError) {
      throw userError;
    }

    // トークンは有効だったのに対象ユーザーが居ない（削除直後など）。
    // 利用者から見れば使えないリンクなので `invalid` として扱う
    if (!user) {
      return tokenFailureResponse('invalid');
    }

    // ⛔ **新旧同一チェックはここに置かない**（#1243）。
    //
    //   `bcrypt.compare(新パスワード, 既存ハッシュ)` の結果を 400 と 200 で
    //   返し分けると、**有効なリンクを握っている人にとって現在のパスワードを
    //   判定するオラクル**になる。
    //
    //   #1235 でトークンの消費を後ろへ動かしたため、弾かれてもリンクが
    //   焼けない。同じリンクで候補を何度でも投げられる。レート制限
    //   （`CONFIRM_LIMIT` 10回/15分）は**識別子が送信元IP**なので、
    //   IP を変えれば実質無制限。
    //
    //   リンクを握っていればパスワードは上書きできるので、追加で失われるのは
    //   「**変更せずに**現在のパスワードを知れる」＝侵害に気づかれないこと。
    //   使い回していれば他サービスへ波及する。
    //
    // ⚠️ 同じ値で上書きされても実害は無い。リセットは「アカウントを取り戻す」
    //   操作で、`password_changed_at` は更新されるので既存セッションは失効する。
    //
    // ⚠️ **設定画面（`user/change-password`）の同一チェックはそのまま残す。**
    //   あちらは現在のパスワードを知っている人しか到達できないのでオラクルに
    //   ならない。

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    // ここで初めて焼く。弾けるものは上で弾き終えている。
    //
    // 判定は条件付き UPDATE の更新行数で行うため、`peek` から here までの
    // 間に同じリンクを別のリクエストが使い切っていれば 0 行になる。
    // 「同じリンクを同時に2回開いても両方は通らない」は保たれる
    const consumed = await consumePasswordResetToken(supabase, token);

    if (consumed.status !== 'consumed') {
      return tokenFailureResponse(consumed.status);
    }

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
        // 係争の印を下ろす（#1325）。
        //
        // ここへ来られるのはメールボックスの所有を証明した本人だけで、
        // そのうえで自分でパスワードを設定し直している。印を残すと
        // 「過去に係争があった」という別の意味にずれて読めなくなる。
        //
        // ⚠️ 印を下ろせるのはここと `auth/otp/verify` の昇格の2箇所だけ。
        // `register` 側では **OR で畳むだけ**にする（下ろすと、攻撃者が
        // 同じリクエストを2回送るだけで保護が外れる）
        password_contested: false,
      })
      // 権威は『実際に焼いた行』側。peeked.userId と同値だが意図が読みやすい
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
