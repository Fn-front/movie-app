/**
 * @jest-environment node
 */

/**
 * ユーザー設定API テスト (GET / PUT)
 */

import {
  SETTINGS_ERROR_MESSAGES,
  SETTINGS_SUCCESS_MESSAGES,
  SUPABASE_ERROR_CODE,
} from '@/constants';

import { GET, PUT } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('@/helpers/auth', () => ({
  getAuthSession: jest.fn().mockResolvedValue({ user: { id: 'user-123' } }),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

import { getAuthSession } from '@/helpers/auth';

// --- Helpers ---

const createPutRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/user/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// --- Tests ---

describe('GET /api/user/settings', () => {
  beforeEach(() => {
    // clearAllMocks は mockReturnValueOnce のキューを捨てない（捨てるのは
    // mockReset）。消費され残った once が次のテストへ持ち越されると、
    // 以降すべてのモック応答が1つずれて不可解な失敗になる
    jest.clearAllMocks();
    mockFrom.mockReset();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('設定を取得できる', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { theme: 'dark', notification_enabled: true },
            error: null,
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      theme: 'dark',
      notificationEnabled: true,
      streamingNoticeScope: 'any',
      cookieConsent: 'unset',
      cookieConsentAt: null,
      cookieConsentVersion: null,
    });
  });

  it('レコード未存在時はデフォルト値を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: null,
            error: { code: SUPABASE_ERROR_CODE.NOT_FOUND },
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      theme: 'system',
      notificationEnabled: false,
      streamingNoticeScope: 'any',
      cookieConsent: 'unset',
      cookieConsentAt: null,
      cookieConsentVersion: null,
    });
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it('DBエラー時（data有り）に500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { theme: 'light', notification_enabled: false },
            error: { code: 'OTHER_ERROR', message: 'DB error' },
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.message).toBe(SETTINGS_ERROR_MESSAGES.FETCH_FAILED);
  });

  /**
   * ⚠️ これが実際に起きる組み合わせ（#1153）
   *
   * `.single()` は**任意のエラーで `data: null`** を返すため、DB 障害は
   * 必ずこの形になる（上の「data有り」は実際には起こらない組み合わせ）。
   *
   * 既定値で 200 を返すと、クライアントは「通知オフ」「配信範囲はすべて」を
   * **確定値として描く**。しかも誤った表示のままチェックを入れ直すと
   * `updateSettings` が走り、表示の誤りがデータの誤りに変わる
   */
  it('DBエラー時（data無し）に500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: null,
            error: { code: 'OTHER_ERROR', message: 'DB error' },
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.message).toBe(SETTINGS_ERROR_MESSAGES.FETCH_FAILED);
  });

  describe('レート制限（#934）', () => {
    it('読み取り用の read_api_user_data として数える', async () => {
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({ single: () => ({ data: null, error: null }) }),
        }),
      });

      await GET();

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'user-123',
        'read_api_user_data',
        200,
        1,
      );
    });

    it('上限超過で429を返し、DBを読まない', async () => {
      // /settings を開くと同一の GET が3本飛ぶ。PUT だけ守っても意味が薄い
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfter: 600,
      });

      const response = await GET();

      expect(response.status).toBe(429);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });
});

