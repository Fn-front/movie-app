/**
 * @jest-environment node
 */

/**
 * `otp_codes.action_type` の許可リストと定数の突き合わせ（#1359）
 *
 * ⚠️ **TS に用途を足すだけでは効かない。** DB の CHECK 制約に無い
 * `action_type` を INSERT すると 23514 で落ち、確認コードが作れない。
 * `rate_limits` 側（`rateLimit.test.ts`）と同じ理由で実走査する。
 *
 * ⛔ **逆に、公開ルートへ出してはいけない用途がある。** `OTP_ACTION` に
 * 入れると `src/schema/otp.ts` の `PUBLIC_OTP_ACTIONS` 経由で
 * `/api/auth/otp/send` が受理し、宛先をセッションに固定する処理は
 * `password_change` のときしか走らないため、**未認証のまま任意のアドレスへ
 * 自サービス名義の確認コードを送れる**（#641 / #1261 / #1359）。
 */

import fs from 'fs';
import path from 'path';

import { EMAIL_CHANGE_OTP_ACTION } from './emailChange';
import { OTP_ACTION } from './otp';
import { TWO_FACTOR_OTP_ACTION } from './secondFactor';

// --- Helpers ---

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

/** 最新の `chk_otp_action_type` 定義（DROP → ADD の全量再定義）を読む */
function readLatestOtpActions(): string[] {
  const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

  const latest = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .filter((file) =>
      /ADD CONSTRAINT chk_otp_action_type/.test(
        stripComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')),
      ),
    )
    .sort()
    .pop();

  // 落ちたら: 定義の書き方を変えたなら、この抽出も一緒に直すこと
  expect(latest).toBeDefined();

  const sql = stripComments(
    fs.readFileSync(path.join(MIGRATIONS_DIR, latest!), 'utf8'),
  );

  // ⚠️ `chk_action_type`（rate_limits）が同じファイルにいる場合があるので、
  //    block を限定する
  const match = sql.match(
    /ADD CONSTRAINT chk_otp_action_type CHECK \(\s*action_type IN \(([\s\S]*?)\)\s*\)/,
  );

  expect(match).not.toBeNull();

  return [...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/** 公開ルートが受け付ける用途 */
const PUBLIC_ACTIONS: string[] = Object.values(OTP_ACTION);

/** 認証済みの経路からしか作らない用途 */
const INTERNAL_ACTIONS: string[] = [
  TWO_FACTOR_OTP_ACTION,
  EMAIL_CHANGE_OTP_ACTION,
];

// --- Tests ---

describe('chk_otp_action_type と定数の突き合わせ', () => {
  it('TS の用途はすべて DB の許可リストに入っている', () => {
    const allowed = readLatestOtpActions();
    const missing = [...PUBLIC_ACTIONS, ...INTERNAL_ACTIONS].filter(
      (action) => !allowed.includes(action),
    );

    // 落ちたら: 最新の chk_otp_action_type マイグレーションに値を足す。
    // ⚠️ 既存の値は1つも落とさず引き継ぐこと（全量再定義のため）
    expect(missing).toEqual([]);
  });

  it('DB 側に見覚えの無い用途が増えていない', () => {
    const allowed = readLatestOtpActions();
    const known = [...PUBLIC_ACTIONS, ...INTERNAL_ACTIONS];

    expect(allowed.filter((action) => !known.includes(action))).toEqual([]);
  });

  /**
   * ⛔ **これが崩れると #641 の穴が再発する。**
   *
   * `two_factor` と `email_change` は宛先がサーバー側で決まらないまま
   * 送信へ到達しうるため、公開ルートから到達させてはいけない。
   * とくに `email_change` は**宛先がまだ本人のものでないアドレス**。
   */
  it('認証済み専用の用途を OTP_ACTION に入れない', () => {
    for (const action of INTERNAL_ACTIONS) {
      expect(PUBLIC_ACTIONS).not.toContain(action);
    }
  });

  // 走査が空振りしていたら上のテストは無意味になる
  it('許可リストを実際に読めている', () => {
    expect(readLatestOtpActions().length).toBeGreaterThanOrEqual(5);
  });
});
