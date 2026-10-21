/**
 * 映画詳細で表示する予告動画を選ぶ
 *
 * TMDb の videos は1作品あたり100件を超えることがあり（例: スーパーガール 124件）、
 * その大半はSNS向けの短尺プロモ（Teaser）とメイキング・インタビュー（Featurette）。
 * 全件を `<iframe>` で埋め込むと描画が破綻するため、ここで種別と件数を絞る。
 *
 * 呼び出しは映画詳細側で行う。VideoDialog の内側で絞ると、Featurette しか無い作品で
 * 「予告動画を再生」ボタンだけ表示されて中身が空になるため。
 */

import type { Video } from '@/lib/types';

/** 表示する予告動画の上限件数 */
export const TRAILER_DISPLAY_LIMIT = 5;

/** 予告編として扱う動画種別（配列の順序が表示優先度） */
const TRAILER_TYPES = ['Trailer', 'Teaser'];

/** 優先表示する言語コード */
const PREFERRED_LANGUAGE = 'ja';

/**
 * 手話版予告編を判定するパターン
 *
 * TMDb に「手話版」を示すフィールドは無いため動画名で判定する。
 * 配給元は手話版を通常版より後に公開することが多く、公開日順では先頭を占めてしまう
 * （例: スーパーガールの "Official American Sign Language Trailer"）。
 * 除外はせず、同じ種別の通常版より後ろに回すだけに留める。
 */
const SIGN_LANGUAGE_PATTERN = /sign language|\b[ab]sl\b|手話/i;

/**
 * 種別の優先度を返す（小さいほど優先）
 */
function getTypePriority(video: Video): number {
  return TRAILER_TYPES.indexOf(video.type);
}

/**
 * 言語の優先度を返す（小さいほど優先）
 *
 * TMDb に字幕有無のフラグは無いため、字幕そのものは判定できない。
 * `iso_639_1 === 'ja'` は実質「日本の配給会社が登録した日本向け予告編」を指し、
 * 日本語字幕版・日本語吹替版はここに含まれる。
 */
function getLanguagePriority(video: Video): number {
  return video.iso_639_1 === PREFERRED_LANGUAGE ? 0 : 1;
}

/**
 * 手話版かどうかの優先度を返す（小さいほど優先）
 */
function getSignLanguagePriority(video: Video): number {
  return SIGN_LANGUAGE_PATTERN.test(video.name) ? 1 : 0;
}

/**
 * 表示する予告動画を優先度順に最大 `TRAILER_DISPLAY_LIMIT` 件返す
 *
 * 優先度は 日本語 → Trailer/Teaser → 手話版以外 → 公開日の新しい順。
 *
 * @param videos - TMDb から取得した動画一覧
 * @returns 表示対象の動画（該当が無ければ空配列）
 */
export function selectTrailerVideos(videos: Video[] | undefined): Video[] {
  if (!videos) return [];

  return videos
    .filter(
      (video) => video.site === 'YouTube' && TRAILER_TYPES.includes(video.type),
    )
    .sort((a, b) => {
      const languageDiff = getLanguagePriority(a) - getLanguagePriority(b);
      if (languageDiff !== 0) return languageDiff;

      const typeDiff = getTypePriority(a) - getTypePriority(b);
      if (typeDiff !== 0) return typeDiff;

      const signLanguageDiff =
        getSignLanguagePriority(a) - getSignLanguagePriority(b);
      if (signLanguageDiff !== 0) return signLanguageDiff;

      return (
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
      );
    })
    .slice(0, TRAILER_DISPLAY_LIMIT);
}
