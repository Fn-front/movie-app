/**
 * 映画一覧API
 * GET /api/movies?time_frame=upcoming&page=1&sort_by=release_date&release_type=theatrical&genre_ids=28,12
 * GET /api/movies?time_frame=now_showing&page=1&sort_by=release_date&release_type=theatrical
 */

import { NextResponse } from 'next/server';

import { getAuthSession } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import {
  applyMovieCacheFilters,
  type MovieCacheFilters,
} from '@/helpers/movieCacheFilters';
import { moviesQuerySchema, type MoviesQueryParams } from '@/schema/movies';
import {
  HTTP_STATUS,
  CACHE_CONTROL,
  PAGINATION,
  NOW_SHOWING_MONTHS_BACK,
  RELEASE_TYPE,
  MOVIES_ERROR_MESSAGES,
  ERROR_CODE,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  SUPABASE_ERROR_CODE,
} from '@/constants';
import { enforcePublicRateLimit } from '@/helpers/publicRateLimit';
import { toDisplayGenres } from '@/lib/movies/genreFilter';
import { getExcludedLanguages } from '@/lib/movies/regionFilter';
import { getGenres } from '@/lib/tmdb/tmdb';
import { syncNowPlayingMovies } from '@/lib/sync/syncNowPlayingMovies';
import { syncStreamingMovies } from '@/lib/sync/syncStreamingMovies';
import { syncUpcomingMovies } from '@/lib/sync/syncUpcomingMovies';
import { formatDateToString } from '@/utils/date';

/**
 * ソートカラムのマッピング
 *
 * Zodのsort_by enumをキーに取るため、enumへの値追加時は
 * このマップの未定義キーがコンパイルエラーになる
 */
const SORT_COLUMN_MAP: Record<MoviesQueryParams['sort_by'], string> = {
  release_date: 'release_date',
  popularity: 'popularity',
  vote_average: 'vote_average',
};

/**
 * ジャンルID → 表示名のマップを作る
 *
 * キャッシュは `getGenres()` 側が持つ（#1278）。ここに置いていたときは
 * `/api/movies/genres` に効かなかった。
 *
 * ⚠️ 移しても**2つのルート間でキャッシュが共有されるわけではない**
 * （Vercel ではルートごとに関数が分かれ、モジュールの実体も別）。
 * 効くのは各ルートの中での重複と、同時リクエストの合流まで
 */
async function getGenreMap(): Promise<Record<number, string>> {
  const genreMap: Record<number, string> = {};

  // 保存前フィルタで弾いているジャンルは、選んでも必ず0件になるため出さない
  for (const genre of toDisplayGenres(await getGenres())) {
    genreMap[genre.id] = genre.name;
  }

  return genreMap;
}

