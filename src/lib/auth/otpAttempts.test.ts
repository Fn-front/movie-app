/**
 * @jest-environment node
 */

/**
 * 確認コードの試行回数の加算（#1284）
 *
 * ⚠️ 固定したいのは**失敗したときにどちらへ倒すか**。加算できていない以上
 * 「あと何回試せるか」は分からないので、緩い側（0回）ではなく厳しい側へ倒す。
 *
 * ⚠️ **SQL は jest から実行できないので、RPC の中身はマイグレーションを
 * 読んで固定する**（下の describe）。
 */

import fs from 'fs';
import path from 'path';

import type { SupabaseClient } from '@supabase/supabase-js';

import { OTP_CONFIG } from '@/constants/otp';

import { incrementOtpAttempts } from './otpAttempts';

// --- Helpers ---

const createSupabase = (rpc: jest.Mock) =>
  ({ rpc }) as unknown as SupabaseClient;

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

// --- Tests ---

describe('incrementOtpAttempts', () => {
  it('RPC を行のIDで呼ぶ', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 3, error: null });

    await incrementOtpAttempts(createSupabase(rpc), 'otp-1');

    expect(rpc).toHaveBeenCalledWith('increment_otp_attempts', {
      p_id: 'otp-1',
    });
  });

  /**
   * ⚠️ 戻り値は**加算後**の値。`auth/otp/verify` は「この回で上限に達したか」で
   * 文言と導線を出し分けている（#1248）。読み直すと、そこでまた競合する。
   */
  it('加算後の値を返す', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 3, error: null });

    await expect(
      incrementOtpAttempts(createSupabase(rpc), 'otp-1'),
    ).resolves.toBe(3);
  });

  /**
   * ⚠️ **投げない。** 呼ぶのは「コードが一致しなかった」と確定した後で、
   * 利用者へ返す結果はもう決まっている。例外を漏らすと**不一致なのに 500**に
   * なって理由が伝わらない。
   */
  it.each([
    ['RPC がエラーを返す', { data: null, error: { message: 'db down' } }],
    ['RPC が数値を返さない', { data: null, error: null }],
  ])('%s でも投げず、上限値を返す', async (_label, result) => {
    const rpc = jest.fn().mockResolvedValue(result);

    await expect(
      incrementOtpAttempts(createSupabase(rpc), 'otp-1'),
    ).resolves.toBe(OTP_CONFIG.MAX_ATTEMPTS);
  });

  it('RPC が投げても飲み込み、上限値を返す', async () => {
    const rpc = jest.fn().mockRejectedValue(new Error('connection lost'));

    await expect(
      incrementOtpAttempts(createSupabase(rpc), 'otp-1'),
    ).resolves.toBe(OTP_CONFIG.MAX_ATTEMPTS);
  });

  // 数えられなかったことに気づける唯一の手がかり
  it('失敗したらログに出す', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: {} });

    await incrementOtpAttempts(createSupabase(rpc), 'otp-1');

    expect(errorSpy).toHaveBeenCalled();
  });
});

/**
 * ⚠️ **SQL は jest から実行できないので、書いてあることを読んで固定する。**
 *
 * ここが無いと RPC の中身を read-then-write と等価な形に書き換えても
 * 単体テストは1件も落ちない。
 */
describe('increment_otp_attempts（マイグレーション）', () => {
  const sql = (() => {
    const dir = path.join(process.cwd(), 'supabase', 'migrations');
    const file = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .filter((name) =>
        /CREATE OR REPLACE FUNCTION public\.increment_otp_attempts/.test(
          fs.readFileSync(path.join(dir, name), 'utf8'),
        ),
      )
      .sort()
      .pop();

    // 落ちたら: 関数の定義が見つからない。作り直したならここも追従させる
    expect(file).toBeDefined();

    return fs.readFileSync(path.join(dir, file!), 'utf8');
  })();

  const body = sql.replace(/--[^\n]*/g, '');

  /**
   * ⛔ **DB 側で式として加算する。** `SET attempts = <読んだ値>` の形だと
   * read-then-write と同じで、同時実行で加算が失われる。
   */
  it('attempts を式で加算する', () => {
    expect(body).toMatch(/SET attempts = LEAST\(attempts \+ 1, 5\)/);
  });

  /**
   * ⚠️ **上限で頭打ちにする。** `chk_otp_attempts` が `attempts <= 5` なので、
   * 素の `attempts + 1` は6回目で 23514 を投げる。
   */
  it('上限で頭打ちにする（23514 を投げない）', () => {
    expect(body).toMatch(/LEAST\(/);
    expect(body).not.toMatch(/SET attempts = attempts \+ 1\b(?!,)/);
  });

  // 加算後の値を返さないと、呼び出し側が読み直して再び競合する
  it('加算後の値を返す', () => {
    expect(body).toMatch(/RETURNING attempts INTO v_attempts/);
    expect(body).toMatch(/RETURN v_attempts;/);
  });

  // RLS をバイパスしない
  it('SECURITY INVOKER で search_path を固定する', () => {
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).toMatch(/SET search_path = public, pg_temp/);
  });

  /**
   * ⛔ `FROM PUBLIC` だけでは不十分。Supabase の既定付与で anon /
   * authenticated に残り、公開されている anon キーから到達できる。
   */
  it('EXECUTE は service_role だけに与える', () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.increment_otp_attempts\(UUID\)\s*\n?\s*FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.increment_otp_attempts\(UUID\)\s*\n?\s*TO service_role;/,
    );
  });
});
