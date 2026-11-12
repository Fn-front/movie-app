/**
 * ci-build-with-retry.sh テスト
 *
 * **#787 の再発を待たずに検証するためのテスト。**
 *
 * このスクリプトの肝は「再試行の前に `.next` を消すこと」で、消さないと
 * Turbopack の永続キャッシュ（`.next/cache/turbopack`）に乗った1回目の失敗結果を
 * 2回目以降が再生するだけになる（#1080）。CI 上でそれを確かめるには
 * #787 の非決定的な失敗を踏むのを待つしかないため、ここでは
 * **必ず失敗する偽の `npm`** を PATH の先頭に置いて挙動を固定する。
 *
 * 偽 `npm` は呼ばれるたびに
 *   - 実行開始時点で `.next/cache/marker` があったかを `attempts.log` に記録し
 *   - `.next/cache/marker` と `.next/server/artifact` を作り直す
 * ので、ログを見れば「試行の前に消えたか」が分かる。
 */

const { execFileSync } = require('node:child_process');
const {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const SCRIPT = join(__dirname, 'ci-build-with-retry.sh');

/** 偽 `npm`。終了コードは FAKE_NPM_EXIT で決める */
const FAKE_NPM = `#!/usr/bin/env bash
if [ -f .next/cache/marker ]; then
  echo "marker-present" >> attempts.log
else
  echo "marker-absent" >> attempts.log
fi
mkdir -p .next/cache .next/server
echo cache > .next/cache/marker
echo artifact > .next/server/artifact
exit "\${FAKE_NPM_EXIT:-1}"
`;

/**
 * スクリプトを一時ディレクトリで走らせる
 *
 * `.next/cache/marker` を**あらかじめ作っておく**のは、CI が
 * `actions/cache` で `.next/cache` を復元した状態を再現するため。
 * これが無いと「1回目の前にも消えている」状態と区別できない。
 */
function runScript({ exitCode, attempts = 2 }) {
  const cwd = mkdtempSync(join(tmpdir(), 'ci-build-retry-'));

  const binDir = join(cwd, 'fakebin');
  mkdirSync(binDir);
  const npmPath = join(binDir, 'npm');
  writeFileSync(npmPath, FAKE_NPM);
  chmodSync(npmPath, 0o755);

  // 復元済みキャッシュに見立てる
  mkdirSync(join(cwd, '.next', 'cache'), { recursive: true });
  writeFileSync(join(cwd, '.next', 'cache', 'marker'), 'restored');

  let status = 0;
  try {
    execFileSync('bash', [SCRIPT], {
      cwd,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        FAKE_NPM_EXIT: String(exitCode),
        BUILD_MAX_ATTEMPTS: String(attempts),
        BUILD_RETRY_DELAY: '0',
      },
      stdio: 'pipe',
    });
  } catch (error) {
    status = error.status;
  }

  const logPath = join(cwd, 'attempts.log');
  const log = existsSync(logPath)
    ? readFileSync(logPath, 'utf8').trim().split('\n')
    : [];

  return {
    status,
    log,
    hasNext: existsSync(join(cwd, '.next')),
    hasArtifact: existsSync(join(cwd, '.next', 'server', 'artifact')),
  };
}

describe('ci-build-with-retry.sh', () => {
  describe('失敗したとき', () => {
    it('再試行の前に .next を消す', () => {
      const { log } = runScript({ exitCode: 1, attempts: 2 });

      // 1回目は復元されたキャッシュを見る。2回目は消えた状態から始まる。
      // rm -rf を外すと2回目も marker-present になって落ちる
      expect(log).toEqual(['marker-present', 'marker-absent']);
    });

    it('3回まで引き直す', () => {
      const { log } = runScript({ exitCode: 1, attempts: 3 });

      expect(log).toEqual(['marker-present', 'marker-absent', 'marker-absent']);
    });

    it('最終試行の終了コードをそのまま返す', () => {
      expect(runScript({ exitCode: 1, attempts: 2 }).status).toBe(1);
      expect(runScript({ exitCode: 7, attempts: 2 }).status).toBe(7);
    });

    // 失敗したビルドの成果物をアーティファクトから拾えるようにするため、
    // 最後の失敗のあとは消さない
    it('最終試行の失敗では .next を残す', () => {
      const { hasNext, hasArtifact } = runScript({
        exitCode: 1,
        attempts: 2,
      });

      expect(hasNext).toBe(true);
      expect(hasArtifact).toBe(true);
    });
  });

  describe('成功したとき', () => {
    it('1回で終わり、.next を消さない', () => {
      const { status, log, hasNext, hasArtifact } = runScript({
        exitCode: 0,
        attempts: 3,
      });

      expect(status).toBe(0);
      expect(log).toEqual(['marker-present']);
      expect(hasNext).toBe(true);
      expect(hasArtifact).toBe(true);
    });
  });
});
