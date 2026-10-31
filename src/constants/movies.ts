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
 * 舞台・演劇の中継を示すタイトル語句（部分一致で判定、大文字化して比較）
 *
 * ライブ・コンサート映像（`CONCERT_*`）と違い、舞台中継は TMDb 上
 * Drama / Comedy といった劇映画ジャンルが付くため、ジャンルで候補を
 * 絞り込めない。タイトルだけが手がかりになる分、誤爆しない語に限る。
 */
export const STAGE_BROADCAST_TITLE_PHRASES = [
  'NATIONAL THEATRE LIVE',
  'ナショナル・シアター・ライブ',
  'ザ・ステージ',
  'OPERA BALLET', // パリ・オペラ座バレエ等の公演収録
] as const;

/**
 * 「上演種別 + 作品名の括弧」という舞台作品の題の付き方
 *
 * 括弧が続くことを必須にして誤爆を避けている。`舞台` の部分一致では
 * 『ストレンジャー・シングス …"最後の冒険"の舞台裏～』を、`ミュージカル` では
 * 『ハイスクール・ミュージカル／ザ・ムービー』を巻き込むため。
 */
export const STAGE_BROADCAST_TITLE_PATTERNS: readonly RegExp[] = [
  /舞台\s*[『「]/,
  /ミュージカル\s*[『「]/,
];

/**
 * プロレスを題材とすることを示すTMDbキーワードID
 *
 * **これ単独では興行と判定できない。** プロレスを題材にした劇映画にも付く。
 * 実測では『レスラー』が `pro wrestling`、『ファイティング・ファミリー』と
 * 『ナチョ・リブレ』が `wrestling` を持つ。興行の候補を絞る用途にのみ使い、
 * 実際の判定は団体キーワードかタイトル語と組み合わせる。
 */
export const WRESTLING_KEYWORD_IDS = [
  5970, // wrestling
  206441, // pro wrestling
] as const;

/**
 * プロレス団体を示すTMDbキーワードID
 *
 * 団体そのものを指すため、劇映画には付かない。これを持つ作品は興行と判断できる。
 */
export const WRESTLING_PROMOTION_KEYWORD_IDS = [
  367574, // joshi puroresu（女子プロレス）
  360477, // tokyo joshi pro-wrestling（東京女子プロレス）
] as const;

/**
 * 興行（試合そのものの配信）であることを示すタイトル語
 *
 * 男子団体には団体キーワードが付かないことがあり（`DDT Judgement 2026` は
 * `wrestling` / `pro wrestling` のみ）、その分をここで拾う。
 *
 * 判定は `WRESTLING_KEYWORD_IDS` を持つ作品に限って行う。タイトル語だけで
 * 判定すると『エヴァンゲリオン放送30周年記念特別興行』のような無関係の作品を
 * 巻き込むため。
 */
export const WRESTLING_EVENT_TITLE_PHRASES = [
  '大会',
  '興行',
  'プロレス',
] as const;

/**
 * 格闘技の興行であることを示すTMDbキーワードID
 *
 * プロレスの団体キーワードと同じ役割。実測では `combat sports` が付く60件の
 * 大半が UFC / Krush / INOKI BOM-BA-YE といった興行で、`jmma` / `jkick` は
 * ほぼ興行専用だった。これを持つ作品は興行と判断できる。
 */
export const COMBAT_SPORTS_EVENT_KEYWORD_IDS = [
  192790, // combat sports
  361498, // jmma（日本のMMA）
  361499, // jkick（日本のキックボクシング）
] as const;

/**
 * 格闘技を扱う作品に広く付くTMDbキーワードID
 *
 * 興行の候補を絞る用途にのみ使い、実際の判定はタイトル語と組み合わせる。
 * 実測では『ウォーリアー』『スマッシング・マシーン』『デブ！！デブ！！デブ！！』が
 * `mixed martial arts (mma)` を、『キックボクサー』等のアクション映画が
 * `kickboxing` を持つ。単独で弾くと劇映画を巻き込む。
 */
export const COMBAT_SPORTS_KEYWORD_IDS = [
  9917, // mixed martial arts (mma)
  18111, // kickboxing
] as const;

/**
 * 格闘技興行であることを示すタイトル語（団体・シリーズ名）
 *
 * 興行名はそれ自体が固有名詞のため、劇映画のタイトルに現れにくい。
 * 判定は `COMBAT_SPORTS_KEYWORD_IDS` を持つ作品に限って行う。
 *
 * 大文字化して比較するため、ここも大文字で書く。
 */
export const COMBAT_SPORTS_EVENT_TITLE_PHRASES = [
  'RIZIN',
  'UFC',
  'K-1',
  'KRUSH',
  'BELLATOR',
  'PANCRASE',
] as const;

