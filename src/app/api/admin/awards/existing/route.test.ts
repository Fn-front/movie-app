/**
 * @jest-environment node
 */

const SESSION = { user: { id: 'admin-1' } };
let mockSupabase: unknown;
jest.mock('@/helpers/adminAuth', () => ({
  withAdminAuth:
    (handler: (ctx: unknown) => Promise<Response>) => (request: Request) =>
      handler({ session: SESSION, supabase: mockSupabase, request }),
}));

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
}));

import { GET } from './route';

/** select(...).eq('award_name').eq('award_year') の鎖 */
function createSupabase(result: { count: number | null; error: unknown }) {
  const eqYear = jest.fn().mockResolvedValue(result);
  const eqName = jest.fn(() => ({ eq: eqYear }));
  const select = jest.fn(() => ({ eq: eqName }));
  const from = jest.fn(() => ({ select }));

  return { supabase: { from }, from, select, eqName, eqYear };
}

const call = (query: string) =>
  GET(new Request(`http://localhost/api/admin/awards/existing${query}`));

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
});

describe('GET /api/admin/awards/existing', () => {
  it('賞と年で絞った件数を返す', async () => {
    const db = createSupabase({ count: 42, error: null });
    mockSupabase = db.supabase;

    const response = await call('?awardName=cannes&year=2024');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.count).toBe(42);
    expect(db.from).toHaveBeenCalledWith('award_movies');
    expect(db.eqName).toHaveBeenCalledWith('award_name', 'cannes');
    expect(db.eqYear).toHaveBeenCalledWith('award_year', 2024);
  });

  // 件数の表示が古いと「まだ入っていない」と誤解させるため共有キャッシュに載せない
  it('キャッシュさせない', async () => {
    mockSupabase = createSupabase({ count: 0, error: null }).supabase;

    const response = await call('?awardName=cannes&year=2024');

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('0件でも200で返す', async () => {
    mockSupabase = createSupabase({ count: 0, error: null }).supabase;

    const body = await (await call('?awardName=cannes&year=2024')).json();

    expect(body.data.count).toBe(0);
  });

  it('count が null なら 0 に倒す', async () => {
    mockSupabase = createSupabase({ count: null, error: null }).supabase;

    const body = await (await call('?awardName=cannes&year=2024')).json();

    expect(body.data.count).toBe(0);
  });

  it('同期対象外の賞を400で拒否する', async () => {
    mockSupabase = createSupabase({ count: 0, error: null }).supabase;

    const response = await call('?awardName=japan_academy_awards&year=2024');

    expect(response.status).toBe(400);
  });

  it('賞の指定が無ければ400を返す', async () => {
    mockSupabase = createSupabase({ count: 0, error: null }).supabase;

    expect((await call('?year=2024')).status).toBe(400);
  });

  it('年が数値でなければ400を返す', async () => {
    mockSupabase = createSupabase({ count: 0, error: null }).supabase;

    expect((await call('?awardName=cannes&year=abc')).status).toBe(400);
  });

  it('賞ごとの下限より前の年を400で拒否する', async () => {
    mockSupabase = createSupabase({ count: 0, error: null }).supabase;

    // カンヌの第1回は1946年
    expect((await call('?awardName=cannes&year=1945')).status).toBe(400);
  });

  it('レート制限超過で429を返し、DBを叩かない', async () => {
    const db = createSupabase({ count: 0, error: null });
    mockSupabase = db.supabase;
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 });

    const response = await call('?awardName=cannes&year=2024');

    expect(response.status).toBe(429);
    expect(db.from).not.toHaveBeenCalled();
  });

  it('DBエラーは500を返す', async () => {
    mockSupabase = createSupabase({
      count: null,
      error: { message: 'boom' },
    }).supabase;

    const response = await call('?awardName=cannes&year=2024');

    expect(response.status).toBe(500);
  });
});
