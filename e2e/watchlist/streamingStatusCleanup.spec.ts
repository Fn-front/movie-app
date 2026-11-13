/**
 * 配信状況の後片付けが共有データを壊さないことの検証（#1116）
 *
 * `movie_streaming_status` は `tmdb_movie_id` が主キーの**作品単位・全ユーザー
 * 共有**テーブルで、ユーザーにも run にも紐づかない。そこへ
 * `cleanupStreamingStatus` が物理削除をかけていたため、日次 Cron が全利用者の
 * ために作った実データが E2E の後片付けで消えていた（本番で `南極料理人` の
 * 配信バッジが消えた）。
 *
 * ブラウザは使わない。ヘルパーの後片付け規約だけを固定する。
 * 使う映画IDは run スコープの合成ID（1.9e9 帯）なので、この spec 自体は
 * 実在作品に触れない。
 */

import { test, expect } from '@playwright/test';

import {
  cleanupStreamingStatus,
  getStreamingStatusRow,
  seedStreamingStatus,
  writeStreamingStatusRow,
  type MovieStreamingStatusRow,
} from '../helpers/api';
import { runScopedMovieId } from '../helpers/runScope';

/** 日次 Cron がすでに行を作っている作品を模す */
const EXISTING_MOVIE_ID = runScopedMovieId(30);
/** まだ誰も配信状況を確認していない作品を模す */
const ABSENT_MOVIE_ID = runScopedMovieId(31);

/** U-NEXT / Netflix のプロバイダーID */
const PROVIDER_UNEXT = 84;
const PROVIDER_NETFLIX = 8;

/** Cron が作った実データに見立てた行 */
const cronRow: MovieStreamingStatusRow = {
  tmdb_movie_id: EXISTING_MOVIE_ID,
  flatrate_provider_ids: [PROVIDER_NETFLIX],
  paid_provider_ids: [],
  flatrate_since: '2026-01-01T00:00:00+00:00',
  paid_since: null,
  flatrate_last_seen_at: '2026-01-02T00:00:00+00:00',
  paid_last_seen_at: null,
  flatrate_resumed: false,
  paid_resumed: false,
  checked_at: '2026-01-02T00:00:00+00:00',
};

test.describe.configure({ mode: 'serial' });

test.describe('配信状況の後片付け', () => {
  test('seed 前に行が無かった作品は、後片付けで消える', async () => {
    expect(await getStreamingStatusRow(ABSENT_MOVIE_ID)).toBeNull();

    await seedStreamingStatus({
      tmdbMovieId: ABSENT_MOVIE_ID,
      flatrateProviderIds: [PROVIDER_UNEXT],
    });
    expect(await getStreamingStatusRow(ABSENT_MOVIE_ID)).not.toBeNull();

    await cleanupStreamingStatus([ABSENT_MOVIE_ID]);

    expect(await getStreamingStatusRow(ABSENT_MOVIE_ID)).toBeNull();
  });

  test('seed 前に行があった作品は、後片付けで元の行に戻る', async () => {
    await writeStreamingStatusRow(cronRow);

    await seedStreamingStatus({
      tmdbMovieId: EXISTING_MOVIE_ID,
      flatrateProviderIds: [PROVIDER_UNEXT],
    });
    expect(
      (await getStreamingStatusRow(EXISTING_MOVIE_ID))?.flatrate_provider_ids,
    ).toEqual([PROVIDER_UNEXT]);

    await cleanupStreamingStatus([EXISTING_MOVIE_ID]);

    // ⚠️ #1116 の退行検知はここ。以前は行ごと消えて null になっていた
    const restored = await getStreamingStatusRow(EXISTING_MOVIE_ID);
    expect(restored).not.toBeNull();
    expect(restored?.flatrate_provider_ids).toEqual([PROVIDER_NETFLIX]);
    expect(restored?.flatrate_since).toBe(cronRow.flatrate_since);
    expect(restored?.checked_at).toBe(cronRow.checked_at);
  });

  test('2回 seed しても、戻るのは最初の seed より前の状態', async () => {
    await writeStreamingStatusRow(cronRow);

    await seedStreamingStatus({
      tmdbMovieId: EXISTING_MOVIE_ID,
      flatrateProviderIds: [PROVIDER_UNEXT],
    });
    await seedStreamingStatus({
      tmdbMovieId: EXISTING_MOVIE_ID,
      paidProviderIds: [PROVIDER_UNEXT],
    });

    await cleanupStreamingStatus([EXISTING_MOVIE_ID]);

    const restored = await getStreamingStatusRow(EXISTING_MOVIE_ID);
    expect(restored?.flatrate_provider_ids).toEqual([PROVIDER_NETFLIX]);
    expect(restored?.paid_provider_ids).toEqual([]);
  });

  test('seed していない作品には触れない', async () => {
    await writeStreamingStatusRow(cronRow);

    // 呼び出し側が実在IDを渡しても、E2Eが作っていない行は消さない
    await cleanupStreamingStatus([EXISTING_MOVIE_ID]);

    const untouched = await getStreamingStatusRow(EXISTING_MOVIE_ID);
    expect(untouched).not.toBeNull();
    expect(untouched?.flatrate_provider_ids).toEqual([PROVIDER_NETFLIX]);
  });
});
