/**
 * @jest-environment node
 */

/**
 * movie_streaming_status の行組み立て テスト
 *
 * 日次Cronとウォッチリスト追加の両方がこの関数を通る。
 * 列の対応づけがずれると、どちらかの経路だけが壊れる
 */

import { buildStreamingStatusRow } from './buildStreamingStatusRow';
import type { StreamingOfferState } from './resolveStreamingStatus';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const NOW_ISO = NOW.toISOString();

const noPrevious = { flatrate: null, paid: null };

const providers = (overrides: {
  flatrate?: number[];
  rent?: number[];
  buy?: number[];
}) => ({
  flatrate: overrides.flatrate ?? [],
  rent: overrides.rent ?? [],
  buy: overrides.buy ?? [],
});

describe('buildStreamingStatusRow', () => {
  it('未登録の作品は since / last_seen_at に現在時刻を入れる', () => {
    const row = buildStreamingStatusRow(
      100,
      noPrevious,
      providers({ flatrate: [84] }),
      NOW,
    );

    expect(row).toEqual({
      tmdb_movie_id: 100,
      flatrate_provider_ids: [84],
      paid_provider_ids: [],
      flatrate_since: NOW_ISO,
      paid_since: null,
      flatrate_last_seen_at: NOW_ISO,
      paid_last_seen_at: null,
      flatrate_resumed: false,
      paid_resumed: false,
      checked_at: NOW_ISO,
    });
  });

  // 実測で「購入のみ」は0件。UI でも「レンタル」の一語で足りる
  it('rent と buy を重複を除いて paid にまとめる', () => {
    const row = buildStreamingStatusRow(
      100,
      noPrevious,
      providers({ rent: [10, 11], buy: [11, 12] }),
      NOW,
    );

    expect(row.paid_provider_ids).toEqual([10, 11, 12]);
    expect(row.flatrate_provider_ids).toEqual([]);
  });

  it('配信が無ければ provider_ids は空、since は null のまま', () => {
    const row = buildStreamingStatusRow(100, noPrevious, providers({}), NOW);

    expect(row.flatrate_provider_ids).toEqual([]);
    expect(row.paid_provider_ids).toEqual([]);
    expect(row.flatrate_since).toBeNull();
    expect(row.paid_since).toBeNull();
    expect(row.checked_at).toBe(NOW_ISO);
  });

  // 継続配信中の作品が毎回「配信開始」として先頭へ浮上しないこと
  it('継続配信中は since を動かさない', () => {
    const previous: StreamingOfferState = {
      providerIds: [84],
      since: '2026-10-01T00:00:00.000Z',
      lastSeenAt: '2026-11-03T11:00:00.000Z',
      resumed: false,
    };

    const row = buildStreamingStatusRow(
      100,
      { flatrate: previous, paid: null },
      providers({ flatrate: [84, 9] }),
      NOW,
    );

    expect(row.flatrate_since).toBe('2026-10-01T00:00:00.000Z');
    expect(row.flatrate_last_seen_at).toBe(NOW_ISO);
    expect(row.flatrate_provider_ids).toEqual([84, 9]);
  });

  // TMDb のデータが1日欠けただけで配信終了扱いにしない
  it('今回確認できなければ provider_ids だけ空にして記録は残す', () => {
    const previous: StreamingOfferState = {
      providerIds: [84],
      since: '2026-10-01T00:00:00.000Z',
      lastSeenAt: '2026-11-03T11:00:00.000Z',
      resumed: false,
    };

    const row = buildStreamingStatusRow(
      100,
      { flatrate: previous, paid: null },
      providers({}),
      NOW,
    );

    expect(row.flatrate_provider_ids).toEqual([]);
    expect(row.flatrate_since).toBe('2026-10-01T00:00:00.000Z');
    expect(row.flatrate_last_seen_at).toBe('2026-11-03T11:00:00.000Z');
  });
});
