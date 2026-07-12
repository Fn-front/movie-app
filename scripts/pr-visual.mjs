#!/usr/bin/env node
/**
 * PR 用ビジュアル証跡ヘルパー（gh-image 方式）
 *
 * 画面修正 PR に「修正前/後スクリーンショット」と「動作保証の動画」を添付するための補助ツール。
 * agent-browser でスクショ/録画し、gh-image（drogers0/gh-image）で GitHub の user-attachments に
 * アップロードして、PR 本文にそのまま貼れる markdown を出力する。
 *
 * なぜ gh-image / user-attachments か:
 *   user-attachments にアップした動画は GitHub が <video> としてインライン再生する
 *   （Release Assets 方式ではリンク止まりで再生されない）。画像もそのまま inline 表示される。
 *
 * 前提:
 *   - dev サーバー起動（例: npm run dev → http://localhost:3000）
 *   - agent-browser CLI 導入済み
 *   - gh CLI 認証済み（対象リポへの write 権限。リポ ID 参照に使う）
 *   - gh-image 導入済み（gh extension install drogers0/gh-image）
 *   - GitHub の session token が用意されていること。次のいずれか:
 *       (a) 対応ブラウザ（Chrome/Safari/Firefox/Edge/Brave/Opera）で github.com にログイン済み
 *           → gh-image が cookie から自動取得（`gh image check-token` で確認）
 *       (b) `.env.local` などに `GH_SESSION_TOKEN=<user_session>` を設定（CI/headless 向け）
 *     ※ user_session は「アカウント全権限」の cookie。パスワード同様に厳重に扱う。
 *
 * 使い方:
 *   node scripts/pr-visual.mjs shot        <url> <out.png>              指定 URL のスクショ（全画面）
 *   node scripts/pr-visual.mjs record      <url> <out.webm> [sec]       指定 URL を sec 秒録画（既定 8）
 *   node scripts/pr-visual.mjs upload      <file...>                    user-attachments にアップし markdown 出力
 *   node scripts/pr-visual.mjs beforeafter <before.png> <after.png> [demo.webm...]  比較表＋動画を出力
 *
 * 例:
 *   node scripts/pr-visual.mjs shot   http://localhost:3000/movies/now-showing docs/tmp/ns-before.png
 *   node scripts/pr-visual.mjs shot   http://localhost:3000/movies/now-showing docs/tmp/ns-after.png
 *   node scripts/pr-visual.mjs record http://localhost:3000/movies/now-showing docs/tmp/ns-demo.webm 10
 *   node scripts/pr-visual.mjs beforeafter docs/tmp/ns-before.png docs/tmp/ns-after.png docs/tmp/ns-demo.webm
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';

const SESSION = process.env.AGENT_BROWSER_SESSION || 'pr-visual';
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
  // 既存セッションがあれば再利用される（毎回新規起動はしない）
  sh('agent-browser', ['open', url, '--session', SESSION]);
  sleep(1500);
  sh('agent-browser', ['screenshot', '--full', '--session', SESSION, out]);
  console.log(`✓ スクショ保存: ${out}`);
}

function record(url, out, sec = '8') {
  if (!url || !out)
    throw new Error('record: <url> <out.webm> [sec] が必要です');
  ensureDir(out);
  sh('agent-browser', ['record', 'start', out, url, '--session', SESSION]);
  console.log(`● 録画開始（${sec}秒）: ${out}`);
  sleep(Number(sec) * 1000);
  sh('agent-browser', ['record', 'stop', '--session', SESSION]);
  remuxDuration(out);
  console.log(`✓ 録画保存: ${out}`);
}

/**
 * agent-browser の WebM はコンテナの duration メタデータが欠落しがちで、
 * GitHub のプレーヤーが「0 秒」と表示してしまう。ffmpeg で remux して補正する（あれば）。
 */
function remuxDuration(out) {
  try {
    sh('ffmpeg', ['-version']);
  } catch {
    console.warn(
      '⚠ ffmpeg 未導入のため duration 補正をスキップ（GitHub で長さが 0 表示になる場合あり。brew install ffmpeg 推奨）',
    );
    return;
  }
  const tmp = `${out}.fixed.webm`;
  sh('ffmpeg', ['-y', '-i', out, '-c', 'copy', tmp]);
  sh('mv', [tmp, out]);
}

/**
 * gh image で user-attachments にアップロードし、ファイルごとの markdown 参照を返す。
 * gh image は画像を `![name](url)`、動画などは生 URL で出力する（1 ファイル 1 行）。
 * 返り値: Map<filePath, { url, raw }>（raw は gh image が出力した行そのもの）
 */
function ghImageUpload(files) {
  if (!files.length) throw new Error('アップロードするファイルがありません');
  for (const f of files) {
    if (!existsSync(f)) throw new Error(`ファイルが見つかりません: ${f}`);
  }
  const lines = sh('gh', ['image', ...files])
    .trim()
    .split('\n')
    .filter(Boolean);
  if (lines.length !== files.length) {
    throw new Error(
      `gh image の出力行数(${lines.length})がファイル数(${files.length})と一致しません`,
    );
  }
  const map = new Map();
  files.forEach((f, i) => {
    const raw = lines[i].trim();
    const m =
      raw.match(/\((https?:\/\/[^)]+)\)/) || raw.match(/(https?:\/\/\S+)/);
    map.set(f, { url: m ? m[1] : raw, raw });
  });
  return map;
}

/** 画像は `![](url)`、動画（user-attachments）はインライン再生されるよう生 URL を単独行で。 */
function mdRef(file, url) {
  return IMAGE_RE.test(basename(file)) ? `![${basename(file)}](${url})` : url;
}

function upload(files) {
  const map = ghImageUpload(files);
  console.log('\n--- PR 本文に貼り付け ---\n');
  console.log(files.map((f) => mdRef(f, map.get(f).url)).join('\n'));
}

function beforeafter(before, after, ...videos) {
  if (!before || !after)
    throw new Error(
      'beforeafter: <before.png> <after.png> [demo.webm...] が必要です',
    );
  const map = ghImageUpload([before, after, ...videos]);
  const out = [
    '## スクリーンショット',
    '',
    '| Before | After |',
    '| --- | --- |',
    `| ${mdRef(before, map.get(before).url)} | ${mdRef(after, map.get(after).url)} |`,
  ];
  if (videos.length) {
    out.push('', '## 動作動画', '');
    // 動画は生 URL を単独行で置くと GitHub が <video> でインライン再生する
    for (const v of videos) out.push(map.get(v).url, '');
  }
  console.log('\n--- PR 本文に貼り付け ---\n');
  console.log(out.join('\n'));
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
      upload(rest);
      break;
    case 'beforeafter':
      beforeafter(rest[0], rest[1], ...rest.slice(2));
      break;
    default:
      console.log(
        [
          'PR 用ビジュアル証跡ヘルパー（gh-image 方式）',
          '',
          '  node scripts/pr-visual.mjs shot        <url> <out.png>',
          '  node scripts/pr-visual.mjs record      <url> <out.webm> [sec]',
          '  node scripts/pr-visual.mjs upload      <file...>',
          '  node scripts/pr-visual.mjs beforeafter <before.png> <after.png> [demo.webm...]',
        ].join('\n'),
      );
      process.exit(cmd ? 1 : 0);
  }
} catch (err) {
  console.error(`エラー: ${err.message}`);
  process.exit(1);
}
