#!/usr/bin/env node
/**
 * Claude AI による pre-commit レビュー
 * - staged diff を Claude Code CLI でレビュー
 * - blocker / warning を JSON 出力で分離して表示
 * - Phase 1: blocker でもコミットは継続（exit 0 固定）
 * - 緊急バイパス: SKIP_AI_REVIEW=1 git commit ...
 * - ログ保存: .cache/ai-review-latest.json (直近), .cache/ai-review-history.log (累積サマリー)
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' });
const log = (msg) => process.stdout.write(msg + '\n');

/** Claude CLI 実行のタイムアウト（ms） */
const CLAUDE_TIMEOUT_MS = 90000;

/** 失敗・診断情報を履歴ログに追記する（原因不明化の解消用） */
function logHistory(line) {
  try {
    const cacheDir = path.resolve('.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    fs.appendFileSync(
      path.join(cacheDir, 'ai-review-history.log'),
      `[${ts}] ${line}\n`,
    );
  } catch {
    /* ログ失敗は無視（コミットをブロックしない） */
  }
}

function which(cmd) {
  const r = spawnSync('command', ['-v', cmd], {
    encoding: 'utf8',
    shell: true,
  });
  return r.status === 0;
}

// staged diff
let diff = '';
try {
  diff = sh('git diff --cached');
} catch {
  process.exit(0);
}
if (!diff.trim()) process.exit(0);

if (process.env.SKIP_AI_REVIEW === '1') {
  log('⏭️  AI レビューをスキップ (SKIP_AI_REVIEW=1)');
  process.exit(0);
}

if (!which('claude')) {
  log('⚠️  claude コマンドが見つかりません。AI レビューをスキップします。');
  process.exit(0);
}

log('🤖 Claude AI による pre-commit レビュー実行中...');

const prompt = `あなたはコードレビュアーです。以下の staged diff を、プロジェクトの GEMINI.md と .claude/rules/ のルールに照らしてレビューしてください。

出力は **JSON のみ**。他の文字（説明文・コードブロック記号など）を一切含めないこと:
{
  "blockers": [{"file": "path", "line": number, "message": "違反内容と修正方法"}],
  "warnings": [{"file": "path", "line": number, "message": "違反内容と修正方法"}]
}

判定基準:
- blockers: セキュリティ違反 / 認証バイパス / 環境変数のハードコード / OWASP Top 10 該当
- warnings: 命名規則 / React.memo / useCallback / displayName / cn() / インラインスタイル / その他軽微な品質問題
- 違反なし: {"blockers": [], "warnings": []}

--- staged diff ---
${diff}`;

let outer;
try {
  const r = spawnSync(
    'claude',
    ['-p', '--output-format', 'json', '--max-turns', '1', prompt],
    {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: CLAUDE_TIMEOUT_MS,
    },
  );
  if (r.status !== 0) {
    // 失敗理由（タイムアウト/シグナル/stderr）を履歴に残し、原因不明化を防ぐ
    const isTimeout = r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM';
    const reason = isTimeout
      ? `timeout (${CLAUDE_TIMEOUT_MS}ms)`
      : (r.stderr || '').trim().slice(0, 500) ||
        `exit=${r.status} signal=${r.signal}`;
    log('⚠️  Claude CLI の実行に失敗しました。スキップします。');
    logHistory(`FAILED claude CLI: ${reason}`);
    process.exit(0);
  }
  outer = JSON.parse(r.stdout);
  // CLIは成功(exit 0)でもAPI側エラーが乗る場合があるため記録する
  if (outer.api_error_status) {
    logHistory(`API error status: ${outer.api_error_status}`);
  }
} catch (e) {
  log(`⚠️  Claude のレスポンスを解析できませんでした: ${e.message}`);
  logHistory(`PARSE error: ${e.message}`);
  process.exit(0);
}

// 外側 JSON の result フィールドが内部 JSON 文字列
let review = { blockers: [], warnings: [] };
const resultStr = outer.result || '';
try {
  const m = resultStr.match(/\{[\s\S]*\}/);
  if (m) review = JSON.parse(m[0]);
} catch {
  // fallthrough: empty review
}

// ログ保存
const cacheDir = path.resolve('.cache');
fs.mkdirSync(cacheDir, { recursive: true });
fs.writeFileSync(
  path.join(cacheDir, 'ai-review-latest.json'),
  JSON.stringify(review, null, 2) + '\n',
);
let prev = '(no previous commit)';
try {
  prev = sh('git log -1 --format=%s').trim();
} catch {
  /* ignore */
}
logHistory(
  `blockers=${review.blockers.length} warnings=${review.warnings.length} / prev: ${prev}`,
);

const fmt = (items) =>
  items.map((i) => `  - ${i.file}:${i.line} ${i.message}`).join('\n');

if (review.blockers.length > 0) {
  log('');
  log('🚨 重大な指摘 (Phase 1 では blocker にしません):');
  log(fmt(review.blockers));
}
if (review.warnings.length > 0) {
  log('');
  log('⚠️  警告:');
  log(fmt(review.warnings));
}
if (review.blockers.length === 0 && review.warnings.length === 0) {
  log('✅ AI レビュー: 問題なし');
}

log('');
log('📄 詳細ログ: npm run ai-review:last で再表示できます');

process.exit(0);
