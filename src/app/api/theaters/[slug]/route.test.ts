/**
 * @jest-environment node
 */

/**
 * 劇場詳細API Route テスト (GET)
 */

import { GET } from './route';

// --- Mocks ---

const mockSelect = jest.fn();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockFrom = jest.fn((_table?: string) => ({
  select: mockSelect,
}));

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

const createGetRequest = () =>
  new Request('http://localhost/api/theaters/standard-medium');

const createContext = (slug: string) => ({
  params: Promise.resolve({ slug }),
});

const mockTheater = {
  id: 'uuid-1',
  name: '汎用中規模シアター',
  slug: 'standard-medium',
  format: 'standard',
  room_width: 20,
  room_depth: 25,
  room_height: 8,
  screen_width: 14,
  screen_height: 6,
  screen_center_x: 0,
  screen_center_y: 4,
  screen_center_z: 12.5,
  audio_layout: 'atmos_9_1_6',
  description: 'テスト劇場',
};

const mockSeats = [
  {
    id: 'seat-1',
    row_label: 'A',
    seat_number: 1,
    position_x: -7,
    position_y: 0,
    position_z: 5,
    seat_type: 'standard',
  },
];

const mockSpeakers = [
  {
    id: 'speaker-1',
    channel: 'L',
    position_x: -6,
    position_y: 4,
    position_z: 12,
    power_watts: 500,
  },
];

/**
 * 直近の `.select()` に渡された文字列
 *
 * 埋め込みの取りこぼしを検知するために記録する（awards 側と同じ作法）
 */
let lastSelectColumns: string | undefined;

/** 埋め込み1本のクエリをモックする（#1275 で3本から1本になった） */
function setupQuery(
  result: { data: unknown; error: unknown },
  orderSpy?: jest.Mock,
) {
  const order = orderSpy ?? jest.fn();
  // `order` が自身を返すチェーンなので、型注釈が無いと TS7022 になる
  const chain: { order: jest.Mock; single: jest.Mock } = {
    order: jest.fn((...args: unknown[]) => {
      order(...args);
      return chain;
    }),
    single: jest.fn().mockResolvedValue(result),
  };

  mockFrom.mockImplementation(() => ({
    // ⚠️ 引数を捨てない。捨てると埋め込みから
    // `theater_speakers(...)` を落としても全テストが緑のまま通る（#1275）
    select: jest.fn((columns: string) => {
      lastSelectColumns = columns;
      return {
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            is: jest.fn().mockReturnValue(chain),
          }),
        }),
      };
    }),
  }));

  return chain;
}

/** 埋め込みの戻り（theater_seats / theater_speakers がネストする） */
const mockEmbedded = {
  ...mockTheater,
  theater_seats: mockSeats,
  theater_speakers: mockSpeakers,
};

function setupFullQuery(orderSpy?: jest.Mock) {
  return setupQuery({ data: mockEmbedded, error: null }, orderSpy);
}

function setupNotFound() {
  return setupQuery({
    data: null,
    error: { code: 'PGRST116', message: 'not found' },
  });
}

// --- Tests ---

