#!/usr/bin/env node
/**
 * PR 用ビジュアル証跡ヘルパー（Release Assets 方式）
 *
 * 画面修正 PR に「修正前/後スクリーンショット」と「動作保証の動画」を添付するための補助ツール。
 * agent-browser でスクショ/録画し、GitHub Release Assets（--prerelease）としてアップロードして、
 * PR 本文にそのまま貼れる markdown を出力する。
 *
 * なぜ Release Assets 方式か:
 *   GitHub の画像添付エンドポイント（user-attachments）はブラウザの user_session cookie 専用で、
 *   gh の PAT/OAuth では利用できない（公式に "not planned"）。Release Assets なら既存の `gh auth`
 *   だけで CLI 完結・CI 対応でアップでき、リポ本体に画像/動画をコミットせずに済む。
 *
 * 前提:
 *   - dev サーバー起動（例: npm run dev → http://localhost:3000）
 *   - agent-browser CLI 導入済み
 *   - gh CLI 認証済み（対象リポへの write 権限）
 *
 * 使い方:
 *   node scripts/pr-visual.mjs shot        <url> <out.png>              指定 URL のスクショ（全画面）
 *   node scripts/pr-visual.mjs record      <url> <out.webm> [sec]       指定 URL を sec 秒録画（既定 8）
 *   node scripts/pr-visual.mjs upload      <tag> <file...>              Release にアップし markdown 出力
 *   node scripts/pr-visual.mjs beforeafter <tag> <before.png> <after.png>  Before/After 比較表を出力
 *   node scripts/pr-visual.mjs cleanup     <tag>                        実演用 prerelease を削除
 *
 * 例:
 *   # main で before、修正ブランチで after + 動画
 *   node scripts/pr-visual.mjs shot   http://localhost:3000/movies/now-showing docs/tmp/nowshowing-before.png
 *   node scripts/pr-visual.mjs shot   http://localhost:3000/movies/now-showing docs/tmp/nowshowing-after.png
 *   node scripts/pr-visual.mjs record http://localhost:3000/movies/now-showing docs/tmp/nowshowing-demo.webm 10
 *   # Release にアップして PR 本文へ（tag は PR 番号やブランチ名などで一意に）
 *   node scripts/pr-visual.mjs beforeafter pr-visual-nowshowing docs/tmp/nowshowing-before.png docs/tmp/nowshowing-after.png
 *   node scripts/pr-visual.mjs upload      pr-visual-nowshowing docs/tmp/nowshowing-demo.webm
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';

const SESSION = 'pr-visual';
const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i;

function sh(bin, args) {
  return execFileSync(bin, args, { encoding: 'utf8' });
}

function ensureDir(file) {
  const dir = dirname(file);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  execFileSync('sleep', [String(ms / 1000)]);
}

function shot(url, out) {
  if (!url || !out) throw new Error('shot: <url> <out.png> が必要です');
  ensureDir(out);
  sh('agent-browser', ['open', url, '--headed', '--session', SESSION]);
  sleep(1500);
  sh('agent-browser', ['screenshot', '--full', out, '--session', SESSION]);
  console.log(`✓ スクショ保存: ${out}`);
}

function record(url, out, sec = '8') {
  if (!url || !out) throw new Error('record: <url> <out.webm> [sec] が必要です');
  ensureDir(out);
  sh('agent-browser', ['record', 'start', out, url, '--session', SESSION]);
  console.log(`● 録画開始（${sec}秒）: ${out}`);
  sleep(Number(sec) * 1000);
  sh('agent-browser', ['record', 'stop', '--session', SESSION]);
  console.log(`✓ 録画保存: ${out}`);
}

/** prerelease を用意（無ければ作成）してファイルをアップし、name→ダウンロードURL を返す */
function uploadAssets(tag, files) {
  if (!tag) throw new Error('tag が必要です');
  if (!files.length) throw new Error('アップロードするファイルがありません');
  for (const f of files) {
    if (!existsSync(f)) throw new Error(`ファイルが見つかりません: ${f}`);
  }
  try {
    sh('gh', ['release', 'view', tag]);
  } catch {
    sh('gh', [
      'release',
      'create',
      tag,
      '--prerelease',
      '--title',
      `PR visual assets: ${tag}`,
      '--notes',
      'PR 用ビジュアル証跡（自動生成の prerelease。マージ後に削除して構いません）',
    ]);
    console.log(`✓ prerelease 作成: ${tag}`);
  }
  sh('gh', ['release', 'upload', tag, ...files, '--clobber']);
  const rel = JSON.parse(sh('gh', ['release', 'view', tag, '--json', 'assets']));
  const map = new Map();
  for (const a of rel.assets) map.set(a.name, a.url);
  return map;
}

function mdRef(file, url) {
  const name = basename(file);
  return IMAGE_RE.test(name) ? `![${name}](${url})` : `[🎬 ${name}](${url})`;
}

function upload(tag, files) {
  const map = uploadAssets(tag, files);
  const lines = files.map((f) => mdRef(f, map.get(basename(f))));
  console.log('\n--- PR 本文に貼り付け ---\n');
  console.log(lines.join('\n'));
}

function beforeafter(tag, before, after, ...restFiles) {
  if (!before || !after) throw new Error('beforeafter: <tag> <before.png> <after.png> が必要です');
  const files = [before, after, ...restFiles];
  const map = uploadAssets(tag, files);
  const out = [
    '## スクリーンショット',
    '',
    '| Before | After |',
    '| --- | --- |',
    `| ${mdRef(before, map.get(basename(before)))} | ${mdRef(after, map.get(basename(after)))} |`,
  ];
  if (restFiles.length) {
    out.push('', '## 動作動画', '');
    for (const f of restFiles) out.push(mdRef(f, map.get(basename(f))));
  }
  out.push('');
  console.log('\n--- PR 本文に貼り付け ---\n');
  console.log(out.join('\n'));
}

function cleanup(tag) {
  if (!tag) throw new Error('cleanup: <tag> が必要です');
  sh('gh', ['release', 'delete', tag, '--yes', '--cleanup-tag']);
  console.log(`✓ prerelease 削除: ${tag}`);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  switch (cmd) {
    case 'shot':
      shot(rest[0], rest[1]);
      break;
    case 'record':
      record(rest[0], rest[1], rest[2]);
      break;
    case 'upload':
      upload(rest[0], rest.slice(1));
      break;
    case 'beforeafter':
      beforeafter(rest[0], rest[1], rest[2], ...rest.slice(3));
      break;
    case 'cleanup':
      cleanup(rest[0]);
      break;
    default:
      console.log(
        [
          'PR 用ビジュアル証跡ヘルパー（Release Assets 方式）',
          '',
          '  node scripts/pr-visual.mjs shot        <url> <out.png>',
          '  node scripts/pr-visual.mjs record      <url> <out.webm> [sec]',
          '  node scripts/pr-visual.mjs upload      <tag> <file...>',
          '  node scripts/pr-visual.mjs beforeafter <tag> <before.png> <after.png> [demo.webm...]',
          '  node scripts/pr-visual.mjs cleanup     <tag>',
        ].join('\n')
      );
      process.exit(cmd ? 1 : 0);
  }
} catch (err) {
  console.error(`エラー: ${err.message}`);
  process.exit(1);
}
