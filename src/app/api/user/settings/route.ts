/**
 * ユーザー設定API
 * GET /api/user/settings - 設定取得
 * PUT /api/user/settings - 設定更新
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { updateSettingsSchema } from '@/schema/user';
import type { UserSettings } from '@/schema/user';
import {
  HTTP_STATUS,
  ERROR_CODE,
  SUPABASE_ERROR_CODE,
  SETTINGS_ERROR_MESSAGES,
  SETTINGS_SUCCESS_MESSAGES,
  API_ERROR_MESSAGES,
  THEME_DEFAULTS,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  STREAMING_SCOPE_DEFAULT,
  COOKIE_CONSENT_VERSION,
  COOKIE_CONSENT_MIN_AT,
} from '@/constants';
import type { ConsentValue, StreamingScope } from '@/constants';

/** デフォルトのユーザー設定 */
const DEFAULT_SETTINGS: UserSettings = {
  theme: THEME_DEFAULTS.DEFAULT,
  notificationEnabled: false,
  streamingNoticeScope: STREAMING_SCOPE_DEFAULT,
  cookieConsent: 'unset',
  cookieConsentAt: null,
  cookieConsentVersion: null,
};

/** 端末の時計ずれを見込んで未来を許容する幅（ミリ秒） */
const CONSENT_AT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * クライアントが申告した同意日時を保存できる形へ正規化する
 *
 * 不正でも 400 にはしない。拒否すると「端末の時計が進んでいる利用者は
 * 同意状態が永久に保存されず、リトライがレート制限を食い潰す」という
 * 詰みが起きる。同意状態そのものは必ず保存し、日時だけを丸める。
 */
function normalizeConsentAt(
  consent: ConsentValue,
  rawAt: string | null,
): string | null {
  // 未決定に日時は持たせない（CHECK 制約 chk_user_settings_cookie_consent_at）
  if (consent === 'unset') return null;
  if (rawAt === null) return null;

  const parsed = Date.parse(rawAt);
  // zod を通っていればここには来ないが、保存前の最後の砦として残す
  if (Number.isNaN(parsed)) return null;

  const now = Date.now();
  if (parsed > now + CONSENT_AT_FUTURE_TOLERANCE_MS) {
    return new Date(now).toISOString();
  }
  if (parsed < Date.parse(COOKIE_CONSENT_MIN_AT)) {
    return new Date(now).toISOString();
  }
  return new Date(parsed).toISOString();
}

export async function GET() {
  try {
    // 認証チェック
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    // Supabaseクライアント検証
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // 設定取得
    const { data, error } = await supabase
      .from('user_settings')
      .select(
        'theme, notification_enabled, streaming_notice_scope, cookie_consent, cookie_consent_at, cookie_consent_version',
      )
      .eq('user_id', session.user.id)
      .single();

    // レコードが存在しない場合はデフォルト値を返す
    if (error?.code === SUPABASE_ERROR_CODE.NOT_FOUND || !data) {
      return NextResponse.json(
        {
          success: true,
          data: DEFAULT_SETTINGS,
        },
        { status: HTTP_STATUS.OK },
      );
    }

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          theme: data.theme,
          notificationEnabled: data.notification_enabled,
          // 列を足す前に作られた行は NULL になりうるため既定値へ倒す
          streamingNoticeScope: (data.streaming_notice_scope ??
            STREAMING_SCOPE_DEFAULT) as StreamingScope,
          cookieConsent: (data.cookie_consent ?? 'unset') as ConsentValue,
          cookieConsentAt: data.cookie_consent_at ?? null,
          cookieConsentVersion: data.cookie_consent_version ?? null,
        } satisfies UserSettings,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Get user settings error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: SETTINGS_ERROR_MESSAGES.FETCH_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}

