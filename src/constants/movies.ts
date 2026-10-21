/**
 * 映画関連の定数
 */

import { errorMessage, successMessage } from './common';
import { MS_PER_DAY } from './time';

/**
 * ソート選択肢
 */
export const SORT_OPTIONS = [
  { label: '公開日順', value: 'release_date' },
  { label: '人気順', value: 'popularity' },
  { label: '評価順', value: 'vote_average' },
] as const;

/**
 * デフォルトソート
 */
export const DEFAULT_SORT = 'release_date' as const;

/**
 * キャッシュ有効時間（時間）
 */
export const CACHE_DURATION_HOURS = 6;

/**
 * Now Playing キャッシュ有効時間（時間）
 */
export const NOW_PLAYING_CACHE_DURATION_HOURS = 24;

/**
 * 映画取得範囲（何ヶ月先まで）
 */
export const MOVIES_FETCH_MONTHS_AHEAD = 3;

/**
 * 公開中映画の取得範囲（何ヶ月前まで）
 */
export const NOW_SHOWING_MONTHS_BACK = 2;

/**
 * リリースタイプ値（このファイル内のリリースタイプの単一ソース）
 */
export const RELEASE_TYPE = {
  THEATRICAL: 'theatrical',
  STREAMING: 'streaming',
} as const;

/**
 * リリースタイプ選択肢
 */
export const RELEASE_TYPE_OPTIONS = [
  { label: '劇場公開', value: RELEASE_TYPE.THEATRICAL },
  { label: 'ストリーミング', value: RELEASE_TYPE.STREAMING },
] as const;

/**
 * デフォルトリリースタイプ
 */
export const DEFAULT_RELEASE_TYPE = RELEASE_TYPE.THEATRICAL;

/**
 * TMDb APIのwith_release_typeパラメータへのマッピング
 */
export const RELEASE_TYPE_MAP: Record<
  (typeof RELEASE_TYPE)[keyof typeof RELEASE_TYPE],
  string
> = {
  [RELEASE_TYPE.THEATRICAL]: '2|3',
  [RELEASE_TYPE.STREAMING]: '4',
};

/**
 * 映画フィルタリング: 最低評価スコア（これ未満は除外）
 */
export const MIN_VOTE_AVERAGE = 3;

/**
 * 映画フィルタリング: 最低人気度（評価済みでもこれ未満は除外）
 */
export const MIN_POPULARITY = 0.5;

/**
 * 配信作品フィルタリング: 最低人気度
 *
 * `MIN_POPULARITY` は劇場公開の新作を前提にした閾値。配信カタログには
 * 公開から時間が経って popularity が下がった旧作が多く含まれ、同じ閾値では
 * 日本で実配信中の作品まで落ちてしまうため、streaming では緩める。
 */
export const STREAMING_MIN_POPULARITY = 0.1;

/**
 * TMDb Discover APIで除外するジャンルID
 */
export const EXCLUDED_GENRE_IDS = [
  10770, // TV Movie
] as const;

/**
 * TMDb Discover APIのwithout_genresパラメータ値
 */
export const EXCLUDED_GENRES_PARAM = EXCLUDED_GENRE_IDS.join('|');

/**
 * TMDb Discover APIで除外するキーワードID
 * 不適切コンテンツ（softcore, ポルノ, ピンク映画等）を除外する
 */
export const EXCLUDED_KEYWORD_IDS = [
  155477, // softcore
  190370, // erotic movie
  10053, // sexploitation
  445, // pornography
  260863, // hardcore
  198385, // hentai
  161919, // adult animation
  159551, // pink film
] as const;

/**
 * TMDb Discover APIのwithout_keywordsパラメータ値
 */
export const EXCLUDED_KEYWORDS_PARAM = EXCLUDED_KEYWORD_IDS.join('|');

/**
 * 音楽ジャンルID（TMDb）
 */
export const MUSIC_GENRE_ID = 10402;

/**
 * ドキュメンタリージャンルID（TMDb）
 */
export const DOCUMENTARY_GENRE_ID = 99;

/**
 * ライブ興行作品の候補とみなすジャンル構成
 *
 * ライブビューイング・コンサート映像・舞台中継は Music 単体か
 * Music + Documentary で登録され、劇映画ジャンルを持たない。
 * これ以外のジャンルを併せ持つ作品はミュージカル映画や音楽伝記映画
 * （『ボヘミアン・ラプソディ』等）なので候補にしない。
 *
 * ただしこの構成は音楽ドキュメンタリー映画（『オアシス：ドント・ルック・
 * バック・イン・アンガー』等）と完全に同一であり、ジャンルだけでは
 * 両者を区別できない。実際に除外するかはキーワードとタイトルで判定する。
 */
