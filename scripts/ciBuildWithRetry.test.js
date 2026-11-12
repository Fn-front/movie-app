/**
 * ci-build-with-retry.sh テスト
 *
 * **#787 の再発を待たずに検証するためのテスト。**
 *
 * このスクリプトの肝は2つ。
 *
 * 1. 再試行の前に `.next` を消すこと。消さないと Turbopack の永続キャッシュ
 *    （`.next/cache/turbopack`）に乗った1回目の失敗結果を2回目以降が
 *    再生するだけになる（#1080）
 * 2. #787 の目印（`@vercel/turbopack-next/internal/font/google/font`）が
 *    出力に無ければ引き直さないこと。消すようにした結果、再試行は
 *    コールドのフルビルドになったため、普通のビルドエラーまで引き直すと
 *    赤になるまでの待ち時間が3倍になる
 *
 * CI 上でこれを確かめるには #787 の非決定的な失敗を踏むのを待つしかないので、
 * **挙動を指定できる偽の `npm`** を PATH の先頭に置く。
 *
 * 偽 `npm` は呼ばれるたびに
 *   - 実行開始時点で `.next/cache/marker` があったかを `attempts.log` に記録し
 *   - `.next/cache/marker` と `.next/server/artifact` を作り直し
 *   - `FAKE_NPM_OUTPUT` を出力して `FAKE_NPM_EXIT` で終わる
 * ので、ログを見れば「試行の前に消えたか」「何回走ったか」が分かる。
 *
 * ⚠️ スクリプトは**自分の位置**から `.next` の基準を決める（`BASH_SOURCE`）。
 * リポジトリの `scripts/` から直接走らせると**本物の `.next` を消す**ので、
 * 一時ディレクトリへコピーしてから実行すること。
 */

const { execFileSync } = require('node:child_process');
const {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const SCRIPT_SOURCE = join(__dirname, 'ci-build-with-retry.sh');

/** #787 の目印。これが出力にあるときだけ引き直す */
const FONT_ERROR =
  "Error: Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'";

/** 引き直してはいけない「普通の」失敗 */
const TYPE_ERROR = "Type error: Property 'foo' does not exist on type 'Bar'.";

/** 偽 `npm`。出力と終了コードは環境変数で決める */
const FAKE_NPM = `#!/usr/bin/env bash
if [ -f .next/cache/marker ]; then
  echo "marker-present" >> attempts.log
else
  echo "marker-absent" >> attempts.log
fi
mkdir -p .next/cache .next/server
echo cache > .next/cache/marker
echo artifact > .next/server/artifact
echo "\${FAKE_NPM_OUTPUT:-}"
exit "\${FAKE_NPM_EXIT:-1}"
`;

/** 後片付けのために作った一時ディレクトリを覚えておく */
const workspaces = [];

/**
 * スクリプトを一時ディレクトリへコピーして走らせる
 *
 * `.next/cache/marker` を**あらかじめ作っておく**のは、CI が
 * `actions/cache` で `.next/cache` を復元した状態を再現するため。
 * これが無いと「1回目の前にも消えている」状態と区別できない。
 *
 * `attempts` を渡さない呼び出しは、スクリプトの既定（3回）を見るためのもの。
 */
function runScript({ exitCode, output = FONT_ERROR, attempts }) {
  const cwd = mkdtempSync(join(tmpdir(), 'ci-build-retry-'));
  workspaces.push(cwd);

  // スクリプトは BASH_SOURCE の1つ上を基準にする
  const scriptDir = join(cwd, 'scripts');
  mkdirSync(scriptDir);
  const script = join(scriptDir, 'ci-build-with-retry.sh');
  copyFileSync(SCRIPT_SOURCE, script);

  const binDir = join(cwd, 'fakebin');
  mkdirSync(binDir);
  const npmPath = join(binDir, 'npm');
  writeFileSync(npmPath, FAKE_NPM);
  chmodSync(npmPath, 0o755);

  // 復元済みキャッシュに見立てる
  mkdirSync(join(cwd, '.next', 'cache'), { recursive: true });
  writeFileSync(join(cwd, '.next', 'cache', 'marker'), 'restored');

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    FAKE_NPM_EXIT: String(exitCode),
    FAKE_NPM_OUTPUT: output,
    BUILD_RETRY_DELAY: '0',
  };
  if (attempts !== undefined) {
    env.BUILD_MAX_ATTEMPTS = String(attempts);
  }

  let status = 0;
  let stdout = '';
  try {
    stdout = execFileSync('bash', [script], {
      cwd,
      env,
      stdio: 'pipe',
      encoding: 'utf8',
      // 同期実行なので jest のテストタイムアウトが効かない。
      // sleep が復活するような変更をハングではなく失敗として出す
      timeout: 30000,
    });
  } catch (error) {
    status = error.status;
    stdout = String(error.stdout ?? '');
  }

  const logPath = join(cwd, 'attempts.log');
  const log = existsSync(logPath)
    ? readFileSync(logPath, 'utf8').trim().split('\n')
    : [];

  return {
    status,
    stdout,
    log,
    hasNext: existsSync(join(cwd, '.next')),
    hasArtifact: existsSync(join(cwd, '.next', 'server', 'artifact')),
  };
}

