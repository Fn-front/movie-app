/**
 * 予告編のサムネイル読み込み E2Eテスト（#973）
 *
 * ## 守るもの
 *
 * **予告編のサムネイル（`i.ytimg.com`）を本体ドキュメントから読まないこと。**
 *
 * いまは読んでいない。プレイヤーのサムネイルは別オリジンの iframe
 * （`youtube-nocookie.com`）の中で読まれ、本サイトの CSP は適用されない。
 * リポジトリのソースに `ytimg` の参照も1件も無い。
 *
 * ⚠️ **放っておくと壊れる種類の性質**なので固定する。予告編を
 * 「サムネイル → クリックで iframe を読む」facade パターンにする案が
 * **#1092 のクローズコメント（引き継ぎメモ）**にあり、素直に実装すると
 * `i.ytimg.com` のサムネイルが本体ドキュメントに入る。
 *
 * ## #973 の前提は再現しなかった
 *
 * Issue は「メインフレームからも要求されていて img-src 違反が出る」と
 * していたが、本番ビルド・dev の両方で**1件も再現しなかった**。
 * 測定条件と結果は #973 のコメントに残してある。
 *
 * ## 2本立てで見る理由
 *
 * 実装の仕方で**壊れ方が違う**ので、片方だけでは素通りする。
 *
 * | 実装 | 何が起きるか | 捕まえる側 |
 * | --- | --- | --- |
 * | 素の `<img src="https://i.ytimg.com/...">` | `img-src` で遮断される | CSP 違反 |
 * | `next/image`（このリポジトリの流儀） | `/_next/image?url=...` 経由＝**同一オリジン**になり CSP を踏まない。代わりに `next.config.mjs` の `remotePatterns` に `i.ytimg.com` が無く実行時に落ちる | DOM 参照 |
 *
 * ## 埋め込みはスタブする
 *
 * ⚠️ #1094 で決めた「E2E から外部ネットワーク依存を消す」方針を**踏襲する**。
 *
 * 実物を読ませても**この検証には寄与しない**。別オリジンの iframe で起きた
 * 違反は本体の `securitypolicyviolation` に乗らないので（それが #973 の
 * 再調査で得た結論そのもの）、YouTube が何を要求しようと判定は変わらない。
 * `page.route` で中身を差し替えても URL は `youtube-nocookie.com` のままなので、
 * **別オリジンである性質は保たれる**。
 */

import { expect, test } from '@playwright/test';

import { ARIA_LABELS } from '@/constants';

import {
  collectCspViolations,
  readCspViolations,
  type CspViolation,
} from '../helpers/csp';
import {
  MOVIE_ID,
  mockMovieDetail,
  stubTrailerEmbed,
} from '../helpers/movieDetail';

/** 予告編の検証用。実データに依存させない */
const TRAILER_VIDEO = {
  id: 'v1',
  iso_639_1: 'ja',
  iso_3166_1: 'JP',
  key: 'dQw4w9WgXcQ',
  name: 'E2E予告編',
  site: 'YouTube',
  size: 1080,
  type: 'Trailer',
  official: true,
  published_at: '2026-01-01T00:00:00.000Z',
} as const;

/** 2本目。facade は件数ぶん並ぶので、1件だけだと取りこぼしに気づけない */
const SECOND_TRAILER_VIDEO = {
  ...TRAILER_VIDEO,
  id: 'v2',
  key: 'oHg5SJYRHA0',
  name: 'E2E予告編2',
} as const;

/** 本体から読んではいけないホスト */
const THUMBNAIL_HOST = 'i.ytimg.com';

/**
 * CSP が遮断したのがサムネイルのホストか
 *
 * ⚠️ **部分一致で判定しない。** `blockedURI.includes('i.ytimg.com')` は
 * `https://evil.example/?x=i.ytimg.com` のような無関係なURLにも当たる
 * （CodeQL の `js/incomplete-url-substring-sanitization`）。host を
 * 取り出して**完全一致**で比べる。
 *
 * `blockedURI` は URL とは限らない（`eval` / `inline` など）ので、
 * パースに失敗したら対象外として扱う。
 */
function isThumbnailBlocked(violation: CspViolation): boolean {
  try {
    return new URL(violation.blockedURI).hostname === THUMBNAIL_HOST;
  } catch {
    return false;
  }
}

