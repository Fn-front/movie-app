/**
 * 新規登録API
 * POST /api/auth/register
 *
 * is_verified = false でユーザー作成し、OTPコードを生成・メール送信する。
 * OTP検証成功後に is_verified = true に更新される。
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { registerApiSchema } from '@/schema/auth';
import { AUTH_ERROR_MESSAGES, BCRYPT_COST } from '@/constants/auth';
import { OTP_ACTION, OTP_CONFIG, OTP_ERROR_MESSAGES } from '@/constants/otp';
import {
  HTTP_STATUS,
  ERROR_CODE,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  SUPABASE_ERROR_CODE,
} from '@/constants';
import { enforcePublicRateLimit } from '@/helpers/publicRateLimit';
import {
  generateOtpCode,
  sendOtpEmail,
  randomDelay,
  hashOtpCode,
} from '@/lib/otp';
import { checkRateLimit, releaseRateLimit } from '@/lib/rateLimit/rateLimit';
import { buildLoginIdentifier } from '@/lib/rateLimit/loginIdentifier';
import { getClientIp } from '@/lib/http/getClientIp';
import { rejectPwnedPassword } from '@/helpers/pwnedPasswordGuard';

export async function POST(request: Request) {
  try {
    // Supabaseクライアント検証
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // 送信元単位のブレーキ。**検証より前**に置く（原則どおり）。
    // 送信元IPはボディを読まなくても確定するため、例外1には当たらない。
    //
    // 下の REGISTER（email|ip）と OTP_SEND_DAILY（email）はどちらも
    // 「同一の宛先で何回試せるか」しか抑えておらず、**宛先を変えるだけで
    // `rate_limits` の行を無制限に増やせた**。しかもこのルートは1リクエストで
    // 2行作る。メール単位をIPに置き換えると送信数をIP数だけ掛け算できるので
    // （#641 / #644）、置き換えずに手前へ重ねる。
    const ipLimitResponse = await enforcePublicRateLimit({
      request,
      action: RATE_LIMIT_ACTION.REGISTER_IP,
      limit: RATE_LIMIT_CONFIG.REGISTER_IP,
      supabase,
    });
    if (ipLimitResponse) return ipLimitResponse;

    // リクエストボディの取得・バリデーション
    const body = await request.json();
    const result = registerApiSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 登録試行のレート制限（アカウント×送信元で5回/60分）。
    //
    // 識別子にメールアドレス単独を使っていたときは、第三者が被害者のメールで
    // 数回POSTするだけで本人を60分間登録不能にできた（#644と同種）。
    // 送信元を含めればロックされるのは試行した本人だけになる。
    // メールボックス側の保護は、下部の日次送信上限（OTP_SEND_DAILY）が担う。
    //
    // 識別子が検証済みのボディ由来なので、検証より前には出せない
    // （`.claude/rules/api-route.md`「レート制限と検証の順序」の例外1）
    const clientIp = getClientIp(request);
    const rateLimitResult = await checkRateLimit(
      supabase,
      buildLoginIdentifier(result.data.email, clientIp),
      RATE_LIMIT_ACTION.REGISTER,
      RATE_LIMIT_CONFIG.REGISTER.maxAttempts,
      RATE_LIMIT_CONFIG.REGISTER.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
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
          headers: rateLimitResult.retryAfter
            ? { 'Retry-After': String(rateLimitResult.retryAfter) }
            : undefined,
        },
      );
    }

    const { email, password, name } = result.data;

    // 漏洩パスワードの照合。
    //
    // レート制限の後に置くのは、このエンドポイントを外部APIへの無制限な
    // 踏み台にしないため。既存ユーザーチェックより前なのは、応答がパスワード
    // だけで決まり、メールアドレスの登録有無を漏らさないため。
    const pwnedResponse = await rejectPwnedPassword(password);
    if (pwnedResponse) return pwnedResponse;

    // 既存ユーザーチェック（is_verified も見る）。
    //
    // `password_hash` と `password_contested` も引く（#1325）。未検証ユーザーを
    // 上書きするとき、**同じパスワードでのやり直しかどうか**と
    // **既に係争中か**を判定するのに使う。詳しくは下の `passwordContested`
    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('id, is_verified, password_hash, password_contested')
      .eq('email', email)
      .single();

    // ⚠️ error を捨てると「新規メール」に化け、そのまま INSERT へ進む。
    // 既存アカウントがあれば一意制約違反で 500 になるので結果は同じだが、
    // **既存アカウントへ書き込みを試みる**経路を通るのは意図と違う。
    // 行が無い（PGRST116）のが本当の新規なので、そちらは従来どおり通す（#1164）
    if (
      existingUserError &&
      existingUserError.code !== SUPABASE_ERROR_CODE.NOT_FOUND
    ) {
      throw existingUserError;
    }

    if (existingUser?.is_verified) {
      // メールアドレス列挙防止:
      // 認証済みメールでも新規登録と区別できないレスポンスを返す。
      // - 内部では新規ユーザー・OTPを作成せず、メールも送信しない
      // - bcryptハッシュ計算＋ランダム遅延で新規作成時とタイミングを揃える
      //   （新規成功パスも同じ randomDelay() を通す。詳細は下記コメント参照）
      // - レスポンスは 201・同一ボディ形状（userId はダミーのUUID）
      await bcrypt.hash(password, BCRYPT_COST);
      await randomDelay();

      return NextResponse.json(
        {
          success: true,
          data: { userId: randomUUID() },
          message: AUTH_ERROR_MESSAGES.REGISTER_SUCCESS,
        },
        { status: HTTP_STATUS.CREATED },
      );
    }

    // 日次送信上限チェック（メールアドレス単位で5通/日）。
    //
    // register は確認コードメールを直接送るため、/api/auth/otp/send と
    // 同じ送信カウンタを消費させる。ここを通していなかったときは、
    // register 経由なら日次上限の管轄外で 5通/60分（最大120通/日）送れた。
    //
    // 位置の意図:
    // - 認証済みメールの早期return（上）より後 … 1通も送らないパスで枠を減らさない
    // - ユーザー作成（下）より前 … 枠切れのときに未検証ユーザー行を作らない
    // - 検証より後 … 守る資源がメールボックスなので送信の直前に置く
    //   （`.claude/rules/api-route.md`「レート制限と検証の順序」の例外2）
    const dailyLimitResult = await checkRateLimit(
      supabase,
      email,
      RATE_LIMIT_ACTION.OTP_SEND_DAILY,
      OTP_CONFIG.DAILY_SEND_LIMIT,
      OTP_CONFIG.DAILY_SEND_WINDOW_MINUTES,
    );

    if (!dailyLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
            message: OTP_ERROR_MESSAGES.DAILY_LIMIT_EXCEEDED,
          },
        },
        {
          status: HTTP_STATUS.TOO_MANY_REQUESTS,
          headers: dailyLimitResult.retryAfter
            ? { 'Retry-After': String(dailyLimitResult.retryAfter) }
            : undefined,
        },
      );
    }

    // パスワードハッシュ化
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    // 未検証の既存ユーザーがいる場合は上書きし、いなければ新規作成する。
    //
    // 「既存あり」で一律に何もせず成功レスポンスを返していると、第三者が
    // 他人のメールで先に未検証登録するだけで、本人が二度と登録できなくなる
    // （しかも列挙防止のため理由を表示できない）。さらに、本人がフィッシング等で
    // 確認コードを入力してしまうと is_verified=true になり、第三者が設定した
    // パスワードでログインできてしまう（#645）。
    //
    // 上書きすることで、(1) 本人は普通に登録を完了でき、(2) 第三者が設定した
    // password_hash が消えるため乗っ取り経路も塞がる。確認コードを受け取れるのは
    // メールアドレスの持ち主だけなので、第三者が繰り返しても意味がない。
    //
    // ⚠️ これが効くのは「第三者が先・本人が後」の順だけ。逆順（本人が未検証で
    // 放置 → 第三者が上書き）では、本人がここを通らずに昇格できてしまい、
    // 第三者の password_hash が残る。塞げているのは**「メールでログイン」
    // 経由の昇格だけ**で、`auth/otp/verify` の LOGIN 分岐が昇格と同時に
    // 失効させている（#1302）。
    //
    // ⚠️ **REGISTRATION 経由の昇格も #1325 で塞いだ。** 下の
    // `password_contested` を参照。この分岐で発行したコードには印が付き、
    // `auth/otp/verify` が昇格と同時に `password_hash` を失効させる。
    let userId: string;

    /**
     * このリクエストの後、`users.password_hash` は「係争中」か（#1325）
     *
     * 未検証の既存ユーザーを上書きするということは、**同じアドレスで
     * 2人目がパスワードを設定した**ということ。どちらが本人かはサーバーから
     * 区別できないので、安全側に倒して検証時に失効させる。
     */
    let passwordContested = false;

    if (existingUser) {
      // ⚠️ **既に立っている印は決して下ろさない（OR で畳む）。**
      //
      // 「同じパスワードでのやり直しは係争にしない」という緩和だけだと、
      // **攻撃者が同じリクエストを2回送るだけで保護が外れる**（レビューで実測）。
      // 比較相手は「本人が設定したパスワード」ではなく**直前に誰かが設定した
      // ハッシュ**なので、攻撃者の2回目は compare が true になってしまう。
      //
      //   1. 被害者が登録 → H(VictimPass)
      //   2. 攻撃者が register{AttackerPass} → compare=false → 係争 true
      //   3. 攻撃者が**同じリクエストをもう一度** → compare=true
      //      → OR が無いと係争 false に戻り、#1325 が再成立する
      //
      // 下ろすのは「本人だと証明できたとき」＝昇格（`auth/otp/verify`）か
      // パスワード再設定（`auth/password-reset/confirm`）の2箇所だけ。
      //
      // ⚠️ 緩和そのものは残す。本人が同じパスワードでやり直すのは普通の操作で、
      // これを係争扱いにすると検証後にパスワードが消える。印がまだ立って
      // いなければ（＝第三者が介在していなければ）このケースは通る。
      //
      // `password_hash` が NULL（OAuth のみ・#1302 で失効済み等）のときは
      // 比較対象が無いので係争扱いにする
      const samePassword = existingUser.password_hash
        ? await bcrypt.compare(password, existingUser.password_hash)
        : false;

      passwordContested = existingUser.password_contested || !samePassword;

      // ⚠️ `name` は入力されたときだけ更新する（#1253）。
      //
      // `name: name || null` にしていた頃は、名前を入れずにやり直すと
      // **既存の表示名が消えた**。ユーザー名は任意入力なので、やり直すときに
      // 入れ忘れるのが普通。
      //
      // #645 の目的は**第三者が設定した `password_hash` を消すこと**で、
      // 名前を消す必要はない
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          password_hash: passwordHash,
          // 印はパスワードと一緒に動く（#1325）。`auth/otp/verify` の
          // REGISTRATION 分岐がこれを見て失効を決める
          password_contested: passwordContested,
          ...(name ? { name } : {}),
        })
        .eq('id', existingUser.id)
        .select('id')
        .single();

      if (updateError || !updatedUser) {
        throw updateError;
      }

      userId = updatedUser.id;

      // 旧い未検証OTPを無効化し、有効なコードを1つに保つ
      await supabase
        .from('otp_codes')
        .delete()
        .eq('email', email)
        .eq('action_type', OTP_ACTION.REGISTRATION)
        .is('verified_at', null);
    } else {
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          email,
          password_hash: passwordHash,
          name: name || null,
          is_verified: false,
        })
        .select('id')
        .single();

      if (insertError || !newUser) {
        throw insertError;
      }

      userId = newUser.id;
    }

    // OTPコードを生成・保存
    const code = generateOtpCode();
    const expiresAt = new Date(
      Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000,
    );

    const { error: otpInsertError } = await supabase.from('otp_codes').insert({
      email,
      // 平文は保存しない（#640）
      code_hash: hashOtpCode(code, email),
      action_type: OTP_ACTION.REGISTRATION,
      expires_at: expiresAt.toISOString(),
    });

    if (otpInsertError) {
      throw otpInsertError;
    }

    // Resendでメール送信
    const emailSent = await sendOtpEmail(email, code, OTP_ACTION.REGISTRATION);

    if (!emailSent) {
      // メール送信失敗時はロールバックする。
      // users 行を消すのは「このリクエストで作成した場合」のみ。既存の未検証
      // ユーザーを上書きしたケースで消すと、元々あった行まで巻き添えになる
      //
      // ⚠️ OTP の削除条件は、上で挿入したときと**同じに絞る**（#1267）。
      // `email` だけで消すと全 action_type の、しかも**検証済みの行まで**
      // 巻き込む。消えると OTP ログイン（`auth.ts`）とパスワード変更
      // （`user/change-password`）が参照している検証済みトークンが失われる。
      // このリクエストが作ったのは registration の未検証行だけ
      await supabase
        .from('otp_codes')
        .delete()
        .eq('email', email)
        .eq('action_type', OTP_ACTION.REGISTRATION)
        .is('verified_at', null);

      if (!existingUser) {
        await supabase.from('users').delete().eq('id', userId);
      }

      // 日次送信枠も戻す（#1260）。行だけ消して枠を残すと、1通も届かないまま
      // 5回で「本日の送信上限に達しました」に変わり、#1258 の行き止まりへ落ちる
      //
      // ⚠️ 上部の `REGISTER`（5回/60分）は**戻さない**（#1267）。
      // あちらが数えているのは「送った通数」ではなく**登録の試行回数**で、
      // 失敗も試行のうち。戻せるようにすると、失敗を誘発できる相手が
      // 試行回数の上限を実質無効化できる（`release_rate_limit` の許可リストに
      // 入れていないのも同じ理由 / #1266）。
      // メールボックスを守るのは `OTP_SEND_DAILY` の役目で、そちらは戻す
      await releaseRateLimit(supabase, email, RATE_LIMIT_ACTION.OTP_SEND_DAILY);

      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.SERVER_ERROR,
            message: OTP_ERROR_MESSAGES.EMAIL_SEND_FAILED,
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    // メールアドレス列挙防止（タイミング均一化）:
    // 既存メール分岐と同じ randomDelay() を新規成功パスでも通し、
    // 両パスの応答時間にジッターを持たせて分布を近づける。
    //
    // 【残る限界】完全なタイミング一致は困難:
    // - 既存メール分岐は SELECT 1回のみ、新規成功パスは users/otp_codes への
    //   INSERT と sendOtpEmail(Resend) の実処理を伴うため、DB・外部メール送信の
    //   実所要時間の差は randomDelay() のジッター（200〜500ms）で吸収しきれない
    //   場合がある。この差の完全な隠蔽は本実装のスコープ外とする。
    await randomDelay();

    return NextResponse.json(
      {
        success: true,
        data: { userId },
        message: AUTH_ERROR_MESSAGES.REGISTER_SUCCESS,
      },
      { status: HTTP_STATUS.CREATED },
    );
  } catch (error) {
    console.error('Registration error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: AUTH_ERROR_MESSAGES.REGISTER_SERVER_ERROR,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
