/**
 * TMDb API クライアント設定
 */

/**
 * TMDb API リトライ設定
 */
export const TMDB_RETRY_CONFIG = {
  /** リトライ最大回数 */
  MAX_RETRY_COUNT: 3,
  /** リトライ待機時間（ミリ秒） */
  RETRY_DELAY_MS: 1000,
  /** リトライ対象のHTTPステータスコード */
  RETRYABLE_STATUS_CODES: [429, 503, 504] as readonly number[],
} as const;

/** TMDb日本語訳の誤訳を自然な日本語に上書きするマップ */
export const GENRE_NAME_OVERRIDES: Record<string, string> = {
  履歴: '歴史',
  謎: 'ミステリー',
  西洋: '西部劇',
};

/** TMDbジャンルID → ジャンル名マッピング */
export const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'アクション',
  12: 'アドベンチャー',
  16: 'アニメーション',
  35: 'コメディ',
  80: '犯罪',
  99: 'ドキュメンタリー',
  18: 'ドラマ',
  10751: 'ファミリー',
  14: 'ファンタジー',
  36: '歴史',
  27: 'ホラー',
  10402: '音楽',
  9648: 'ミステリー',
  10749: 'ロマンス',
  878: 'SF',
  10770: 'テレビ映画',
  53: 'スリラー',
  10752: '戦争',
  37: '西部劇',
};

/**
 * TMDb Discover APIのsort_byパラメータ値
 */
export const TMDB_SORT_BY = { POPULARITY_DESC: 'popularity.desc' } as const;

/** TMDb リリース日情報の国コード（日本） */
export const TMDB_JP_COUNTRY_CODE = 'JP';

/**
 * 劇場公開を表す TMDb のリリースタイプ
 * 1:Premiere / 2:Theatrical limited / 3:Theatrical / 4:Digital / 5:Physical / 6:TV
 *
 * プレミア（1）は「映画祭等での先行上映」であり劇場公開ではないため含めない。
 */
export const TMDB_THEATRICAL_RELEASE_TYPES = [2, 3] as const;

/** デジタル（配信）公開を表す TMDb のリリースタイプ */
export const TMDB_DIGITAL_RELEASE_TYPE = 4;

/**
 * 映画詳細取得時に付与する append_to_response の値。
 * credits（キャスト・スタッフ）、watch/providers（配信情報）、videos（予告動画）を一度に取得。
 */
export const TMDB_MOVIE_DETAIL_APPEND = 'credits,watch/providers,videos';

/**
 * 予告動画を取得する言語。
 *
 * TMDb の videos は共通パラメータの `language`（本アプリでは `ja-JP`）で絞り込まれる。
 * 日本語版予告がTMDbに登録されていない作品は0件で返ってしまい、
 * 英語の Official Trailer があっても「予告編を見る」ボタンすら出なかった。
 * `null` は言語タグが付いていない動画を拾うために必要。
 */
export const TMDB_VIDEO_LANGUAGES = 'ja,en,null';

/**
 * 人物詳細取得時に付与する append_to_response の値。
 *
 * movie_credits（出演作）に加えて translations（各言語の略歴）も取る。
 * TMDb の人物 `biography` は `language=ja-JP` だと未翻訳で空文字になることが
 * 多く、英語原文へフォールバックしないとほぼ全員が「略歴なし」になるため。
 * 2回目のリクエストを足さずに済むよう append にまとめている。
 */
export const TMDB_PERSON_DETAIL_APPEND = 'movie_credits,translations';

/** 略歴のフォールバック元に使う言語コード */
export const TMDB_FALLBACK_LANGUAGE = 'en';

/**
 * JP配信実態の判定に必要な append_to_response の値。
 *
 * watch/providers と release_dates は別エンドポイントだが、append_to_response で
 * 1リクエストにまとめられる。同期対象は毎回100件規模になるため、
 * 2回に分けると TMDb のレート制限（50 req/s）に対する余裕が半減する。
 *
 * keywords も同じ理由でここに含める。プロレス興行の判定に必要だが、
 * ジャンルでは劇映画と区別が付かず候補を絞れない。配信候補は全件この
 * リクエストを通るため、相乗りすれば追加リクエストが発生しない。
 */
export const TMDB_STREAMING_AVAILABILITY_APPEND =
  'watch/providers,release_dates,keywords';

/**
 * JP配信実態チェックの同時実行数
 *
 * TMDb のレート制限は 50 req/s。リトライ（最大3回）やネットワーク揺らぎの
 * 余地を残すため、上限に張り付かない値にしている。
 */
export const TMDB_AVAILABILITY_CONCURRENCY = 10;
