/**
 * 配信状態の遷移ロジック テスト
 */

import { resolveStreamingOffer } from './resolveStreamingStatus';
import type { StreamingOfferState } from './resolveStreamingStatus';

const NOW = new Date('2026-11-01T12:00:00Z');

/** 日数を引いた ISO 文字列を作る */
const daysAgo = (days: number): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe('resolveStreamingOffer', () => {
  describe('初めて配信を確認したとき', () => {
    it('since に現在時刻を記録する', () => {
      const result = resolveStreamingOffer(null, [8, 84], NOW);

      expect(result.providerIds).toEqual([8, 84]);
      expect(result.since).toBe(NOW.toISOString());
      expect(result.lastSeenAt).toBe(NOW.toISOString());
      expect(result.resumed).toBe(false);
    });

    it('保存済みの状態はあるが since が無いときも初配信として扱う', () => {
      const previous: StreamingOfferState = {
        providerIds: [],
        since: null,
        lastSeenAt: null,
        resumed: false,
      };

      const result = resolveStreamingOffer(previous, [8], NOW);

      expect(result.since).toBe(NOW.toISOString());
      expect(result.resumed).toBe(false);
    });
  });

  describe('配信が続いているとき', () => {
    it('since を変えずに lastSeenAt だけ進める', () => {
      const previous: StreamingOfferState = {
        providerIds: [8],
        since: daysAgo(30),
        lastSeenAt: daysAgo(1),
        resumed: false,
      };

      const result = resolveStreamingOffer(previous, [8, 84], NOW);

      expect(result.since).toBe(daysAgo(30));
      expect(result.lastSeenAt).toBe(NOW.toISOString());
      expect(result.providerIds).toEqual([8, 84]);
    });

    it('resumed の値を引き継ぐ', () => {
      const previous: StreamingOfferState = {
        providerIds: [8],
        since: daysAgo(10),
        lastSeenAt: daysAgo(1),
        resumed: true,
      };

      const result = resolveStreamingOffer(previous, [8], NOW);

      expect(result.resumed).toBe(true);
    });
  });

  describe('配信が見えなくなったとき', () => {
    it('providerIds は空にするが since と lastSeenAt は保つ', () => {
      const previous: StreamingOfferState = {
        providerIds: [8],
        since: daysAgo(30),
        lastSeenAt: daysAgo(1),
        resumed: false,
      };

      const result = resolveStreamingOffer(previous, [], NOW);

      expect(result.providerIds).toEqual([]);
      expect(result.since).toBe(daysAgo(30));
      expect(result.lastSeenAt).toBe(daysAgo(1));
      expect(result.resumed).toBe(false);
    });

    it('一度も配信が無かった作品は空のままにする', () => {
      const result = resolveStreamingOffer(null, [], NOW);

      expect(result.providerIds).toEqual([]);
      expect(result.since).toBeNull();
      expect(result.lastSeenAt).toBeNull();
      expect(result.resumed).toBe(false);
    });
  });

  describe('途切れてから復活したとき', () => {
    it('7日未満の欠落なら since を保ち、再配信にしない', () => {
      const previous: StreamingOfferState = {
        providerIds: [],
        since: daysAgo(30),
        lastSeenAt: daysAgo(2),
        resumed: false,
      };

      const result = resolveStreamingOffer(previous, [8], NOW);

      expect(result.since).toBe(daysAgo(30));
      expect(result.resumed).toBe(false);
      expect(result.lastSeenAt).toBe(NOW.toISOString());
    });

    it('7日以上空いていたら since を更新して再配信にする', () => {
      const previous: StreamingOfferState = {
        providerIds: [],
        since: daysAgo(100),
        lastSeenAt: daysAgo(30),
        resumed: false,
      };

      const result = resolveStreamingOffer(previous, [8], NOW);

      expect(result.since).toBe(NOW.toISOString());
      expect(result.resumed).toBe(true);
    });

    it('ちょうど7日の欠落は再配信として扱う', () => {
      const previous: StreamingOfferState = {
        providerIds: [],
        since: daysAgo(100),
        lastSeenAt: daysAgo(7),
        resumed: false,
      };

      const result = resolveStreamingOffer(previous, [8], NOW);

      expect(result.since).toBe(NOW.toISOString());
      expect(result.resumed).toBe(true);
    });

    it('一度再配信になった作品が継続してもフラグは下りない', () => {
      const previous: StreamingOfferState = {
        providerIds: [],
        since: daysAgo(5),
        lastSeenAt: daysAgo(1),
        resumed: true,
      };

      const result = resolveStreamingOffer(previous, [8], NOW);

      expect(result.resumed).toBe(true);
    });
  });
});