describe('PUT /api/user/settings', () => {
  beforeEach(() => {
    // clearAllMocks は mockReturnValueOnce のキューを捨てない（捨てるのは
    // mockReset）。消費され残った once が次のテストへ持ち越されると、
    // 以降すべてのモック応答が1つずれて不可解な失敗になる
    jest.clearAllMocks();
    mockFrom.mockReset();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('テーマを更新できる', async () => {
    mockFrom.mockReturnValueOnce({
      upsert: () => ({ error: null }),
    });

    const response = await PUT(createPutRequest({ theme: 'dark' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe(SETTINGS_SUCCESS_MESSAGES.UPDATED);
  });

  it('通知設定を更新できる', async () => {
    mockFrom.mockReturnValueOnce({
      upsert: () => ({ error: null }),
    });

    const response = await PUT(createPutRequest({ notificationEnabled: true }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('不正なテーマ値でバリデーションエラー400を返す', async () => {
    const response = await PUT(createPutRequest({ theme: 'invalid' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await PUT(createPutRequest({ theme: 'dark' }));

    expect(response.status).toBe(401);
  });

  it('DBエラー時に500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      upsert: () => ({ error: new Error('Upsert failed') }),
    });

    const response = await PUT(createPutRequest({ theme: 'dark' }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.message).toBe(SETTINGS_ERROR_MESSAGES.UPDATE_FAILED);
  });

  it('レート制限超過時に429を返す', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 60,
    });

    const response = await PUT(createPutRequest({ theme: 'dark' }));
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(json.error.details.retryAfter).toBe(60);
  });
});

describe('配信範囲設定', () => {
  /** upsert に渡された行を記録する */
  let upsertedData: Record<string, unknown> = {};

  /** user_settings の upsert をモックする */
  const mockUpsert = () => {
    upsertedData = {};
    mockFrom.mockReturnValueOnce({
      upsert: (row: Record<string, unknown>) => {
        upsertedData = row;
        return { error: null };
      },
    });
  };

  it('GET で streamingNoticeScope を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: {
              theme: 'dark',
              notification_enabled: true,
              streaming_notice_scope: 'flatrate',
            },
            error: null,
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(json.data.streamingNoticeScope).toBe('flatrate');
  });

  it('設定が未作成なら既定の any を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: null,
            error: { code: SUPABASE_ERROR_CODE.NOT_FOUND },
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(json.data.streamingNoticeScope).toBe('any');
  });

  it('列を足す前に作られた行は既定値に倒す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: {
              theme: 'dark',
              notification_enabled: true,
              streaming_notice_scope: null,
            },
            error: null,
          }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(json.data.streamingNoticeScope).toBe('any');
  });

  it('PUT で streamingNoticeScope を保存する', async () => {
    mockUpsert();

    const response = await PUT(
      createPutRequest({ streamingNoticeScope: 'flatrate' }),
    );

    expect(response.status).toBe(200);
    expect(upsertedData.streaming_notice_scope).toBe('flatrate');
  });

  it('未知の値は400を返す', async () => {
    const response = await PUT(
      createPutRequest({ streamingNoticeScope: 'rent-only' }),
    );

    expect(response.status).toBe(400);
  });

  it('他の設定だけ更新しても配信範囲に触れない', async () => {
    mockUpsert();

    await PUT(createPutRequest({ notificationEnabled: true }));

    expect(upsertedData).not.toHaveProperty('streaming_notice_scope');
  });
});

describe('Cookie同意', () => {
  /** upsert に渡された行を記録する */
  let upsertedData: Record<string, unknown> = {};

  /**
   * cookieConsent を含む PUT は upsert の前に現在値を select する。
   * select → upsert の2段チェーンを順に積む。
   *
   * @param currentConsent 既存行の cookie_consent。null なら行が無い状態
   * @param currentVersion 既存行の cookie_consent_version。既定は現行版
   */
  const mockConsentPut = (
    currentConsent: string | null,
    currentVersion: number | null = 1,
  ) => {
    upsertedData = {};
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () => ({
            data:
              currentConsent === null
                ? null
                : {
                    cookie_consent: currentConsent,
                    cookie_consent_version: currentVersion,
                  },
            error: null,
          }),
        }),
      }),
    });
    mockFrom.mockReturnValueOnce({
      upsert: (row: Record<string, unknown>) => {
        upsertedData = row;
        return { error: null };
      },
    });
  };

  /**
   * COOKIE_CONSENT_MIN_AT より後、かつ常に過去になる妥当な同意日時
   *
   * ここでは実時計のまま動かす。fake timer を describe 全体へ張ると、
   * undici の `request.json()` と同居して不安定になる。時刻固定が要るのは
   * クランプの検証だけなので、そちらの describe に閉じ込める
   */
  const AT = '2026-11-03T00:30:00.000Z';

  beforeEach(() => {
    // clearAllMocks は mockReturnValueOnce のキューを捨てない（捨てるのは
    // mockReset）。消費され残った once が次のテストへ持ち越されると、
    // 以降すべてのモック応答が1つずれて不可解な失敗になる
    jest.clearAllMocks();
    mockFrom.mockReset();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  describe('GET', () => {
    it('3フィールドを返す', async () => {
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            single: () => ({
              data: {
                theme: 'dark',
                notification_enabled: true,
                streaming_notice_scope: 'any',
                cookie_consent: 'granted',
                cookie_consent_at: AT,
                cookie_consent_version: 1,
              },
              error: null,
            }),
          }),
        }),
      });

      const response = await GET();
      const json = await response.json();

      expect(json.data.cookieConsent).toBe('granted');
      expect(json.data.cookieConsentAt).toBe(AT);
      expect(json.data.cookieConsentVersion).toBe(1);
    });

    it('列を足す前に作られた行は未決定・null に倒す', async () => {
      mockFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            single: () => ({
              data: {
                theme: 'dark',
                notification_enabled: true,
                streaming_notice_scope: 'any',
                cookie_consent: null,
                cookie_consent_at: null,
                cookie_consent_version: null,
              },
              error: null,
            }),
          }),
        }),
      });

      const response = await GET();
      const json = await response.json();

      expect(json.data.cookieConsent).toBe('unset');
      expect(json.data.cookieConsentAt).toBeNull();
      expect(json.data.cookieConsentVersion).toBeNull();
    });
  });

  describe('PUT', () => {
    it('同意状態と日時を保存し、版はサーバーが書く', async () => {
      mockConsentPut(null);

      const response = await PUT(
        createPutRequest({ cookieConsent: 'granted', cookieConsentAt: AT }),
      );

      expect(response.status).toBe(200);
      expect(upsertedData.cookie_consent).toBe('granted');
      expect(upsertedData.cookie_consent_at).toBe(AT);
      expect(upsertedData.cookie_consent_version).toBe(1);
    });

    it('クライアントが送った版は無視する', async () => {
      // 版をクライアント申告にすると、古い同意を現行版に見せかけて
      // 再同意を回避できてしまう
      mockConsentPut(null);

      await PUT(
        createPutRequest({
          cookieConsent: 'granted',
          cookieConsentAt: AT,
          cookieConsentVersion: 99,
        }),
      );

      expect(upsertedData.cookie_consent_version).toBe(1);
    });

    it('状態が変わらないときは日時を据え置き、版だけ書く', async () => {
      // 最初の意思表示時刻を証跡として保つ。版を書かないと別端末が毎回
      // 「版違い＝未決定」と判定してバナーを無限に再表示する
      mockConsentPut('granted');

      await PUT(
        createPutRequest({ cookieConsent: 'granted', cookieConsentAt: AT }),
      );

      expect(upsertedData).not.toHaveProperty('cookie_consent_at');
      expect(upsertedData.cookie_consent_version).toBe(1);
    });

    it('版が上がったあとの再同意では日時も更新する', async () => {
      // 据え置くと「新しい版がまだ存在しなかった日付でその版に同意した」
      // という矛盾した証跡になる
      mockConsentPut('granted', 0);

      await PUT(
        createPutRequest({ cookieConsent: 'granted', cookieConsentAt: AT }),
      );

      expect(upsertedData.cookie_consent_at).toBe(AT);
      expect(upsertedData.cookie_consent_version).toBe(1);
    });

    it('版が未記録の移行行でも日時を更新する', async () => {
      mockConsentPut('granted', null);

      await PUT(
        createPutRequest({ cookieConsent: 'granted', cookieConsentAt: AT }),
      );

      expect(upsertedData.cookie_consent_at).toBe(AT);
    });

    it('状態が変わるときは日時を更新する', async () => {
      mockConsentPut('granted');

      await PUT(
        createPutRequest({ cookieConsent: 'denied', cookieConsentAt: AT }),
      );

      expect(upsertedData.cookie_consent_at).toBe(AT);
    });

    it('行が無い利用者でも500にならない（初回同意）', async () => {
      mockConsentPut(null);

      const response = await PUT(
        createPutRequest({ cookieConsent: 'granted', cookieConsentAt: AT }),
      );

      expect(response.status).toBe(200);
      expect(upsertedData.cookie_consent_at).toBe(AT);
    });

    it('未決定を送ると日時を null へ正規化する（CHECK制約を満たす）', async () => {
      mockConsentPut('granted');

      await PUT(
        createPutRequest({ cookieConsent: 'unset', cookieConsentAt: AT }),
      );

      expect(upsertedData.cookie_consent).toBe('unset');
      expect(upsertedData.cookie_consent_at).toBeNull();
    });

    it('他の設定だけ更新しても同意に触れない', async () => {
      upsertedData = {};
      mockFrom.mockReturnValueOnce({
        upsert: (row: Record<string, unknown>) => {
          upsertedData = row;
          return { error: null };
        },
      });

      await PUT(createPutRequest({ theme: 'dark' }));

      expect(upsertedData).not.toHaveProperty('cookie_consent');
      expect(upsertedData).not.toHaveProperty('cookie_consent_version');
    });
  });

  describe('日時のクランプ', () => {
    /** 丸め先を検証するため、ここだけ現在時刻を固定する */
    const NOW = '2026-11-10T00:00:00.000Z';

    beforeAll(() => {
      jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
      jest.setSystemTime(new Date(NOW));
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('未来すぎる日時はサーバー受信時刻へ丸める', async () => {
      // 端末の時計が進んでいても同意状態そのものは必ず保存する。
      // 400 で拒否すると永久に保存されず、リトライがレート制限を食い潰す
      mockConsentPut(null);
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const response = await PUT(
        createPutRequest({ cookieConsent: 'granted', cookieConsentAt: future }),
      );

      expect(response.status).toBe(200);
      expect(upsertedData.cookie_consent).toBe('granted');
      expect(upsertedData.cookie_consent_at).toBe(NOW);
    });

    it('時計ずれの範囲（+5分以内）はそのまま通す', async () => {
      mockConsentPut(null);
      const slightlyAhead = new Date(Date.now() + 60 * 1000).toISOString();

      await PUT(
        createPutRequest({
          cookieConsent: 'granted',
          cookieConsentAt: slightlyAhead,
        }),
      );

      expect(upsertedData.cookie_consent_at).toBe(slightlyAhead);
    });

    it('機能リリース前の日時はサーバー受信時刻へ丸める', async () => {
      mockConsentPut(null);

      await PUT(
        createPutRequest({
          cookieConsent: 'granted',
          cookieConsentAt: '2020-01-02T00:00:00.000Z',
        }),
      );

      expect(upsertedData.cookie_consent_at).toBe(NOW);
    });
  });

  describe('バリデーション', () => {
    it('同意状態だけ送ると400（証跡の改ざんを防ぐ）', async () => {
      const response = await PUT(createPutRequest({ cookieConsent: 'denied' }));

      expect(response.status).toBe(400);
    });

    it('日時だけ送ると400', async () => {
      const response = await PUT(createPutRequest({ cookieConsentAt: AT }));

      expect(response.status).toBe(400);
    });

    it('未知の同意状態は400', async () => {
      const response = await PUT(
        createPutRequest({ cookieConsent: 'maybe', cookieConsentAt: AT }),
      );

      expect(response.status).toBe(400);
    });

    it('ISO 8601 でない日時は400', async () => {
      const response = await PUT(
        createPutRequest({
          cookieConsent: 'granted',
          cookieConsentAt: 'not-a-date',
        }),
      );

      expect(response.status).toBe(400);
    });

    it('PostgREST 形式（+00:00）の日時も受け付ける', async () => {
      // サーバーから降ろした値をそのまま送り返す経路があるため
      mockConsentPut(null);

      const response = await PUT(
        createPutRequest({
          cookieConsent: 'granted',
          cookieConsentAt: '2026-11-03T12:00:00+00:00',
        }),
      );

      expect(response.status).toBe(200);
    });
  });

  describe('処理順', () => {
    // 認証 → レート制限 → バリデーション の順であることの回帰テスト（#940）。
    // 識別子が session.user.id なので検証より前に確定しており、
    // 逆順だと形式だけ崩したリクエストでカウンタを消費せずに書き込みを
    // 試し続けられる（`.claude/rules/api-route.md`）
    it('バリデーションエラー時もレート制限を消費する', async () => {
      const response = await PUT(createPutRequest({ cookieConsent: 'denied' }));

      expect(response.status).toBe(400);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    });

    it('壊れたJSONでもレート制限を消費し、400を返す', async () => {
      const request = new Request('http://localhost/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{"theme":',
      });

      const response = await PUT(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    });

    it('レート制限超過時は、ボディが不正でも429を返す（検証より先に判定する）', async () => {
      // Once にすること。mockResolvedValue だと clearAllMocks でも実装が残り、
      // 次の「正常系」が 429 経路を走って緑のまま無意味になる
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfter: 60,
      });

      const response = await PUT(createPutRequest({ cookieConsent: 'denied' }));

      expect(response.status).toBe(429);
    });

    it('正常系ではレート制限を消費する', async () => {
      mockConsentPut(null);

      const response = await PUT(
        createPutRequest({ cookieConsent: 'granted', cookieConsentAt: AT }),
      );

      expect(response.status).toBe(200);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    });
  });
});