afterEach(() => {
  while (workspaces.length > 0) {
    rmSync(workspaces.pop(), { recursive: true, force: true });
  }
});

describe('ci-build-with-retry.sh', () => {
  describe('#787 の症状で失敗したとき', () => {
    it('再試行の前に .next を消す', () => {
      const { log } = runScript({ exitCode: 1, attempts: 2 });

      // 1回目は復元されたキャッシュを見る。2回目は消えた状態から始まる。
      // rm -rf を外すと2回目も marker-present になって落ちる
      expect(log).toEqual(['marker-present', 'marker-absent']);
    });

    it('既定では3回まで引き直す', () => {
      // BUILD_MAX_ATTEMPTS を渡さない。既定値を 1 にすると落ちる
      const { log } = runScript({ exitCode: 1 });

      expect(log).toEqual(['marker-present', 'marker-absent', 'marker-absent']);
    });

    it('最終試行の終了コードをそのまま返す', () => {
      expect(runScript({ exitCode: 1, attempts: 2 }).status).toBe(1);
      expect(runScript({ exitCode: 7, attempts: 2 }).status).toBe(7);
    });

    // 消しても誰も得をしない（.next をアーティファクトに上げている
    // ワークフローは無い）ので、最後の失敗のあとは触らない
    it('最終試行の失敗では .next を残す', () => {
      const { hasNext, hasArtifact } = runScript({
        exitCode: 1,
        attempts: 2,
      });

      expect(hasNext).toBe(true);
      expect(hasArtifact).toBe(true);
    });
  });

  /**
   * 再試行はコールドキャッシュのフルビルドになったので、落ちると分かっている
   * ビルドを3回やり直すと待ち時間が3倍になる。目印が無ければ1回で止める
   */
  describe('#787 以外の理由で失敗したとき', () => {
    it('引き直さずに1回で終わる', () => {
      const { log, status } = runScript({
        exitCode: 1,
        output: TYPE_ERROR,
        attempts: 3,
      });

      expect(log).toEqual(['marker-present']);
      expect(status).toBe(1);
    });

    it('引き直さない理由をログに出す', () => {
      const { stdout } = runScript({
        exitCode: 1,
        output: TYPE_ERROR,
        attempts: 3,
      });

      expect(stdout).toContain('#787 の症状ではないので引き直しません');
    });

    it('.next を消さない（1回目の成果物をそのまま残す）', () => {
      const { hasArtifact } = runScript({
        exitCode: 1,
        output: TYPE_ERROR,
        attempts: 3,
      });

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
