/**
 * TMDb API クライアント
 */

import {
  API,
  DOCUMENTARY_GENRE_ID,
  EXCLUDED_GENRE_IDS,
  EXCLUDED_GENRES_PARAM,
  EXCLUDED_KEYWORD_IDS,
  EXCLUDED_KEYWORDS_PARAM,
  HTTP_STATUS,
  PAGINATION,
  PERSON_NON_ACTING_CHARACTER_PATTERN,
  TMDB_DIGITAL_RELEASE_TYPE,
  TMDB_ENDPOINTS,
  TMDB_FALLBACK_LANGUAGE,
  TMDB_MOVIE_DETAIL_APPEND,
  TMDB_PERSON_DETAIL_APPEND,
  TMDB_JP_COUNTRY_CODE,
  TMDB_RETRY_CONFIG,
  TMDB_STREAMING_AVAILABILITY_APPEND,
  TMDB_THEATRICAL_RELEASE_TYPES,
  TMDB_VIDEO_LANGUAGES,
  WATCH_PROVIDER_OFFER_TYPES,
  type WatchProviderOfferType,
} from '@/constants';
import { normalizeWatchProviderIds } from '@/lib/movies/watchProviders';
import type {
  DismissSignals,
  Movie,
  MovieCacheStats,
  MovieDetail,
  MovieSearchParams,
  PersonDetail,
  PersonMovieCredit,
  TMDbReleaseDateCountry,
  TMDbResponse,
  WatchProviders,
} from '@/lib/types';

import axios, { type AxiosError } from 'axios';

/**
 * TMDb API Read Access Token
 */
const TMDB_ACCESS_TOKEN = process.env.TMDB_API_KEY;

if (!TMDB_ACCESS_TOKEN) {
  throw new Error('TMDB_API_KEY is not defined');
}

/**
 * TMDb専用Axiosインスタンス
 */
