/**
 * 格闘技・プロレス興行の判定
 */

import {
  COMBAT_SPORTS_EVENT_KEYWORD_IDS,
  COMBAT_SPORTS_EVENT_TITLE_PHRASES,
  COMBAT_SPORTS_KEYWORD_IDS,
  WRESTLING_EVENT_TITLE_PHRASES,
  WRESTLING_KEYWORD_IDS,
  WRESTLING_PROMOTION_KEYWORD_IDS,
} from '@/constants';

/** 興行を直接示すキーワード（これ単独で興行と判断できる） */
const EVENT_KEYWORD_IDS: readonly number[] = [
  ...WRESTLING_PROMOTION_KEYWORD_IDS,
  ...COMBAT_SPORTS_EVENT_KEYWORD_IDS,
];

/**
 * 汎用キーワードと、それに対応する興行名・興行語の組み合わせ
 *
 * プロレスと格闘技でタイトルの作りが違うため、組を分けて持つ。
 * プロレスは「〜大会」のような一般語、格闘技は `RIZIN` のような固有名詞で
 * 現れるため、両者を混ぜると誤爆の範囲が広がる。
 */
const GENERIC_KEYWORD_RULES: readonly {
  keywordIds: readonly number[];
  titlePhrases: readonly string[];
}[] = [
  {
    keywordIds: WRESTLING_KEYWORD_IDS,
    titlePhrases: WRESTLING_EVENT_TITLE_PHRASES,
  },
  {
    keywordIds: COMBAT_SPORTS_KEYWORD_IDS,
    titlePhrases: COMBAT_SPORTS_EVENT_TITLE_PHRASES,
  },
];

/**
 * 格闘技・プロレスの興行（試合そのものの上映・配信）かを判定する
 *
 * 一覧に団体の興行が並ぶのを防ぐための判定。映画作品ではないため除く。
 *
 * ジャンルは `Action` / `Drama` / `Comedy` が付き劇映画と区別が付かない。
 * キーワードも単独では使えない。実測では `pro wrestling` が『レスラー』に、
 * `mixed martial arts (mma)` が『ウォーリアー』『スマッシング・マシーン』に、
 * `kickboxing` が『キックボクサー』系のアクション映画に付く。
 * そこで2段構えにしている。
 *
 * 1. 興行を直接示すキーワード（`joshi puroresu` / `combat sports` 等）を
 *    持つなら興行。団体名や興行シーンそのものを指すため劇映画には付かない
 * 2. 汎用キーワードを持つ作品に限り、タイトルの興行語・興行名で判定する。
 *    男子のプロレス団体には団体キーワードが付かないことがあり、格闘技も
 *    `RIZIN 55` のように固有名詞だけで番組名が成立するため
 *
 * キーワードは呼び出し側が取得済みのものを渡す。各同期経路はいずれも
 * 別の目的でキーワードを取得済みで、この判定のための追加リクエストは
 * 発生しない。Discover 経由の取り込みだけはキーワードを取得しないため、
 * 1段目を `without_keywords`（`EXCLUDED_KEYWORDS_PARAM`）で代替している。
 *
 * @param keywordIds - TMDbキーワードID
 * @param title - 映画タイトル
 * @returns 格闘技・プロレスの興行なら true
 */
export function isFightEvent(keywordIds: number[], title: string): boolean {
  if (keywordIds.some((id) => EVENT_KEYWORD_IDS.includes(id))) return true;

  // 全角英数を畳んでから比較する（`ＲＩＺＩＮ` を取りこぼさないため）
  const normalizedTitle = title.normalize('NFKC');
  const upperTitle = normalizedTitle.toUpperCase();

  return GENERIC_KEYWORD_RULES.some(({ keywordIds: generic, titlePhrases }) => {
    if (!keywordIds.some((id) => generic.includes(id))) return false;
    return titlePhrases.some((phrase) => upperTitle.includes(phrase));
  });
}
