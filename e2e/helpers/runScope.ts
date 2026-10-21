/**
 * E2Eの run スコープ（#793）
 *
 * 共有 Supabase DB に対して複数の CI run が同時に E2E を流せるよう、
 * テストデータの識別子を run ごとに分ける。
 *
 * 以前はワークフロー側の `concurrency: e2e-shared-db` でリポジトリ全体を
 * 直列化して衝突を避けていた。しかし GitHub Actions は同一 concurrency group の
 * pending を1つしか保持せず、2つ目が入ると古い pending を **キャンセル** する。
 * ジョブが1つも割り当てられないまま `cancelled` で終わるため、E2Eが一度も
 * 実行されないまま PR をマージできていた。直列化をやめる代わりに、衝突の
 * 原因だった「固定の識別子」をここで run 単位へ置き換える。
 *
 * ⚠️ 値は **プロセスをまたいで同じ** でなければならない。Playwright は
 * setup / worker / teardown を別プロセスで動かすため、乱数ではなく
 * 環境変数から決定論的に導出する。
 */

import { createHash } from 'crypto';

/**
 * 識別子として安全な文字だけを残す
 *
 * メールアドレスのローカル部とログに入るため、英数字以外は落とす。
 */
function sanitizeRunId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
}

/**
 * この実行を一意に表すIDを決める
 *
 * - `E2E_RUN_ID`: 明示指定。ローカルで複数同時に流したいときに使う
 * - CI: `GITHUB_RUN_ID` × `GITHUB_RUN_ATTEMPT`。再実行でも別IDになる
 * - それ以外: `local`。ローカルは通常1度に1回しか流さないため固定でよい
 *
 * ⚠️ `E2E_RUN_ID` は **プロセスの環境変数として渡す**こと
 * （例: `E2E_RUN_ID=foo npx playwright test`）。本モジュールは
 * `playwright.config.ts` の import として評価され、同ファイルの
 * `dotenv.config()` より先に走るため、`.env.local` に書いても効かない。
 */
function resolveRunId(): string {
  const explicit = process.env.E2E_RUN_ID;
  if (explicit) return sanitizeRunId(explicit) || 'local';

  const githubRunId = process.env.GITHUB_RUN_ID;
  if (githubRunId) {
    const attempt = process.env.GITHUB_RUN_ATTEMPT ?? '1';
    return sanitizeRunId(`${githubRunId}x${attempt}`) || 'local';
  }

  return 'local';
}

/** この実行を一意に表すID */
export const E2E_RUN_ID = resolveRunId();

/** run IDから導出した固定長のバイト列（IP・映画IDの採番に使う） */
const runDigest = createHash('sha256').update(E2E_RUN_ID).digest();

/**
 * run 固有のメールアドレスを組み立てる
 *
 * 末尾が `-<E2E_RUN_ID>@example.com` で揃うため、後片付けで
 * この run のレコードだけを前方/後方一致でまとめて消せる。
 *
 * @param localPart - 用途が分かる識別子（例: `e2e-two-factor`）
 * @returns run 固有のメールアドレス
 */
export function runScopedEmail(localPart: string): string {
  return `${localPart}-${E2E_RUN_ID}@example.com`;
}

/** この run のメールアドレスに一致する PostgREST の `like` パターン */
export const RUN_EMAIL_LIKE_PATTERN = `*-${E2E_RUN_ID}@example.com`;

/**
 * この run を表すクライアントIP
 *
 * Next.js は `x-forwarded-for` が無いとソケットの remoteAddress を補う
 * （node_modules/next/dist/server/base-server.js）。E2Eは常に localhost 接続のため
 * 全 run が同じ `::1` になり、送信元IP単位のレート制限カウンタ
 * （AWARDS_FETCH / LOGIN_IP / 公開映画API等）を共有DB上で食い合う。
 * Playwright から run 固有の `x-forwarded-for` を送って分離する。
 *
 * 実在のホストを指さないようプライベートアドレス（10.0.0.0/8）から選ぶ。
 */
export const RUN_CLIENT_IP = `10.${runDigest[0]}.${runDigest[1]}.${runDigest[2]}`;

/**
 * movie_cache のシードに使うID領域の先頭。
 *
 * `movie_cache.id` は INTEGER（上限 2,147,483,647）で、実在のTMDb IDは
 * 数百万台。これと重ならず、かつ run ごとのブロックを取れる値にする。
 */
const MOVIE_ID_BASE = 1_900_000_000;

/** 1 run に割り当てるIDの個数 */
const MOVIE_ID_BLOCK_SIZE = 100;

/** 割り当て可能なブロック数（上限 2,099,999,999 で INTEGER に収まる） */
const MOVIE_ID_BLOCK_COUNT = 2_000_000;

/** この run に割り当てられたID領域の先頭 */
const movieIdBlockStart =
  MOVIE_ID_BASE +
  (runDigest.readUInt32BE(4) % MOVIE_ID_BLOCK_COUNT) * MOVIE_ID_BLOCK_SIZE;

/**
 * movie_cache シード用の run 固有な映画IDを返す
 *
 * movie_cache は全ユーザー共通のテーブルのため、固定IDのままだと
 * 先に終わった run の後片付けが、実行中の別 run のシードを消してしまう。
 *
 * @param offset - ブロック内の位置（0〜{@link MOVIE_ID_BLOCK_SIZE} - 1）
 * @returns run 固有の映画ID
 */
export function runScopedMovieId(offset: number): number {
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset >= MOVIE_ID_BLOCK_SIZE
  ) {
    throw new RangeError(
      `映画IDのoffsetは0〜${MOVIE_ID_BLOCK_SIZE - 1}の整数で指定してください: ${offset}`,
    );
  }

  return movieIdBlockStart + offset;
}

/**
 * この run に割り当てられた映画IDの範囲（両端を含む）
 *
 * 後片付けで、シードし忘れ・異常終了の取りこぼしまで含めて消すために使う。
 */
export function runScopedMovieIdRange(): { min: number; max: number } {
  return {
    min: movieIdBlockStart,
    max: movieIdBlockStart + MOVIE_ID_BLOCK_SIZE - 1,
  };
}