/**
 * TMDb Discover APIのwithout_keywordsパラメータ値
 *
 * 不適切コンテンツに加えて、興行特有のキーワードもここで落とす。
 * Discover 経由の取り込みは作品ごとのキーワード取得を行わないため、
 * アプリ側の判定（`isFightEvent`）の1段目をAPIパラメータで代替する。
 * TMDb側で弾けるので追加のリクエストは発生しない。
 */
export const EXCLUDED_KEYWORDS_PARAM = [
  ...EXCLUDED_KEYWORD_IDS,
  ...WRESTLING_PROMOTION_KEYWORD_IDS,
  ...COMBAT_SPORTS_EVENT_KEYWORD_IDS,
].join('|');

/**
 * 配信の提供形態（TMDb watch/providers のキー）
 *
 * 同じサービスでも見放題とレンタルでは意味が違う。実測では U-NEXT は
 * rent のみで flatrate がゼロ件であり、区別しないと「加入していれば観られる」と
 * 誤解させるため、形態ごとに保存・絞り込みを行う。
 */
export const WATCH_PROVIDER_OFFER_TYPES = ['flatrate', 'rent', 'buy'] as const;

/** 配信の提供形態 */
export type WatchProviderOfferType =
  (typeof WATCH_PROVIDER_OFFER_TYPES)[number];

/**
 * 絞り込みの選択肢として出す配信サービス（表示順）
 *
 * TMDbは日本で71件のプロバイダーを返すが、その34件は `KADOKAWA channel
 * Amazon Channel` のような Amazon Channel 系で、そのまま並べても選べない。
 * 利用者が加入を判断する主要サービスに絞る。
 *
 * 表示名はTMDbの原名をそのまま使わない。`Apple TV`(350) は見放題（Apple TV+）、
 * `Apple TV Store`(2) は購入・レンタルと実体が異なるため、区別できる名前にする。
 */
export const WATCH_PROVIDERS = [
  { id: 8, name: 'Netflix' },
  { id: 9, name: 'Amazon Prime Video' },
  { id: 337, name: 'Disney+' },
  { id: 15, name: 'Hulu' },
  { id: 84, name: 'U-NEXT' },
  { id: 350, name: 'Apple TV+' },
  { id: 10, name: 'Amazon Video' },
  { id: 2, name: 'Apple TV（購入・レンタル）' },
  { id: 2683, name: 'FOD' },
] as const;

/**
 * 同一サービスの別プロバイダーIDを代表IDへ束ねる
 *
 * TMDbは広告つきプランやAmazon Channel 経由を別プロバイダーとして返す。
 * 実測では常に代表IDとペアで出現し（配信中28件で Netflix 15件 /
 * Netflix Standard with Ads 15件と件数が一致）、そのまま保存すると
 * 選択肢に同じサービスが二重に並ぶ。
 */
export const WATCH_PROVIDER_ALIASES: Record<number, number> = {
  1796: 8, // Netflix Standard with Ads → Netflix
  2100: 9, // Amazon Prime Video with Ads → Amazon Prime Video
  2243: 350, // Apple TV Amazon Channel → Apple TV+
};

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
 * 地域フィルタのグループキー
 *
 * 一覧（映画・配信）で既定非表示にする地域。原語を地域にまとめる対応表は
 * アプリ側に置く。地域を列に持つと、グループ分けを変えるたびに
 * マイグレーションと全行バックフィルが必要になるため。
 */
export const REGION_GROUP_KEYS = ['korea', 'chinese', 'thai_indian'] as const;

/**
 * 地域フィルタのグループキー
 */
export type RegionGroupKey = (typeof REGION_GROUP_KEYS)[number];

/**
 * 地域グループと原語（ISO 639-1）の対応
 *
 * ALLOWED_LANGUAGES に載っている原語だけでは足りない。映画.com の iCal 同期は
 * `requireLanguage: false` で言語チェックを行わない（フィードに載る時点で
 * 日本公開が確定しているため）ので、許可リスト外の原語も movie_cache に入る。
 * ここは「保存されうる原語」を基準に揃える。
 *
 * TMDb は広東語を ISO 639-1 の `zh` ではなく独自コード `cn` で返すため、
 * 中華圏は両方を持つ必要がある（#881）。
 */
export const REGION_LANGUAGE_GROUPS: Record<RegionGroupKey, readonly string[]> =
  {
    korea: ['ko'],
    chinese: [
      'zh', // 北京語
      'cn', // 広東語（TMDb 独自コード）
    ],
    // インド側は主要な映画産業を持つ言語に揃える。作品数が極小の言語まで
    // 広げると線引きが曖昧になるため、実際に流通する範囲で区切る
    thai_indian: [
      'th', // タイ語
      'hi', // ヒンディー語
      'te', // テルグ語
      'ta', // タミル語
      'ml', // マラヤーラム語
      'kn', // カンナダ語
      'mr', // マラーティー語
      'bn', // ベンガル語
      'pa', // パンジャブ語
      'gu', // グジャラート語
    ],
  };

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