export async function GET(request: Request) {
  try {
    // Supabaseクライアント検証
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // 認証判定を前倒しする。
    // 識別子にユーザーIDを使うため（NAT で同一IPを共有する利用者を
    // まとめて巻き込まないため）、レート制限より先に必要になる。
    // 下部のお気に入り付与でも同じ session を使い回す
    const session = await getAuthSession();

    // 未認証で叩ける＝サーバーの TMDB_API_KEY を使った無認証プロキシになるうえ、
    // キャッシュ失効時は TMDb の同期処理（1回で200リクエスト規模）まで誘発できる。
    //
    // 検証より前に置く。識別子はセッションか送信元IPで、どちらもこの時点で
    // 確定している。検証を先にすると、不正なクエリを混ぜるだけでカウンタを
    // 消費せずに叩き続けられる。兄弟の `movies/search` と順序を揃える
    // （`.claude/rules/api-route.md`）
    const limited = await enforcePublicRateLimit({
      request,
      action: RATE_LIMIT_ACTION.READ_MOVIES,
      limit: RATE_LIMIT_CONFIG.READ_MOVIES,
      userId: session?.user?.id,
      supabase,
    });
    if (limited) return limited;

    // クエリパラメータのバリデーション
    const { searchParams } = new URL(request.url);
    const queryResult = moviesQuerySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      sort_by: searchParams.get('sort_by') ?? undefined,
      sort_order: searchParams.get('sort_order') ?? undefined,
      release_type: searchParams.get('release_type') ?? undefined,
      time_frame: searchParams.get('time_frame') ?? undefined,
      genre_ids: searchParams.get('genre_ids') ?? undefined,
      release_date_gte: searchParams.get('release_date_gte') ?? undefined,
      release_date_lte: searchParams.get('release_date_lte') ?? undefined,
      is_revival: searchParams.get('is_revival') ?? undefined,
      watch_providers: searchParams.get('watch_providers') ?? undefined,
      offer_types: searchParams.get('offer_types') ?? undefined,
      include_regions: searchParams.get('include_regions') ?? undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: MOVIES_ERROR_MESSAGES.INVALID_QUERY,
            details: queryResult.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const {
      page,
      sort_by,
      sort_order,
      release_type,
      time_frame,
      genre_ids,
      release_date_gte,
      release_date_lte,
      is_revival,
      watch_providers,
      offer_types,
      include_regions,
    } = queryResult.data;

    // ジャンルマップを取得
    const genreMap = await getGenreMap();

    const isNowPlayingTheatrical =
      time_frame === 'now_showing' && release_type === 'theatrical';
    const isStreaming = release_type === RELEASE_TYPE.STREAMING;
    // 配信予定タブ: まだ配信されておらず、JPのデジタル公開日が未来の作品
    const isUpcomingStreaming = isStreaming && time_frame === 'upcoming';

    // ⚠️ **件数クエリの `error` を捨てないこと（#1164 / #1000）。**
    //
    //   Supabase はエラー時に `count` を `null` で返す。受け取らずに
    //   `!count` で判定すると**DB障害がフォールバックの発火条件に化け**、
    //   アクセスのたびにリクエスト処理の中でフル同期が走る。
    //   `read_api_movies` は 300回/10分なので、10分で最大300回の同期を
    //   誘発できる。この分岐が無くそうとしている「数十秒待たせる」経路が、
    //   キャッシュ失効ではなくDB障害を引き金に復活する。
    //
    //   障害中はこの後のクエリも失敗するので、ここで止めたほうが分かりやすい。
    if (isNowPlayingTheatrical) {
      // now_showing + theatrical: CRON（/api/cron/sync-now-playing、日次）で
      // 事前同期する。キャッシュが単に古いだけのケースで同期を直列実行すると、
      // 失効直後のユーザーが数十秒待たされるため同期は行わない（#983）。
      // CRONが一度も走っていない場合に一覧が空になるのを避けるため、
      // レコードが1件も無いときだけフォールバックとして同期する。
      const { count: nowPlayingCount, error: nowPlayingCountError } =
        await supabase
          .from('movie_cache')
          .select('id', { count: 'exact', head: true })
          .eq('is_now_playing', true)
          .eq('release_type', RELEASE_TYPE.THEATRICAL);

      if (nowPlayingCountError) throw nowPlayingCountError;

      if (!nowPlayingCount) {
        await syncNowPlayingMovies();
      }
    } else if (release_type === RELEASE_TYPE.STREAMING) {
      // streaming: CRON（/api/cron/sync-streaming）で事前同期する。
      // キャッシュが単に古いだけのケースでDiscoverを直列実行すると、
      // 失効直後のユーザーが数十秒待たされるため同期は行わない。
      // CRONが一度も走っていない場合に一覧が空になるのを避けるため、
      // レコードが1件も無いときだけフォールバックとして同期する。
      const { count: streamingCount, error: streamingCountError } =
        await supabase
          .from('movie_cache')
          .select('id', { count: 'exact', head: true })
          .eq('release_type', RELEASE_TYPE.STREAMING);

      if (streamingCountError) throw streamingCountError;

      if (!streamingCount) {
        await syncStreamingMovies();
      }
    } else {
      // theatrical + upcoming: CRON（/api/cron/sync-upcoming、日次）で
      // 事前同期する。キャッシュが単に古いだけのケースでDiscoverを直列実行
      // すると、失効直後のユーザーが数十秒待たされるため同期は行わない（#1000）。
      // CRONが一度も走っていない場合に一覧が空になるのを避けるため、
      // レコードが1件も無いときだけフォールバックとして同期する。
      //
      // ⚠️ **母数は公開予定タブが実際に出す集合に合わせる。**
      //
      //   `release_type='theatrical'` だけで数えると公開中・公開済みの行まで
      //   入る（本番の実測で 1,105件 対 公開予定 134件）。表示が0件になっても
      //   母数が三桁残るので、**フォールバックが実質発火しない**。
      //   CRON が静かに止まった場合、`MOVIES_FETCH_MONTHS_AHEAD` ぶんを
      //   消化した約3ヶ月後にタブが空になり、それでも同期は走らない。
      //
      //   兄弟の2分岐も母数とタブのスコープが一致している
      //   （now_showing は `is_now_playing`、streaming は `release_type`）。
      const { count: upcomingCount, error: upcomingCountError } = await supabase
        .from('movie_cache')
        .select('id', { count: 'exact', head: true })
        .eq('release_type', RELEASE_TYPE.THEATRICAL)
        .gte('release_date', formatDateToString(new Date()));

      if (upcomingCountError) throw upcomingCountError;

      if (!upcomingCount) {
        await syncUpcomingMovies();
      }
    }

    // DBからソート順で映画を取得
    //
    // 配信予定タブの「公開日順」はデジタル公開日で並べる。絞り込みを
    // digital_release_date で行っているのに release_date で並べると、
    // 劇場公開日順という利用者の意図しない並びになるため
    const sortColumn =
      isUpcomingStreaming && sort_by === 'release_date'
        ? 'digital_release_date'
        : SORT_COLUMN_MAP[sort_by];
    // sort_order指定時はそれに従う。未指定時はrelease_dateのみ昇順
    const ascending = sort_order
      ? sort_order === 'asc'
      : sort_by === 'release_date';
    const offset = (page - 1) * PAGINATION.ITEMS_PER_PAGE;

    // genre_ids はZodのtransformで数値配列に変換済み
    const genreIdArray = genre_ids ?? [];

    // time_frameに応じたDBクエリの日付範囲を決定
    const today = formatDateToString(new Date());

    let dateGte: string | undefined;
    let dateLte: string | undefined;

    if (isNowPlayingTheatrical) {
      // now_showing + theatrical: is_now_playing フラグでフィルタするため
      // 既定の日付範囲は設けない。ユーザー指定があれば追加フィルタとして適用
      dateGte = release_date_gte;
      dateLte = release_date_lte;
    } else if (time_frame === 'now_showing') {
      // streaming の now_showing
      const pastDate = new Date();
      pastDate.setMonth(pastDate.getMonth() - NOW_SHOWING_MONTHS_BACK);
      const defaultGte = formatDateToString(pastDate);
      dateGte =
        release_date_gte && release_date_gte > defaultGte
          ? release_date_gte
          : defaultGte;
      dateLte = release_date_lte || today;
    } else if (isUpcomingStreaming) {
      // 配信予定は digital_release_date で絞る。TMDb の release_date は
      // 代表日（多くは劇場公開日）であり、「劇場公開済み・配信はこれから」の
      // 作品を release_date >= today で弾いてしまうため既定の範囲は設けない。
      // ユーザー指定があれば追加フィルタとして適用する
      dateGte = release_date_gte;
      dateLte = release_date_lte;
    } else {
      dateGte =
        release_date_gte && release_date_gte > today ? release_date_gte : today;
      dateLte = release_date_lte;
    }

    // フィルタ条件は1箇所で組み立てる。#1272 で件数とデータを1クエリに
    // まとめたので適用先は1本だが、範囲外アクセス時の件数の取り直しにも
    // 同じ条件が要る（ずれると totalItems だけが別の母数になる）
    // 配信タブは「日本で実際に配信されているか」で振り分ける。
    // Discover の with_release_type=4 はどこかの国でのデジタル公開しか
    // 意味せず、JP未配信作品や配信終了作品が混ざるため
    const filters: MovieCacheFilters = {
      releaseType: release_type,
      isNowPlayingTheatrical,
      isCurrentlyStreaming: isStreaming ? !isUpcomingStreaming : undefined,
      digitalReleaseDateGt: isUpcomingStreaming ? today : undefined,
      dateGte,
      dateLte,
      isRevival: is_revival,
      genreIds: genreIdArray,
      // 配信サービスは streaming タブでしか意味を持たない。theatrical で
      // 指定されても無視し、意図しない0件表示を防ぐ
      watchProviderIds: isStreaming ? (watch_providers ?? []) : [],
      watchProviderOfferTypes: offer_types ?? [],
      // 未指定なら3グループすべてを除外する（既定で非表示）。
      // UIの初期値ではなくここで担保することで、URL直叩き・初回の
      // サーバーレンダリング・保存済みフィルタの有無によらず揃う
      excludedLanguages: getExcludedLanguages(include_regions),
    };

    // 件数とデータを1クエリで取る（#1272）
    //
    // もとは `count: 'exact', head: true` の件数専用クエリとデータクエリを
    // 別々に、しかも直列に投げていた。`count: 'exact'` は条件に一致する行を
    // 全件数えるので、**同じ走査を1リクエストで2回**していたことになる。
    // PostgREST は `Content-Range` で件数も返せる（`watchlist/watched` が前例）。
    //
    // 条件を揃えるための `applyMovieCacheFilters` も1回で済む。
    // 2本に分けていたころは、片方にだけ条件を足すと総件数と実データが
    // 食い違ってページング判定が壊れる形だった。
    //
    // ⚠️ `head: true` を**付けない**こと。付けると本体が返らず `data` が空になる
    const {
      data: movies,
      count: totalItems,
      error: fetchError,
    } = await applyMovieCacheFilters(
      supabase
        .from('movie_cache')
        .select(
          'id, title, poster_path, backdrop_path, release_date, digital_release_date, overview, vote_average, vote_count, popularity, genre_ids, release_type, is_now_playing, is_revival',
          { count: 'exact' },
        )
        .order(sortColumn, { ascending, nullsFirst: false })
        .order('id', { ascending: true })
        .range(offset, offset + PAGINATION.ITEMS_PER_PAGE - 1),
      filters,
    );

    // ⚠️ 最終ページより後ろは「空ページ」であってエラーではない（#1311）。
    //
    // PostgREST は `count: 'exact'` を付けたクエリに限り、
    // `offset > 総件数` で **416 (PGRST103)** を返す（count 無しなら 200 +
    // 空配列）。件数とデータを1本にまとめた副作用でこの条件に当たるように
    // なったため、ここで潰さないと `?page=500` が 200 から 500 へ変わる。
    //
    // 416 のレスポンスにも総件数は載っている（`Content-Range: */1104`）が、
    // postgrest-js は `res.ok` のときしか読まないので取り直すしかない。
    // 範囲外アクセスは稀なので、そのときだけ件数クエリを足す
    let total: number;

    if (
      fetchError &&
      fetchError.code === SUPABASE_ERROR_CODE.RANGE_NOT_SATISFIABLE
    ) {
      const { count: outOfRangeTotal, error: countError } =
        await applyMovieCacheFilters(
          supabase
            .from('movie_cache')
            .select('id', { count: 'exact', head: true }),
          filters,
        );

      if (countError) {
        throw countError;
      }

      total = outOfRangeTotal ?? 0;
    } else if (fetchError) {
      // もとは件数クエリのエラーを見ていなかった（`count` だけ取り出していた）。
      // 1本になったことで、どちらの失敗もここで拾える
      throw fetchError;
    } else {
      total = totalItems ?? 0;
    }

    const totalPages = Math.ceil(total / PAGINATION.ITEMS_PER_PAGE);

    const hasNextPage = page < totalPages;

    // 認証済みの場合、お気に入り情報を付与（session は上部で取得済み）
    let moviesWithFavorites = movies ?? [];

    if (session && moviesWithFavorites.length > 0) {
      const movieIds = moviesWithFavorites.map((m) => m.id);

      const { data: favorites, error: favoritesError } = await supabase
        .from('favorites')
        .select('id, tmdb_movie_id, rating')
        .eq('user_id', session.user.id)
        .in('tmdb_movie_id', movieIds)
        .is('deleted_at', null);

      // ⚠️ 握り潰すと、下の else 側で**一覧の全作品**に `favorite: null`
      // （＝確定した「未登録」）が書かれる。空のハートが並び、押すと既存行と
      // 衝突して 409 になる。0件なら `data: []` が返るので、ここに来る error は
      // 本物の読み取り失敗だけ。`movies/[id]` と同じ方針（#1164）
      if (favoritesError) {
        throw favoritesError;
      }

      if (favorites && favorites.length > 0) {
        const favoriteMap = new Map(
          favorites.map((f) => [
            f.tmdb_movie_id,
            { id: f.id, rating: f.rating },
          ]),
        );

        moviesWithFavorites = moviesWithFavorites.map((movie) => ({
          ...movie,
          favorite: favoriteMap.get(movie.id) ?? null,
        })) as typeof moviesWithFavorites;
      } else {
        moviesWithFavorites = moviesWithFavorites.map((movie) => ({
          ...movie,
          favorite: null,
        })) as typeof moviesWithFavorites;
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          movies: moviesWithFavorites,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: PAGINATION.ITEMS_PER_PAGE,
            hasNextPage,
            nextPage: hasNextPage ? page + 1 : null,
          },
          genres: genreMap,
        },
      },
      {
        status: HTTP_STATUS.OK,
        headers: {
          'Cache-Control': session
            ? CACHE_CONTROL.PRIVATE_NO_STORE
            : CACHE_CONTROL.PUBLIC_1H_SWR_24H,
        },
      },
    );
  } catch (error) {
    console.error('Movies fetch error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: MOVIES_ERROR_MESSAGES.FETCH_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