test.describe('予告編のサムネイル', () => {
  test.describe.configure({ timeout: 90000 });

  test.use({ storageState: { cookies: [], origins: [] } });

  test('本体ドキュメントから i.ytimg.com を読まない', async ({ page }) => {
    await collectCspViolations(page);
    await stubTrailerEmbed(page);
    await mockMovieDetail(page, {
      backdrop_path: '/e2e-backdrop.jpg',
      videos: { results: [TRAILER_VIDEO, SECOND_TRAILER_VIDEO] },
    });

    await page.goto(`/movies/now-showing?movie_id=${MOVIE_ID}`);

    const detail = page.getByRole('dialog');
    await expect(detail).toBeVisible({ timeout: 30000 });

    await detail
      .getByRole('button', { name: ARIA_LABELS.PLAY_TRAILER })
      .click();

    const videoDialog = page.getByRole('dialog', { name: /の予告動画$/ });
    await expect(videoDialog).toBeVisible({ timeout: 20000 });
    await expect(videoDialog.locator('iframe')).toHaveCount(2);

    // --- 1. DOM 参照（next/image で実装された facade を捕まえる） ---
    //
    // `next/image` は src を `/_next/image?url=<URLエンコード>` へ書き換えるので、
    // 生の URL だけを見ていると素通りする。`url` パラメータも展開して見る
    const thumbnailRefs = await page.evaluate((host) => {
      /**
       * ⚠️ **部分一致で判定しない。** `url.includes('i.ytimg.com')` は
       * `https://evil.example/?x=i.ytimg.com` のような無関係なURLにも当たる
       * （CodeQL の `js/incomplete-url-substring-sanitization`）。
       * host を取り出して**完全一致**で比べる
       */
      const matchesHost = (rawUrl: string): boolean => {
        try {
          const url = new URL(rawUrl, document.baseURI);
          if (url.hostname === host) return true;
          // next/image 経由。`url` パラメータに元のURLが入る
          const inner = url.searchParams.get('url');
          return inner
            ? new URL(inner, document.baseURI).hostname === host
            : false;
        } catch {
          return false;
        }
      };

      const urls: string[] = [];
      for (const el of document.querySelectorAll('img, source')) {
        const src = el.getAttribute('src');
        if (src) urls.push(src);
        // srcset は「URL 記述子, URL 記述子, ...」の形
        for (const candidate of (el.getAttribute('srcset') ?? '').split(',')) {
          const url = candidate.trim().split(/\s+/)[0];
          if (url) urls.push(url);
        }
      }
      return urls.filter(matchesHost);
    }, THUMBNAIL_HOST);

    expect(
      thumbnailRefs,
      `本体ドキュメントが ${THUMBNAIL_HOST} を参照している。facade パターンを` +
        '入れたなら、実装に応じて次が要る:\n' +
        '  - next/image なら next.config.mjs の images.remotePatterns に追加\n' +
        '  - 素の <img> なら cspDirectives.mjs の img-src に追加\n' +
        '（サムネイル配信専用ホストなので追跡面は広がらない）\n' +
        JSON.stringify(thumbnailRefs, null, 2),
    ).toEqual([]);

    // --- 2. CSP（素の <img> で実装された facade を捕まえる） ---
    const violations = await readCspViolations(page);
    // ディレクティブ名で絞らない。img-src を消して default-src へ
    // フォールバックした場合も拾うため
    const blockedThumbnails = violations.filter(isThumbnailBlocked);

    expect(
      blockedThumbnails,
      `本体ドキュメントから ${THUMBNAIL_HOST} が遮断された:\n` +
        JSON.stringify(blockedThumbnails, null, 2),
    ).toEqual([]);

    // --- 3. 計測が生きていることの確認（positive control） ---
    //
    // ⚠️ **これが無いと上の2つは「測れていて0件」を保証しない。**
    // 収集の仕掛けが動いていなくても、ブラウザがイベントを出さなくても緑になる
    await page.evaluate((host) => {
      const img = document.createElement('img');
      img.src = `https://${host}/vi/positive-control/mqdefault.webp`;
      document.body.appendChild(img);
    }, THUMBNAIL_HOST);

    await expect
      .poll(
        async () => {
          const all = await readCspViolations(page);
          return all.filter(isThumbnailBlocked).length;
        },
        {
          message:
            '収集の仕掛けが動いていない。本体へ故意に置いた <img> すら' +
            '捕まえられていないので、上の検証は何も保証していない',
          timeout: 10000,
        },
      )
      .toBe(1);
  });
});