export const CONCERT_FILM_CANDIDATE_GENRE_IDS = [
  MUSIC_GENRE_ID,
  DOCUMENTARY_GENRE_ID,
] as const;

/**
 * ライブ興行・観客参加型上映を示すTMDbキーワードID
 *
 * `concert footage`(177751) / `farewell concert`(13130) は過去のライブ映像を
 * 引用する音楽ドキュメンタリーにも付くため含めない（『One to One：ジョン＆ヨーコ』が
 * これに該当し、含めると誤って除外される）。
 */
export const CONCERT_KEYWORD_IDS = [
  156205, // concert film
  6029, // concert
  318730, // live concert
  162066, // rock concert
  304615, // music concert
  378298, // vr concert
  324543, // anniversary concert
  11634, // live performance
  324094, // live musical performance
  206353, // live show
  161153, // sing-along（応援上映・シングアロング上映）
] as const;

/**
 * ライブ興行を示すタイトル語（単語境界で判定、大文字化して比較）
 *
 * TMDbのキーワードは日本・アジア圏の新作ライブビューイングに付いていないことが
 * 多く、キーワードだけでは半数近くを取りこぼす（『ヨルシカ LIVE「盗作」』
 * 『ATEEZ: LIGHT THE WAY IN CINEMAS』等）。そのためタイトルでも判定する。
 *
 * 部分一致ではなく単語境界で判定するのは、`LIVE` が `ALIVE` / `OLIVE`、
 * `TOUR` が `DETOUR` に誤マッチするため。
 */
export const CONCERT_TITLE_WORDS = [
  'CONCERT',
  'LIVE',
  'LIVESTREAM',
  'TOUR',
] as const;

/**
 * ライブ興行を示すタイトル語句（部分一致で判定、大文字化して比較）
 *
 * 複合語とCJK圏の表記。単語境界による判定ができない（CJKは語間に区切りが無く、
 * 複合語は語単位では誤爆する）ため部分一致で見る。
 */
export const CONCERT_TITLE_PHRASES = [
  'IN CINEMAS',
  'THE STAGE',
  'THE MUSICAL',
  'ライヴ',
  'ライブ',
  'ツアー',
  'コンサート',
  '公演',
  '콘서트', // コンサート（韓国語）
  '투어', // ツアー（韓国語）
  '演唱会', // コンサート（中国語）
] as const;

/**
 * 許可する原語（ISO 639-1）
 * この一覧に含まれない言語の映画は除外される
 */
export const ALLOWED_LANGUAGES = [
  'ja', // 日本語
  'en', // 英語
  'fr', // フランス語
  'de', // ドイツ語
  'es', // スペイン語
  'it', // イタリア語
  'no', // ノルウェー語
  'sv', // スウェーデン語
  'da', // デンマーク語
  'hi', // ヒンディー語
  'te', // テルグ語
  'ta', // タミル語
  // 日本の配信市場では韓国・中華圏・タイ作品の需要が大きく、
  // 除外すると明確な取りこぼしになるため許可する
  'ko', // 韓国語
  'zh', // 中国語
  'th', // タイ語
] as const;

/**
 * バッチ更新: 1回のバッチで処理する映画数
 */
export const BATCH_UPDATE_SIZE = 100;

/**
 * ジャンルキャッシュ有効期間（ミリ秒） — 24時間
 */
export const GENRE_CACHE_DURATION_MS = MS_PER_DAY;

/**
 * Discover API 最大ページ数
 */
export const DISCOVER_API_MAX_PAGES = 5;

/**
 * Now Playing 同期 最大ページ数
 */
export const NOW_PLAYING_SYNC_MAX_PAGES = 10;

/**
 * 劇場公開中映画の公開日範囲（月数）
 */
export const NOW_SHOWING_RELEASE_DATE_RANGE_MONTHS = 3;

/**
 * 公開年バリデーション範囲
 */
export const MOVIE_YEAR_RANGE = {
  MIN: 1888,
  MAX: 2100,
} as const;

/**
 * 映画APIエラーメッセージ
 */
export const MOVIES_ERROR_MESSAGES = {
  /** クエリパラメータ不正 */
  INVALID_QUERY: errorMessage.invalid('クエリパラメータ'),
  /** 映画データ取得失敗 */
  FETCH_FAILED: errorMessage.fetchFailed('映画データ'),
  /** 映画ID不正 */
  INVALID_MOVIE_ID: errorMessage.invalid('映画ID'),
  /** 映画未検出 */
  NOT_FOUND: errorMessage.notFound('映画'),
} as const;

/**
 * 映画API成功メッセージ
 */
export const MOVIES_SUCCESS_MESSAGES = {
  /** 映画キャッシュ更新完了 */
  CACHE_UPDATED: successMessage.updated('映画キャッシュ'),
} as const;