const tmdbClient = axios.create({
  baseURL: API.TMDB_BASE_URL,
  headers: {
    Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`,
  },
  params: {
    language: API.TMDB_LANGUAGE,
    region: API.TMDB_REGION,
    // 全エンドポイント共通でアダルト作品を除外する（新規関数で付け忘れないよう既定値化）
    include_adult: false,
  },
});

/**
 * リトライ可能なエラー時の自動リトライインターセプター
 * - 429: レート制限超過
 * - 503: サービス一時停止
 * - 504: タイムアウト
 */
tmdbClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config;
  const status = error.response?.status;

  if (
    !config ||
    !status ||
    !TMDB_RETRY_CONFIG.RETRYABLE_STATUS_CODES.includes(status)
  ) {
    return Promise.reject(error);
  }

  const retryCount = (config as { __retryCount?: number }).__retryCount ?? 0;

  if (retryCount >= TMDB_RETRY_CONFIG.MAX_RETRY_COUNT) {
    return Promise.reject(error);
  }

  (config as { __retryCount?: number }).__retryCount = retryCount + 1;

  const retryAfter = error.response?.headers?.['retry-after'];
  const delay = retryAfter
    ? Number(retryAfter) * 1000
    : TMDB_RETRY_CONFIG.RETRY_DELAY_MS;

  await new Promise((resolve) => setTimeout(resolve, delay));

  return tmdbClient(config);
});

/**
 * ページ番号のバリデーション（TMDb APIは1〜500のみ有効）
 */
function validatePage(page: number): number {
  return Math.max(1, Math.min(page, PAGINATION.MAX_PAGE));
}

/**
 * 不適切コンテンツを結果側から除外する
 *
 * TMDbの `without_keywords` / `without_genres` は `/discover/movie` でしか
 * サポートされないため、`/search/movie` や `/movie/now_playing` では
 * APIパラメータで足切りできない。
 * そこで取得後の結果に対して `adult` フラグと除外ジャンルを一律で弾き、
 * `include_adult=false` との二重防御とする。
 *
 * `/person/{id}` の `movie_credits` も同様に `include_adult` が効かないため、
 * `adult` / `genre_ids` を持つ形であれば何でも通せるよう型を緩めている。
 *
 * @param movies - TMDbから取得した映画リスト
 * @returns 不適切コンテンツを除いた映画リスト
 */
function excludeInappropriateMovies<
  T extends Pick<Movie, 'adult' | 'genre_ids'>,
>(movies: T[]): T[] {
  const excludedGenres: readonly number[] = EXCLUDED_GENRE_IDS;

  return movies.filter(
    (movie) =>
      !movie.adult &&
      !(movie.genre_ids ?? []).some((id) => excludedGenres.includes(id)),
  );
}

/**
 * 上映中の映画を取得
 *
 * @param page - ページ番号
 * @returns 上映中の映画リスト（不適切コンテンツ除外済み）
 */
export async function getNowPlayingMovies(
  page: number = 1,
): Promise<TMDbResponse<Movie>> {
  const response = await tmdbClient.get<TMDbResponse<Movie>>(
    TMDB_ENDPOINTS.NOW_PLAYING,
    {
      params: { page: validatePage(page) },
    },
  );
  return {
    ...response.data,
    results: excludeInappropriateMovies(response.data.results),
  };
}

/**
 * 映画詳細を取得
 *
 * @param movieId - 映画ID
 * @returns 映画詳細
 */
export async function getMovieDetail(
  movieId: number | string,
): Promise<MovieDetail> {
  const response = await tmdbClient.get<MovieDetail>(
    TMDB_ENDPOINTS.MOVIE_DETAIL(movieId),
    {
      params: {
        append_to_response: TMDB_MOVIE_DETAIL_APPEND,
        include_video_language: TMDB_VIDEO_LANGUAGES,
      },
    },
  );
  return response.data;
}

/**
 * 「興味なし」の傾向学習に使う映画のメタ情報を取得する
 *
 * 監督・テーマ（キーワード）・公開年を1リクエストでまとめて取る。
 * `getMovieDetail` は配信情報や予告動画も取得するため、
 * 傾向学習には不要なレスポンスが大きい。
 *
 * キーワードはIDではなく名称を返す。利用先がAIプロンプトであり、
 * ID（例: 155477）のままではモデルが解釈できないため。
 *
 * @param movieId - 映画ID
 * @returns 傾向学習用のメタ情報。取得できなかった項目は空配列または null
 * @throws TMDbへの問い合わせに失敗した場合
 */
export async function getMovieDismissSignals(
  movieId: number | string,
): Promise<DismissSignals> {
  const response = await tmdbClient.get<
    MovieDetail & { keywords?: { keywords?: { id: number; name: string }[] } }
  >(TMDB_ENDPOINTS.MOVIE_DETAIL(movieId), {
    params: { append_to_response: 'credits,keywords' },
  });

  const { credits, keywords, release_date } = response.data;
  const director = credits?.crew?.find((member) => member.job === 'Director');
  const releaseYear = Number.parseInt((release_date ?? '').slice(0, 4), 10);

  return {
    keywords: (keywords?.keywords ?? []).map((k) => k.name),
    directorName: director?.name ?? null,
    releaseYear: Number.isNaN(releaseYear) ? null : releaseYear,
  };
}

/**
 * movie_cache の日次同期に使う指標だけを取得する
 *
 * `getMovieDetail` は `append_to_response` でクレジット・配信情報・予告動画を、
 * さらに `include_video_language` で英語と言語タグ無しの動画まで取る。
 * 同期が使うのはジャンル・評価・人気度だけなので、1作品あたり100件を超える
 * 動画配列（例: スーパーガール 124件）が丸ごと無駄になる。
 * movie_cache 全件を毎日なめる経路なので、ここは素の `/movie/{id}` で取る。
 *
 * @param movieId - 映画ID
 * @returns 同期に必要な指標。`genres` が無ければ空配列、`vote_count` が無ければ0
 * @throws TMDbへの問い合わせに失敗した場合
 */
/**
 * TMDbが「その作品は存在しない」と答えたエラーかを判定する
 *
 * TMDbは映画でないエントリ（ゲームのOP映像、記念映像など）を後から削除する。
 * 削除された作品は `/movie/{id}` が404を返し続けるため、キャッシュから
 * 取り除く必要がある。一時障害（429 / 503 / 504）と区別するために使う。
 *
 * axios に依存せずレスポンスの形だけを見る。`axios.isAxiosError` を使うと
 * 呼び出し側のテストで axios のモックに合わせる必要が出るため。
 *
 * @param error - 捕捉したエラー
 * @returns TMDbが404を返した場合true
 */
export function isTmdbNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { response?: { status?: number } }).response?.status ===
      HTTP_STATUS.NOT_FOUND
  );
}

export async function getMovieCacheStats(
  movieId: number | string,
): Promise<MovieCacheStats> {
  const response = await tmdbClient.get<MovieDetail>(
    TMDB_ENDPOINTS.MOVIE_DETAIL(movieId),
  );

  const {
    genres,
    vote_average,
    vote_count,
    popularity,
    original_language,
    title,
    overview,
    poster_path,
    backdrop_path,
  } = response.data;

  return {
    genreIds: (genres ?? []).map((genre) => genre.id),
    voteAverage: vote_average,
    voteCount: vote_count ?? 0,
    popularity,
    originalLanguage: original_language ?? null,
    title: title ?? null,
    overview: overview ?? null,
    posterPath: poster_path ?? null,
    backdropPath: backdrop_path ?? null,
  };
}

/**
 * 映画のキーワード一覧を取得
 *
 * @param movieId - 映画ID
 * @param options - リクエストオプション（中断シグナル）
 * @returns キーワードID配列
 */
export async function getMovieKeywordIds(
  movieId: number | string,
  options?: { signal?: AbortSignal },
): Promise<number[]> {
  const response = await tmdbClient.get<{
    id: number;
    keywords: { id: number; name: string }[];
  }>(TMDB_ENDPOINTS.MOVIE_KEYWORDS(movieId), { signal: options?.signal });
  return response.data.keywords.map((k) => k.id);
}

/**
 * 映画が除外キーワード（アダルト系）を含むかを判定する
 *
 * アダルト判定の実体は `EXCLUDED_KEYWORD_IDS` だが、TMDbの `without_keywords` は
 * `/discover/movie` でしかサポートされないため、`/search/movie` 経由で取得した
 * 映画はこの関数で1件ずつ判定する必要がある。
 * `excludeInappropriateMovies` が見ている `adult` フラグだけでは、
 * `adult=false` のままポルノ・ピンク映画キーワードを持つ作品を弾けない。
 *
 * 取得に失敗した場合は**例外をそのまま投げる**。呼び出し側はいずれも
 * try/catch で当該映画をスキップする実装になっており、判定できない映画を
 * 採用しない（fail-closed）。ここで握りつぶすと、同期処理側の
 * エラー記録（`result.errors`）が失われるため意図的に catch していない。
 *
 * @param movieId - 映画ID
 * @param options - リクエストオプション（中断シグナル）
 * @returns 除外対象なら true
 * @throws TMDbへの問い合わせに失敗した場合
 */
export async function hasExcludedKeyword(
  movieId: number | string,
  options?: { signal?: AbortSignal },
): Promise<boolean> {
  return containsExcludedKeyword(await getMovieKeywordIds(movieId, options));
}

/**
 * 取得済みのキーワードIDに除外対象（アダルト系）が含まれるかを判定する
 *
 * 同じキーワードを興行判定（`isFightEvent`）にも使う経路では、
 * `hasExcludedKeyword` を呼ぶとキーワード取得が二重になる。
 * 取得は呼び出し側で1回だけ行い、判定だけをこの関数に任せる。
 *
 * @param keywordIds - TMDbキーワードID
 * @returns 除外対象なら true
 */
export function containsExcludedKeyword(keywordIds: number[]): boolean {
  return keywordIds.some((id) =>
    (EXCLUDED_KEYWORD_IDS as readonly number[]).includes(id),
  );
}

/**
 * 映画を検索
 *
 * `include_adult=false` はtmdbClientの既定パラメータで常に送られる。
 * 検索エンドポイントはキーワード・ジャンル除外に非対応のため、
 * 結果側でも不適切コンテンツを除外する。
 *
 * @param params - 検索パラメータ
 * @param options - リクエストオプション（中断シグナル）
 * @returns 検索結果（不適切コンテンツ除外済み）
 */
export async function searchMovies(
  params: MovieSearchParams,
  options?: { signal?: AbortSignal },
): Promise<TMDbResponse<Movie>> {
  const { query, page = 1, year, genre } = params;

  const response = await tmdbClient.get<TMDbResponse<Movie>>(
    TMDB_ENDPOINTS.SEARCH,
    {
      params: {
        query,
        page: validatePage(page),
        year,
        with_genres: genre,
      },
      signal: options?.signal,
    },
  );
  return {
    ...response.data,
    results: excludeInappropriateMovies(response.data.results),
  };
}

/**
 * Discoverパラメータ型
 */
export interface DiscoverMoviesParams {
  /** ページ番号 */
  page?: number;
  /** 地域別公開日範囲（開始） */
  'release_date.gte'?: string;
  /** 地域別公開日範囲（終了） */
  'release_date.lte'?: string;
  /** リリースタイプ（例: '2|3' で劇場公開のみ） */
  with_release_type?: string;
  /** ソート順 */
  sort_by?: string;
  /** 除外するキーワードID（パイプ区切り） */
  without_keywords?: string;
  /** 除外するジャンルID（パイプ区切り） */
  without_genres?: string;
  /** ジャンルIDフィルター（カンマ区切り） */
  with_genres?: string;
  /** 公開年フィルター */
  primary_release_year?: number;
  /** 最低評価フィルター */
  'vote_average.gte'?: number;
}

/**
 * 映画をDiscoverで取得（公開日範囲指定対応）
 *
 * 除外キーワード・除外ジャンルは既定で付与されるため、呼び出し側で
 * 毎回指定する必要はない（明示的に渡した場合はそちらが優先される）。
 *
 * @param params - Discoverパラメータ
 * @returns 映画リスト（不適切コンテンツ除外済み）
 */
export async function discoverMovies(
  params: DiscoverMoviesParams = {},
): Promise<TMDbResponse<Movie>> {
  const { page = 1, ...rest } = params;
  const response = await tmdbClient.get<TMDbResponse<Movie>>(
    TMDB_ENDPOINTS.DISCOVER,
    {
      params: {
        page: validatePage(page),
        without_keywords: EXCLUDED_KEYWORDS_PARAM,
        without_genres: EXCLUDED_GENRES_PARAM,
        ...rest,
      },
    },
  );
  return {
    ...response.data,
    results: excludeInappropriateMovies(response.data.results),
  };
}

/**
 * ジャンル一覧を取得
 *
 * @returns ジャンル一覧
 */
export async function getGenres() {
  const response = await tmdbClient.get(TMDB_ENDPOINTS.GENRES);
  return response.data.genres;
}

/**
 * 映画のリリース日情報を取得（国別リリースタイプ判定用）
 *
 * @param movieId - 映画ID
 * @returns 国別リリース日情報
 */
export async function getMovieReleaseDates(
  movieId: number,
): Promise<TMDbReleaseDateCountry[]> {
  const response = await tmdbClient.get<{
    id: number;
    results: TMDbReleaseDateCountry[];
  }>(TMDB_ENDPOINTS.MOVIE_RELEASE_DATES(movieId));
  return response.data.results;
}

/**
 * 日本の劇場公開日一覧を取得する（昇順）
 *
 * リリースタイプのうち劇場公開にあたる 2（限定公開）/ 3（劇場公開）だけを拾う。
 * `/movie/{id}` の `release_date` は region 指定でも**プレミア（type 1）**が
 * 代表日になることがあり、「過去に劇場公開されたか」の判定には使えない。
 *
 * @param movieId - 映画ID
 * @returns YYYY-MM-DD の配列（昇順）。日本のリリース情報が無ければ空配列
 */
export async function getJpTheatricalReleaseDates(
  movieId: number,
): Promise<string[]> {
  const countries = await getMovieReleaseDates(movieId);
  const japan = countries.find(
    (country) => country.iso_3166_1 === TMDB_JP_COUNTRY_CODE,
  );

  return (japan?.release_dates ?? [])
    .filter((release) =>
      (TMDB_THEATRICAL_RELEASE_TYPES as readonly number[]).includes(
        release.type,
      ),
    )
    .map((release) => release.release_date.slice(0, 10))
    .sort();
}

/**
 * 日本での配信実態
 */
export interface JpStreamingAvailability {
  /** 日本で現在配信中か（flatrate / rent / buy のいずれかにプロバイダーが存在） */
  isCurrentlyStreaming: boolean;
  /** 日本のデジタル公開日（YYYY-MM-DD）。情報が無ければ null */
  digitalReleaseDate: string | null;
  /** TMDbキーワードID。プロレス興行の判定に使う */
  keywordIds: number[];
  /** 提供形態ごとのプロバイダーID（代表IDへ正規化済み） */
  watchProviderIds: Record<WatchProviderOfferType, number[]>;
}

/**
 * 日本での配信実態を取得する
 *
 * Discover の `with_release_type=4` は「どこかの国でデジタル公開された」しか
 * 意味しない。日本の Netflix / Prime Video / U-NEXT 等で実際に観られるかは
 * `watch/providers` の `results.JP` を見ないと判定できない。
 *
 * デジタル公開日も同様に `movie.release_date` からは取れない。TMDb は作品に対し
 * 実質1つの代表日しか持たず、劇場公開日が入っていることが多いため、
 * `release_dates` の JP / type=4 から別途取得する。
 *
 * キーワードはプロレス興行の判定に使う。ジャンルでは劇映画と区別が付かず
 * 候補を絞れないため全件分が必要になるが、ここに相乗りすれば追加リクエストは
 * 発生しない。
 *
 * これらの情報は append_to_response で1リクエストにまとめて取得する。
 *
 * 取得に失敗した場合は**例外をそのまま投げる**。呼び出し側が「判定できなかった」
 * ことを認識できないと、TMDbの一時障害で配信中の作品を一斉に配信終了扱いに
 * してしまうため、ここで false にフォールバックしない。
 *
 * @param movieId - 映画ID
 * @returns 日本での配信実態
 * @throws TMDbへの問い合わせに失敗した場合
 */
export async function getJpStreamingAvailability(
  movieId: number,
): Promise<JpStreamingAvailability> {
  const response = await tmdbClient.get<{
    'watch/providers'?: WatchProviders;
    release_dates?: { results: TMDbReleaseDateCountry[] };
    keywords?: { keywords?: { id: number; name: string }[] };
  }>(TMDB_ENDPOINTS.MOVIE_DETAIL(movieId), {
    params: { append_to_response: TMDB_STREAMING_AVAILABILITY_APPEND },
  });

  const jpProviders =
    response.data['watch/providers']?.results?.[TMDB_JP_COUNTRY_CODE];

  const isCurrentlyStreaming = [
    jpProviders?.flatrate,
    jpProviders?.rent,
    jpProviders?.buy,
  ].some((providers) => (providers?.length ?? 0) > 0);

  const jpReleases = (response.data.release_dates?.results ?? []).find(
    (country) => country.iso_3166_1 === TMDB_JP_COUNTRY_CODE,
  );

  // 同じ type=4 が複数登録されていることがあるため、最も早い日付を採用する
  const [digitalReleaseDate] = (jpReleases?.release_dates ?? [])
    .filter((release) => release.type === TMDB_DIGITAL_RELEASE_TYPE)
    .map((release) => release.release_date.slice(0, 10))
    .sort();

  // 広告つきプランや Amazon Channel 経由は別IDで返るため代表IDへ束ねる
  const watchProviderIds = Object.fromEntries(
    WATCH_PROVIDER_OFFER_TYPES.map((offerType) => [
      offerType,
      normalizeWatchProviderIds(
        (jpProviders?.[offerType] ?? []).map(
          (provider) => provider.provider_id,
        ),
      ),
    ]),
  ) as Record<WatchProviderOfferType, number[]>;

  return {
    isCurrentlyStreaming,
    digitalReleaseDate: digitalReleaseDate ?? null,
    keywordIds: (response.data.keywords?.keywords ?? []).map(
      (keyword) => keyword.id,
    ),
    watchProviderIds,
  };
}

/**
 * TMDb `/person/{id}` の生レスポンス（本アプリが参照する範囲）
 */
interface TMDbPersonResponse {
  id: number;
  name: string;
  biography: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string | null;
  adult: boolean;
  movie_credits?: {
    cast?: (Omit<PersonMovieCredit, 'release_date' | 'character'> & {
      release_date?: string | null;
      character?: string | null;
    })[];
  };
  translations?: {
    translations?: {
      iso_639_1: string;
      data?: { biography?: string | null };
    }[];
  };
}

/**
 * 演技ではないクレジットかを判定する
 *
 * TMDb の `movie_credits.cast` は演技クレジットと本人出演を区別しない。
 * メイキング映像・ドキュメンタリーへの本人出演・アーカイブ映像の使用が
 * すべて「出演作」として並び、クリスチャン・ベールでは78件中23件、
 * レオナルド・ディカプリオでは91件中47件を占めていた。
 *
 * 1. 役名が本人役を示すもの（`Self` / `Himself` / `archive footage` 等）
 * 2. ドキュメンタリーで役名が空のもの
 *
 * 2 を「役名が空」だけで判定しないのは、邦画・邦ドラマが TMDb に役名を
 * 登録していないことが多いため。役所広司の役名なし14件（『樅ノ木は残った』
 * 『闇の歯車』等）はすべて実在の出演作で、ジャンルと組み合わせないと巻き込む。
 *
 * 逆にドキュメンタリーでも役名があれば演技側に残す。
 * 『坂本龍一 芸術は長く、人生は短し』の `Narrator` のように、
 * 本人が仕事として関わっているため。
 *
 * @param credit - 整形済みの出演クレジット
 * @returns 演技ではないクレジットなら true
 */
function isNonActingCredit(credit: PersonMovieCredit): boolean {
  const character = (credit.character ?? '').trim();

  if (PERSON_NON_ACTING_CHARACTER_PATTERN.test(character)) {
    return true;
  }

  const isDocumentary = (credit.genre_ids ?? []).includes(DOCUMENTARY_GENRE_ID);
  return isDocumentary && character === '';
}

/**
 * 出演作の重複をまとめる
 *
 * 同じ映画で複数役を演じている場合、TMDb は同じ `id` の credit を役の数だけ返す。
 * そのまま並べると一覧に同じ作品が何度も出るため、1件に畳んで役名を連結する。
 */
function mergeDuplicatedCredits(
  credits: PersonMovieCredit[],
): PersonMovieCredit[] {
  const merged = new Map<number, PersonMovieCredit>();

  for (const credit of credits) {
    const existing = merged.get(credit.id);

    if (!existing) {
      merged.set(credit.id, credit);
      continue;
    }

    const characters = [existing.character, credit.character].filter(Boolean);
    existing.character = [...new Set(characters)].join(' / ');
  }

  return [...merged.values()];
}

/**
 * 出演作を公開日の新しい順に並べる（日付が無いものは末尾）
 *
 * 未公開・公開日未登録の作品を先頭に出すと、代表作より先に情報の無い作品が
 * 並んでしまうため末尾へ寄せる。
 *
 * メイキング・本人出演（`isNonActingCredit`）はさらに後ろへ回す。消さずに
 * 末尾へ送るのは、長編ドキュメンタリーへの本人出演と特典映像のメイキングを
 * 機械的に区別できないため。尺で分けようとすると153分のメイキング
 * （`Keepers of the Covenant: Making 'Exodus: Gods and Kings'`）と44分の
 * 正当なドキュメンタリー（`IMAX Hubble`）が逆転し、ジャンルは双方とも
 * ドキュメンタリー、評価数は邦画が沈む。判断がつかないものを捨てるより、
 * 一覧の先頭を演技クレジットで埋めて後ろに置く。
 */
function sortCreditsByReleaseDateDesc(
  credits: PersonMovieCredit[],
): PersonMovieCredit[] {
  return [...credits].sort((a, b) => {
    const aNonActing = isNonActingCredit(a);
    const bNonActing = isNonActingCredit(b);
    if (aNonActing !== bNonActing) return aNonActing ? 1 : -1;

    if (!a.release_date && !b.release_date) return 0;
    if (!a.release_date) return 1;
    if (!b.release_date) return -1;
    return b.release_date.localeCompare(a.release_date);
  });
}

/**
 * 略歴を解決する
 *
 * `language=ja-JP` では未翻訳で空文字になる人物が大半のため、
 * 空なら `translations` の英語原文で補う。
 *
 * @returns 略歴と、英語原文へフォールバックしたかどうか
 */
function resolveBiography(person: TMDbPersonResponse): {
  biography: string;
  isFallback: boolean;
} {
  const biography = (person.biography ?? '').trim();
  if (biography) return { biography, isFallback: false };

  const fallback = (person.translations?.translations ?? []).find(
    (translation) =>
      translation.iso_639_1 === TMDB_FALLBACK_LANGUAGE &&
      (translation.data?.biography ?? '').trim(),
  );

  const fallbackBiography = (fallback?.data?.biography ?? '').trim();

  return {
    biography: fallbackBiography,
    isFallback: fallbackBiography.length > 0,
  };
}

/**
 * 人物詳細を取得する
 *
 * プロフィールと出演作を `append_to_response` で1リクエストにまとめて取得し、
 * アプリで表示できる形まで整形して返す。
 *
 * ⚠️ `include_adult=false` は tmdbClient の既定パラメータで常に送られるが、
 * TMDb がこれを解釈するのは `/search` と `/discover` だけで、`/person/{id}` と
 * その `movie_credits` には**効かない**。そのため出演作は取得後に
 * `excludeInappropriateMovies` で弾く。人物自身の `adult` は呼び出し側が
 * 404 に変換する（ここで例外にすると TMDb 障害と区別できなくなるため）。
 *
 * `isQualityMovie` は適用しない。あれはDBへ保存してよいかの基準（人気度・
 * 言語の足切り）であり、フィルモグラフィに当てると旧作や非英語作品が
 * 大量に落ちて一覧として成立しないため。
 *
 * @param personId - 人物ID
 * @returns 整形済みの人物詳細
 * @throws TMDbへの問い合わせに失敗した場合
 */
export async function getPersonDetail(
  personId: number | string,
): Promise<PersonDetail> {
  const response = await tmdbClient.get<TMDbPersonResponse>(
    TMDB_ENDPOINTS.PERSON_DETAIL(personId),
    { params: { append_to_response: TMDB_PERSON_DETAIL_APPEND } },
  );
  const person = response.data;

  const rawCast: PersonMovieCredit[] = (person.movie_credits?.cast ?? []).map(
    (credit) => ({
      ...credit,
      release_date: credit.release_date?.trim() ? credit.release_date : null,
      character: credit.character ?? '',
    }),
  );

  const cast = sortCreditsByReleaseDateDesc(
    mergeDuplicatedCredits(excludeInappropriateMovies(rawCast)),
  );

  const { biography, isFallback } = resolveBiography(person);

  return {
    id: person.id,
    name: person.name,
    biography,
    is_biography_fallback: isFallback,
    birthday: person.birthday || null,
    deathday: person.deathday || null,
    place_of_birth: person.place_of_birth || null,
    profile_path: person.profile_path,
    known_for_department: person.known_for_department ?? '',
    adult: person.adult,
    cast,
  };
}
