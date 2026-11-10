/**
 * GitHub Actions の `uses:` が全てコミットSHAで固定されているかを検査する。
 *
 * ## なぜスクリプトで見るのか
 *
 * 同じことはリポジトリ設定 `sha_pinning_required` でも強制できる。しかし
 * **この設定は呼び出した Action の内部で使われている Action にも適用される**。
 * `google-github-actions/run-gemini-cli` は action.yml の中で
 * `google-github-actions/auth@v3` と `actions/upload-artifact@v6` を
 * タグ参照しており（上流が `# ratchet:exclude` で意図的に除外している）、
 * こちらからは固定できない。結果、設定を有効にすると Gemini レビューが
 * ジョブ開始前に落ち、**全PRが赤になった**（#1001）。
 *
 * そこで強制の範囲を「自分たちが書き換えられるもの」に絞る。
 * `.github/workflows/` の中はこのスクリプトで必ず固定させ、推移的な依存は
 * 上流の判断に委ねる。設定と違い、ここは落ちた理由がファイルと行で分かる。
 *
 * ## 検査しないもの
 *
 * - ローカルの再利用ワークフロー（`./.github/workflows/*.yml`）
 *   → リポジトリ内の参照でSHAを書けない。改ざんの経路にもならない
 * - Docker イメージ参照（`docker://`）
 *   → コミットSHAの概念が無い
 *
 * 使い方:
 *   node scripts/checkWorkflowPins.js
 */

const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

/** ワークフローの置き場所 */
const WORKFLOW_DIR = '.github/workflows';

/** コミットSHA（40桁の16進数）*/
const COMMIT_SHA = /^[0-9a-f]{40}$/;

/**
 * `uses:` の値から参照先を取り出す
 *
 * 行末には `# ratchet:actions/checkout@v7.0.1` のような注釈が付く。
 * 注釈にはタグが入っているので、**先に落とさないと必ず誤検知する**。
 *
 * @param {string} line - ワークフローの1行
 * @returns {string | null} 参照文字列（`owner/repo@ref` 等）。`uses:` でなければ null
 */
function extractUsesRef(line) {
  const match = line.match(/^\s*(?:-\s*)?uses:\s*(.+)$/);
  if (!match) return null;

  return (
    match[1]
      // 行末コメント（` # ...`）を落とす
      .replace(/\s+#.*$/, '')
      // YAML のクォートを外す
      .replace(/^['"]|['"]$/g, '')
      .trim()
  );
}

/**
 * 参照がコミットSHAで固定されているか
 *
 * @param {string} ref - `extractUsesRef` の戻り値
 * @returns {boolean} 固定されている、または検査対象外なら true
 */
function isPinned(ref) {
  // ローカルの再利用ワークフロー・Docker イメージは対象外
  if (ref.startsWith('./') || ref.startsWith('.\\')) return true;
  if (ref.startsWith('docker://')) return true;

  const at = ref.lastIndexOf('@');
  if (at === -1) return false;

  return COMMIT_SHA.test(ref.slice(at + 1));
}

/**
 * ワークフロー1ファイル分の違反を集める
 *
 * @param {string} fileName - ファイル名
 * @param {string} content - ファイルの中身
 * @returns {{ file: string, line: number, ref: string }[]} 違反の一覧
 */
function findViolations(fileName, content) {
  const violations = [];

  content.split('\n').forEach((line, index) => {
    const ref = extractUsesRef(line);
    if (ref === null || isPinned(ref)) return;
    violations.push({ file: fileName, line: index + 1, ref });
  });

  return violations;
}

/**
 * `.github/workflows` 配下を全て検査する
 *
 * @param {string} [dir] - 検査するディレクトリ（テストから差し替える）
 * @returns {{ file: string, line: number, ref: string }[]} 違反の一覧
 */
function checkWorkflowDir(dir = WORKFLOW_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()
    .flatMap((name) =>
      findViolations(name, readFileSync(join(dir, name), 'utf8')),
    );
}

module.exports = {
  extractUsesRef,
  isPinned,
  findViolations,
  checkWorkflowDir,
};

if (require.main === module) {
  const violations = checkWorkflowDir();

  if (violations.length > 0) {
    console.error(
      `${WORKFLOW_DIR} の uses: がコミットSHAで固定されていません（${violations.length}件）:\n`,
    );
    for (const violation of violations) {
      console.error(
        `  ${WORKFLOW_DIR}/${violation.file}:${violation.line}  ${violation.ref}`,
      );
    }
    console.error(
      '\nタグやブランチは後から中身を差し替えられます。' +
        '参照先のコミットSHA（40桁）に書き換えてください。\n' +
        "例: uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' # ratchet:actions/checkout@v7.0.1",
    );
    process.exit(1);
  }

  console.log(`${WORKFLOW_DIR}: uses: は全てコミットSHAで固定されています`);
}
