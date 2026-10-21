/**
 * 舞台・演劇中継作品の判定
 */

import {
  STAGE_BROADCAST_TITLE_PATTERNS,
  STAGE_BROADCAST_TITLE_PHRASES,
} from '@/constants';
import type { Movie } from '@/lib/types';

/**
 * 舞台・演劇の中継作品かを判定する
 *
 * National Theatre Live や『舞台「〇〇」』のように、劇場で上演された
 * 演劇・ミュージカル・バレエを収録した上映作品を一覧から除く。
 *
 * ライブ・コンサート映像（`isConcertFilm`）はジャンルが Music 系に
 * 限られるため候補を絞り込めるが、舞台中継は Drama / Comedy といった
 * 劇映画ジャンルが付くため同じ手は使えない。タイトルだけで判定する分、
 * TMDbへの問い合わせは不要（同期関数）な代わりに、語の選定で誤爆を防ぐ。
 *
 * @param movie - 判定対象の映画
 * @returns 舞台・演劇の中継作品なら true
 */
export function isStageBroadcast(movie: Movie): boolean {
  // 全角英字・半角カナを畳んでから判定する（`hasConcertTitle` と同じ理由）
  const normalizedTitle = movie.title.normalize('NFKC');
  const upperTitle = normalizedTitle.toUpperCase();

  const phrases: readonly string[] = STAGE_BROADCAST_TITLE_PHRASES;
  if (phrases.some((phrase) => upperTitle.includes(phrase))) return true;

  return STAGE_BROADCAST_TITLE_PATTERNS.some((pattern) =>
    pattern.test(normalizedTitle),
  );
}
