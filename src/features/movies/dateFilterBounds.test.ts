/**
 * 公開日フィルターの範囲算出のテスト
 */

import {
  getDateFilterBounds,
  isWithinDateFilterBounds,
} from './dateFilterBounds';

/** 「今日」を 2026-06-15 に固定する */
const TODAY = new Date('2026-06-15T09:00:00+09:00');

describe('getDateFilterBounds', () => {
  // サーバーの丸めと同じ（route.ts が gte を today へ引き上げる）
  it('劇場×公開予定は今日から3ヶ月先まで', () => {
    expect(
      getDateFilterBounds(
        { releaseType: 'theatrical', timeFrame: 'upcoming' },
        TODAY,
      ),
    ).toEqual({ min: '2026-06-15', max: '2026-09-15' });
  });

  // ロングラン・リバイバルで公開日が古くなるため下限を付けない
  it('劇場×公開中は上限のみ（下限なし）', () => {
    expect(
      getDateFilterBounds(
        { releaseType: 'theatrical', timeFrame: 'now_showing' },
        TODAY,
      ),
    ).toEqual({ max: '2026-06-15' });
  });

  it('配信×配信中は今日の2ヶ月前から今日まで', () => {
    expect(
      getDateFilterBounds(
        { releaseType: 'streaming', timeFrame: 'now_showing' },
        TODAY,
      ),
    ).toEqual({ min: '2026-04-15', max: '2026-06-15' });
  });

  // 日付が release_date（劇場公開日）に効き、サーバー側に丸めが無い
  it('配信×配信予定は制限なし', () => {
    expect(
      getDateFilterBounds(
        { releaseType: 'streaming', timeFrame: 'upcoming' },
        TODAY,
      ),
    ).toEqual({});
  });

  it('月末をまたぐ計算で日が繰り上がらない', () => {
    // 2026-12-31 の3ヶ月先は 2027-03-31
    expect(
      getDateFilterBounds(
        { releaseType: 'theatrical', timeFrame: 'upcoming' },
        new Date('2026-12-31T09:00:00+09:00'),
      ),
    ).toEqual({ min: '2026-12-31', max: '2027-03-31' });
  });

  // date-fns の addMonths は存在しない日付を月末へ丸める
  it('3ヶ月先に同じ日が無い場合は月末になる', () => {
    expect(
      getDateFilterBounds(
        { releaseType: 'theatrical', timeFrame: 'upcoming' },
        new Date('2026-11-30T09:00:00+09:00'),
      ),
    ).toEqual({ min: '2026-11-30', max: '2027-02-28' });
  });

  it('引数を省略すると実行時の日付を使う', () => {
    const bounds = getDateFilterBounds({
      releaseType: 'theatrical',
      timeFrame: 'upcoming',
    });

    expect(bounds.min).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(bounds.max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isWithinDateFilterBounds', () => {
  const bounds = { min: '2026-06-15', max: '2026-09-15' };

  it.each([
    ['下限ちょうど', '2026-06-15'],
    ['範囲の中', '2026-07-01'],
    ['上限ちょうど', '2026-09-15'],
  ])('%s（%s）を範囲内と判定する', (_label, value) => {
    expect(isWithinDateFilterBounds(value, bounds)).toBe(true);
  });

  it.each([
    ['下限より前', '2026-06-14'],
    ['上限より後', '2026-09-16'],
    ['遠い過去', '2020-01-01'],
  ])('%s（%s）を範囲外と判定する', (_label, value) => {
    expect(isWithinDateFilterBounds(value, bounds)).toBe(false);
  });

  it('未指定は範囲内とみなす（絞り込まない）', () => {
    expect(isWithinDateFilterBounds(undefined, bounds)).toBe(true);
    expect(isWithinDateFilterBounds('', bounds)).toBe(true);
  });

  it('制限が無ければどんな日付でも範囲内', () => {
    expect(isWithinDateFilterBounds('1900-01-01', {})).toBe(true);
    expect(isWithinDateFilterBounds('2999-12-31', {})).toBe(true);
  });

  it('上限のみの指定では下限を見ない', () => {
    expect(isWithinDateFilterBounds('1996-02-17', { max: '2026-06-15' })).toBe(
      true,
    );
    expect(isWithinDateFilterBounds('2026-06-16', { max: '2026-06-15' })).toBe(
      false,
    );
  });
});
