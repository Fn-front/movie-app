/**
 * プロレス興行の判定
 */

import {
  WRESTLING_EVENT_TITLE_PHRASES,
  WRESTLING_KEYWORD_IDS,
  WRESTLING_PROMOTION_KEYWORD_IDS,
} from '@/constants';

/**
 * プロレス興行（試合そのものの配信）かを判定する
 *
 * 配信タブに団体の興行が並ぶのを防ぐための判定。映画作品ではないため除く。
 *
 * ジャンルは `Action` / `Drama` / `Comedy` が付き劇映画と区別が付かない。
 * キーワードも `pro wrestling` が『レスラー』に、`wrestling` が
 * 『ファイティング・ファミリー』『ナチョ・リブレ』に付くため単独では使えない。
 * そこで2段構えにしている。
 *
 * 1. 団体キーワード（`joshi puroresu` 等）を持つなら興行。団体そのものを
 *    指すキーワードなので劇映画には付かない
 * 2. 汎用のレスリングキーワードを持つ作品に限り、タイトルの興行語で判定する。
 *    男子団体には団体キーワードが付かないことがあるため
 *
 * キーワードは呼び出し側が取得済みのものを渡す。`syncStreamingMovies` は
 * `getJpStreamingAvailability` の `append_to_response` でまとめて取得しており、
 * この判定のための追加リクエストは発生しない。
 *
 * @param keywordIds - TMDbキーワードID
 * @param title - 映画タイトル
 * @returns プロレス興行なら true
 */
export function isWrestlingEvent(keywordIds: number[], title: string): boolean {
  const promotionIds: readonly number[] = WRESTLING_PROMOTION_KEYWORD_IDS;
  if (keywordIds.some((id) => promotionIds.includes(id))) return true;

  const wrestlingIds: readonly number[] = WRESTLING_KEYWORD_IDS;
  if (!keywordIds.some((id) => wrestlingIds.includes(id))) return false;

  const normalizedTitle = title.normalize('NFKC');
  const phrases: readonly string[] = WRESTLING_EVENT_TITLE_PHRASES;
  return phrases.some((phrase) => normalizedTitle.includes(phrase));
}