export async function PUT(request: Request) {
  try {
    // 認証チェック
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    // Supabaseクライアント検証
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // レート制限チェック
    //
    // 検証より前に置く。識別子がセッションなのでこの時点で確定しており、
    // 検証を先にすると形式だけ崩したリクエストでカウンタを消費せずに
    // 書き込みを試し続けられる（`.claude/rules/api-route.md`）。
    //
    // #940 以前は逆順だった。当時の理由は「cookieConsentAt は端末の時計という
    // 外部要因で弾かれうる」だが、**時計のずれでは弾かれない**。スキーマ
    // （`src/schema/user.ts:55`）が見るのは ISO 8601 の形式だけで、ずれた時刻は
    // 400 にせず `normalizeConsentAt` が丸めるため。
    //
    // ⚠️ ただし懸念そのものは別の形で実在する。localStorage の `at` が壊れている
    // 端末では、初回マージの PUT（`useConsentServerSync.ts:171`）が生値を送るため
    // 400 になり、失敗すると `syncedUserId` を更新せず毎ロード再送する。
    // 変更追随側（同 `:201`）は `getSendableConsentAt()` で正規化しているので、
    // マージ側だけが素通しになっている。この順序変更でその 400 もカウンタを
    // 消費するようになった。根治はクライアント側（#962）。
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.WRITE_SETTINGS,
      RATE_LIMIT_CONFIG.WRITE_SETTINGS.maxAttempts,
      RATE_LIMIT_CONFIG.WRITE_SETTINGS.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    // リクエストボディの取得・バリデーション
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      // JSON として壊れている。catch へ落とすと 500 になり、
      // 利用者側の誤りがサーバーエラーとして見えてしまう
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: API_ERROR_MESSAGES.VALIDATION_ERROR,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const result = updateSettingsSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: API_ERROR_MESSAGES.VALIDATION_ERROR,
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // DB用のカラム名に変換
    const updateData: Record<string, unknown> = {};
    if (result.data.theme !== undefined) {
      updateData.theme = result.data.theme;
    }
    if (result.data.notificationEnabled !== undefined) {
      updateData.notification_enabled = result.data.notificationEnabled;
    }
    if (result.data.streamingNoticeScope !== undefined) {
      updateData.streaming_notice_scope = result.data.streamingNoticeScope;
    }

    if (result.data.cookieConsent !== undefined) {
      const consent = result.data.cookieConsent;
      updateData.cookie_consent = consent;
      // 版はサーバーが書く。状態が変わらない更新でも必ず書くこと。
      // 書かないと旧版のまま残り、別端末が毎回「版違い＝未決定」と判定して
      // バナーを無限に再表示する
      updateData.cookie_consent_version = COOKIE_CONSENT_VERSION;

      // 現在値を読んで、状態が変わらないなら日時を据え置く
      // （最初の意思表示時刻を証跡として保つ）。
      // 行が無い利用者（初回同意がまさにそれ）で落ちないよう maybeSingle を使う
      const { data: current } = await supabase
        .from('user_settings')
        .select('cookie_consent, cookie_consent_version')
        .eq('user_id', session.user.id)
        .maybeSingle();

      // 版が上がったあとの再同意では、状態が granted のままでも日時を
      // 更新する。据え置くと「v2 がまだ存在しなかった日付で v2 に同意した」
      // という矛盾した証跡になる
      const isReconsentForNewVersion =
        current?.cookie_consent_version !== COOKIE_CONSENT_VERSION;

      if (current?.cookie_consent !== consent || isReconsentForNewVersion) {
        updateData.cookie_consent_at = normalizeConsentAt(
          consent,
          result.data.cookieConsentAt ?? null,
        );
      }
    }

    // upsert（存在しなければ作成、存在すれば更新）
    const { error: upsertError } = await supabase.from('user_settings').upsert(
      {
        user_id: session.user.id,
        ...updateData,
      },
      { onConflict: 'user_id' },
    );

    if (upsertError) {
      throw upsertError;
    }

    return NextResponse.json(
      {
        success: true,
        message: SETTINGS_SUCCESS_MESSAGES.UPDATED,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Update user settings error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: SETTINGS_ERROR_MESSAGES.UPDATE_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