describe('GET /api/theaters/[slug]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastSelectColumns = undefined;
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('劇場詳細を座席・スピーカーと共に取得できる', async () => {
    setupFullQuery();

    const response = await GET(
      createGetRequest(),
      createContext('standard-medium'),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.theater.slug).toBe('standard-medium');
    expect(json.data.theater.seats).toEqual(mockSeats);
    expect(json.data.theater.speakers).toEqual(mockSpeakers);
  });

  /**
   * 座席の並び順が従来と一致する（#1275）
   *
   * 3本の直列クエリを埋め込み1本にまとめたので、`.order()` に
   * `referencedTable` を付けないと**埋め込み側には効かない**。
   * 付け忘れると座席が任意順で返り、座席表の描画が崩れる。
   */
  it('座席は row_label → seat_number の順で取る', async () => {
    const orderSpy = jest.fn();
    setupFullQuery(orderSpy);

    await GET(createGetRequest(), createContext('standard-medium'));

    expect(orderSpy).toHaveBeenNthCalledWith(1, 'row_label', {
      referencedTable: 'theater_seats',
    });
    expect(orderSpy).toHaveBeenNthCalledWith(2, 'seat_number', {
      referencedTable: 'theater_seats',
    });
  });

  // 3本の直列クエリを1本にまとめた（#1275）。戻すとこのテストが落ちる
  it('DBへ投げるのは1本だけ', async () => {
    setupFullQuery();

    const response = await GET(
      createGetRequest(),
      createContext('standard-medium'),
    );

    expect(response.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('theaters');
  });

  /**
   * ⚠️ 取得失敗を「存在しない」と偽らない
   *
   * 1往復にまとめたことで、以前は座席・スピーカーの取得失敗として 500 に
   * なっていた経路もここへ合流する。`PGRST116` 以外まで 404 に倒すと、
   * DB の不調が「劇場が無い」として返る
   */
  it('PGRST116 以外のエラーは404ではなく500を返す', async () => {
    setupQuery({
      data: null,
      error: { code: '57014', message: 'canceling statement due to timeout' },
    });

    const response = await GET(
      createGetRequest(),
      createContext('standard-medium'),
    );

    expect(response.status).toBe(500);
  });

  // 埋め込みが空（座席・スピーカー未登録）でも落ちない
  it('座席・スピーカーが無い劇場は空配列を返す', async () => {
    setupQuery({
      data: { ...mockTheater, theater_seats: [], theater_speakers: [] },
      error: null,
    });

    const response = await GET(
      createGetRequest(),
      createContext('standard-medium'),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.theater.seats).toEqual([]);
    expect(json.data.theater.speakers).toEqual([]);
  });

  /**
   * 埋め込みの取りこぼしを検知する（#1275）
   *
   * `theater_speakers(...)` を落としても、モックが常にスピーカー入りの
   * 行を返すため他のテストは緑のまま通る。本番では `speakers` が
   * `undefined` → `?? []` で空配列になり、スピーカーが静かに消える
   */
  it('劇場・座席・スピーカーを1つのSELECTで指定する', async () => {
    setupFullQuery();

    await GET(createGetRequest(), createContext('standard-medium'));

    expect(lastSelectColumns).toContain('theater_seats(');
    expect(lastSelectColumns).toContain('theater_speakers(');
    // 座席・スピーカーの列も取り漏れていないこと
    expect(lastSelectColumns).toContain('seat_type');
    expect(lastSelectColumns).toContain('directivity_alpha');
  });

  /**
   * 埋め込みの生キーをレスポンスに残さない
   *
   * `...theaterFields` を `...theater` に書き戻すと `theater_seats` /
   * `theater_speakers` が二重に載る（imax-gt なら544席ぶん）
   */
  it('埋め込みの生キーをレスポンスに含めない', async () => {
    setupFullQuery();

    const response = await GET(
      createGetRequest(),
      createContext('standard-medium'),
    );
    const json = await response.json();

    expect(json.data.theater).not.toHaveProperty('theater_seats');
    expect(json.data.theater).not.toHaveProperty('theater_speakers');
    expect(json.data.theater.seats).toHaveLength(1);
    expect(json.data.theater.speakers).toHaveLength(1);
  });

  it('Cache-Controlヘッダーが設定される', async () => {
    setupFullQuery();

    const response = await GET(
      createGetRequest(),
      createContext('standard-medium'),
    );

    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600');
  });

  it('存在しないslugでは404を返す', async () => {
    setupNotFound();

    const response = await GET(
      createGetRequest(),
      createContext('non-existent'),
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('不正なslug形式ではバリデーションエラーを返す', async () => {
    const response = await GET(
      createGetRequest(),
      createContext('INVALID SLUG!'),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('未認証時は401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      createGetRequest(),
      createContext('standard-medium'),
    );

    expect(response.status).toBe(401);
  });

  it('レート制限超過時は429を返す', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 60,
    });

    const response = await GET(
      createGetRequest(),
      createContext('standard-medium'),
    );
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(json.error.details.retryAfter).toBe(60);
  });

  describe('処理順', () => {
    // 認証 → レート制限 → バリデーション（#940）。
    // 識別子が session.user.id なので検証より前に確定している
    // （`.claude/rules/api-route.md`）
    it('バリデーションエラー時もレート制限を消費する', async () => {
      const response = await GET(
        createGetRequest(),
        createContext('INVALID SLUG!'),
      );

      expect(response.status).toBe(400);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    });

    it('レート制限超過時は、slugが不正でも429を返す', async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfter: 60,
      });

      const response = await GET(
        createGetRequest(),
        createContext('INVALID SLUG!'),
      );

      expect(response.status).toBe(429);
    });
  });
});
