/**
 * 公開日フィルターで選べる範囲
 *
 * タブの組み合わせごとに、サーバーが日付をどう扱うかが違う
 * （`src/app/api/movies/route.ts` の日付範囲の決定）。UI 側がこれを
 * 知らずに無制限のカレンダーを出していたため、**そのタブでは必ず0件に
 * なる日付まで選べて**いた（#994）。
 */

import { addMonths, format } from 'date-fns';

import {
  MOVIES_FETCH_MONTHS_AHEAD,
  NOW_SHOWING_MONTHS_BACK,
  RELEASE_TYPE,
} from '@/constants/movies';

/** 一覧のタブ（公開種別 × 時間軸） */
export interface DateFilterTab {
  releaseType: 'theatrical' | 'streaming';
  timeFrame: 'upcoming' | 'now_showing';
}

/** `input type="date"` に渡す範囲。未定義なら制限しない */
export interface DateFilterBounds {
  min?: string;
  max?: string;
}

/** `input type="date"` が受け取る形式へ揃える */
function toDateInputValue(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * タブの組み合わせから、選べる日付の範囲を返す
 *
 * ## 5つの境界のうち、サーバー規則の写しは2つだけ
 *
 * 「定数を共有しているので UI とサーバーがずれない」とは**言えない**。
 *
 * | 境界 | 対応するサーバー規則 |
 * |---|---|
 * | 劇場×公開予定 `min=今日` | ✅ `route.ts` の丸めそのもの |
 * | 配信×配信中 `min=今日−2ヶ月` | ✅ 同上 |
 * | 劇場×公開予定 `max=今日+3ヶ月` | ❌ DBクエリに上限は無い。`MOVIES_FETCH_MONTHS_AHEAD` は TMDb Discover の取得窓を縛るだけ |
 * | 劇場×公開中 `max=今日` | ❌ サーバー規則なし。データ分布からの経験則 |
 * | 配信×配信中 `max=今日` | △ 既定値としては同じだが、ユーザー指定の未来 `lte` はサーバーが尊重する |
 *
 * 後ろ3つは**今日のデータ分布では一致する経験則**で、将来データが
 * 広がったときに取りこぼしうる。
 *
 * ## 劇場×公開中に下限を付けない理由
 *
 * 母集団が TMDb の `now_playing` 由来で取得時に日付範囲を指定して
 * いない。ロングラン・リバイバル上映は公開日がかなり古くなる
 * （本番の実測で最古は1996年）。下限を切ると実在作品を取りこぼす。
 *
 * ## 配信×配信予定に制約を付けない理由
 *
 * このタブの日付は `release_date`（劇場公開日）に効き、サーバー側に
 * 丸めが無い。「劇場公開済み・配信はこれから」を拾う設計なので、
 * 過去日も契約上は有効。**このタブだけ本対応で改善しない。**
 *
 * @param tab - 一覧のタブ
 * @param today - 「今日」とみなす日付（既定は実行時のローカル日付）
 * @returns 選べる日付の範囲
 */
export function getDateFilterBounds(
  tab: DateFilterTab,
  today: Date = new Date(),
): DateFilterBounds {
  const todayValue = toDateInputValue(today);

  if (tab.releaseType === RELEASE_TYPE.THEATRICAL) {
    if (tab.timeFrame === 'upcoming') {
      return {
        min: todayValue,
        max: toDateInputValue(addMonths(today, MOVIES_FETCH_MONTHS_AHEAD)),
      };
    }

    return { max: todayValue };
  }

  if (tab.timeFrame === 'now_showing') {
    return {
      min: toDateInputValue(addMonths(today, -NOW_SHOWING_MONTHS_BACK)),
      max: todayValue,
    };
  }

  return {};
}

/**
 * 日付が範囲に収まっているか
 *
 * `min` / `max` はピッカーを制限するだけで、**手入力された値は強制されない**。
 * 2つの入力は `<form>` の外にあり「適用」も素の `<button>` なので、
 * `:invalid` も submit のブロックも効かない。適用時に自分で見る必要がある。
 *
 * ⚠️ `YYYY-MM-DD` はゼロ埋めされているので文字列比較で前後を判定できる。
 *
 * @param value - 検証する日付（未指定なら範囲内とみなす）
 * @param bounds - 選べる範囲
 * @returns 範囲に収まっていれば true
 */
export function isWithinDateFilterBounds(
  value: string | undefined,
  bounds: DateFilterBounds,
): boolean {
  if (value === undefined || value === '') return true;
  if (bounds.min !== undefined && value < bounds.min) return false;
  if (bounds.max !== undefined && value > bounds.max) return false;

  return true;
}
