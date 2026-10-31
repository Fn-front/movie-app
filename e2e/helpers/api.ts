/**
 * E2Eテスト用APIヘルパー
 * テストデータのクリーンアップに使用
 * ウォッチリストはSupabase REST APIで物理削除、フィルターはアプリAPIでリセット
 */

import { createHmac } from 'crypto';

import type { APIRequestContext } from '@playwright/test';

import { cleanupRateLimitsForUser } from './dedicatedUser';
import {
  RUN_CLIENT_IP,
  RUN_EMAIL_LIKE_PATTERN,
  runScopedMovieId,
  runScopedMovieIdRange,
} from './runScope';
import { TEST_USER } from './testUser';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

let cachedTestUserId: string | null = null;

/**
 * テストユーザーのIDをusersテーブルから取得（キャッシュあり）
 */
async function getTestUserId(): Promise<string | null> {
  if (cachedTestUserId) return cachedTestUserId;

  const encodedEmail = encodeURIComponent(TEST_USER.email);
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/users?email=eq.${encodedEmail}&select=id`,
    { headers: supabaseHeaders },
  );
  const data = await res.json();
  cachedTestUserId = data[0]?.id ?? null;
  return cachedTestUserId;
}

/**
 * 共有テストユーザーの rate_limits レコードを物理削除する。
 *
 * 背景: WRITE_FAVORITES / WRITE_WATCHLIST 等の DB-based レート制限は
 * user_id を identifier として制限する。E2E は短時間に多くのリクエストを
 * 発行するため、テスト毎にリセットしないと後続テストが 429 で失敗する。
 * 認証済みの読み取り系（READ_USER_DATA 等）も user_id 単位で積み上がる。
 *
 * 専用ユーザーを使う spec は {@link cleanupRateLimitsForUser} を使う。
 */
async function cleanupRateLimits(): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) return;

  await cleanupRateLimitsForUser(userId);
}

/**
 * この run が使う rate_limits レコードを物理削除する（セットアップ／後片付け用）。
 *
 * 以前は全件削除していた。共有DBに複数の run が同時に流れる構成では
 * 他 run の実行中のカウンタまで巻き込むため、識別子を run 単位に絞る（#793）。
 *
 * 消す対象は2種類。
 * - 送信元IP単位（AWARDS_FETCH / LOGIN_IP 等）: {@link RUN_CLIENT_IP}
 * - メール単位（OTP送信・検証、ログイン、登録）: この run のメールは
 *   すべて `-<E2E_RUN_ID>@example.com` で終わる。identifier はメール単独か
 *   `メール|送信元IP` のためワイルドカードで消す
 *
 * ユーザーID単位のカウンタはユーザー作成後にしかIDが分からないため、
 * {@link cleanupRateLimitsForUser} が担当する。
 */
export async function cleanupRunRateLimits(): Promise<void> {
  const deleteBy = (filter: string) =>
    fetch(`${SUPABASE_URL}/rest/v1/rate_limits?${filter}`, {
      method: 'DELETE',
      headers: supabaseHeaders,
    });

  await Promise.all([
    deleteBy(`identifier=eq.${encodeURIComponent(RUN_CLIENT_IP)}`),
    deleteBy(
      `identifier=like.${encodeURIComponent(`${RUN_EMAIL_LIKE_PATTERN}*`)}`,
    ),
  ]);
}

/**
 * 指定ユーザーのウォッチリストを物理削除する（rate_limitsも同時にリセット）
 *
 * ⚠️ そのユーザーの**全件**を消す。共有テストユーザーに対して複数の spec が
 * これを呼ぶと、`fullyParallel` で別ワーカーに分散したときに互いのレコードを
 * 消し合う（#806）。ウォッチリストを書き換える spec は専用ユーザーを使うこと
 * （`e2e/fixtures/dedicatedSession.ts` の `openDedicatedSession`）。
 *
 * @param userId - 対象ユーザーのID
 */
export async function cleanupWatchlistForUser(userId: string): Promise<void> {
  await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/watchlist?user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: supabaseHeaders,
    }),
    cleanupRateLimitsForUser(userId),
  ]);
}

/**
 * テストユーザーのお気に入りを物理削除する（rate_limitsも同時にリセット）
 */
export async function cleanupFavorites(): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) return;

  await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/favorites?user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: supabaseHeaders,
    }),
    cleanupRateLimits(),
  ]);
}

/**
 * 指定ユーザーに お気に入り1件＋おすすめ をシードする。
 *
 * おすすめセクションは お気に入り0件だと登録促進テキストに切り替わるため、
 * タイルを出すには両方が要る。おすすめは SSR 表示のため、ページ遷移前に投入する。
 *
 * @param userId - 対象ユーザーのID
 * @param count - 投入するおすすめの件数
 */
export async function seedRecommendationsForUser(
  userId: string,
  count = 2,
): Promise<void> {
  const post = (path: string, body: unknown) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify(body),
    });

  // hasFavorites=true にする
  await post('favorites', {
    user_id: userId,
    tmdb_movie_id: 999001,
    title: 'E2Eお気に入り',
    rating: 8,
  });
  await post(
    'recommendations',
    Array.from({ length: count }, (_, i) => ({
      user_id: userId,
      tmdb_movie_id: 999101 + i,
      title: `E2Eおすすめ${i + 1}`,
      reason: `E2E用の理由${i + 1}`,
      display_order: i + 1,
    })),
  );
}

/**
 * 共有テストユーザーに お気に入り1件＋おすすめ をシードする（refresh E2E用）。
 *
 * @param count - 投入するおすすめの件数
 */
export async function seedRecommendations(count = 2): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) return;

  await seedRecommendationsForUser(userId, count);
}

/**
 * movie_cache へのシード・後始末のレスポンスを検証する
 *
 * 投入が失敗しても黙殺すると、各テストが「0件」で落ちるだけになり、
 * アサーションのバグなのかシードのバグなのか切り分けられない。
 * PostgREST は一括INSERTのキー不一致（PGRST102）でも全行を入れないため、
 * ここで落として原因をそのまま見せる。
 *
 * @param response - fetch のレスポンス
 * @param label - エラーメッセージに出す操作名
 */
async function assertMovieCacheWriteOk(
  response: Response,
  label: string,
): Promise<void> {
  if (response.ok) return;
  throw new Error(
    `${label} failed: ${response.status} ${await response.text()}`,
  );
}

/**
 * 相互排他バグ検証用の映画ID（movie_cache シード用）
 *
 * movie_cache は全ユーザー共通のため、固定IDだと先に終わった run の
 * 後片付けが実行中の別 run のシードを消す。IDを run 単位に分ける（#793）。
 */
export const CROSS_RELEASE_TYPE_MOVIE_ID = runScopedMovieId(1);

/**
 * 同一IDを theatrical / streaming の両方の release_type で movie_cache に投入する。
 *
 * movie_cache の PK は (id, release_type) のため両立できる。
 * 「劇場公開後に配信化された作品」が配信一覧から消えないこと（Issue #580）の検証用。
 *
 * streaming 側は `is_currently_streaming=true` にする。配信タブは
 * 「日本で実際に配信中か」で絞り込むため（Issue #582）、フラグを立てないと
 * 「配信化された作品」ではなく「JP未配信の作品」をシードしたことになる。
 *
 * @param releaseDate - 公開日（YYYY-MM-DD）。一覧の日付範囲フィルタに合わせて指定する
 */
export async function seedCrossReleaseTypeMovie(
  releaseDate: string,
): Promise<void> {
  const base = {
    id: CROSS_RELEASE_TYPE_MOVIE_ID,
    title: 'E2E劇場公開後に配信化された作品',
    poster_path: null,
    backdrop_path: null,
    release_date: releaseDate,
    overview: 'E2E用',
    vote_average: 7.5,
    vote_count: 100,
    popularity: 50,
    genre_ids: [28],
  };

  const response = await fetch(`${SUPABASE_URL}/rest/v1/movie_cache`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    // PostgREST の一括INSERTは全オブジェクトのキーが一致している必要がある
    // （揃っていないと PGRST102 で全行が入らない）
    body: JSON.stringify([
      {
        ...base,
        release_type: 'theatrical',
        is_currently_streaming: false,
        digital_release_date: null,
      },
      {
        ...base,
        release_type: 'streaming',
        is_currently_streaming: true,
        digital_release_date: releaseDate,
      },
    ]),
  });

  await assertMovieCacheWriteOk(response, 'seedCrossReleaseTypeMovie');
}

/** シードした movie_cache の行を物理削除する */
export async function cleanupCrossReleaseTypeMovie(): Promise<void> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/movie_cache?id=eq.${CROSS_RELEASE_TYPE_MOVIE_ID}`,
    { method: 'DELETE', headers: supabaseHeaders },
  );

  await assertMovieCacheWriteOk(response, 'cleanupCrossReleaseTypeMovie');
}

/**
 * JP配信実態フィルタ（Issue #582）の検証用に投入する映画ID
 *
 * {@link CROSS_RELEASE_TYPE_MOVIE_ID} と同じ理由で run 単位に分ける（#793）。
 */
export const JP_AVAILABILITY_MOVIE_IDS = {
  /** 日本で配信中 */
  STREAMING_NOW: runScopedMovieId(10),
  /** TMDb上はデジタル公開済みだが、日本では配信されていない */
  NOT_AVAILABLE_IN_JP: runScopedMovieId(11),
  /** 劇場公開済みで、日本の配信開始はこれから */
  DIGITAL_UPCOMING: runScopedMovieId(12),
  /** 劇場公開作品（配信フラグは false のまま。劇場タブへの波及確認用） */
  THEATRICAL_ONLY: runScopedMovieId(13),
} as const;

/**
 * JP配信実態の4パターンを movie_cache に投入する。
 *
 * Discover の `with_release_type=4` は「どこかの国でデジタル公開された」しか
 * 意味しないため、以前は JP 未配信作品や配信終了作品が配信タブに混ざっていた。
 * `is_currently_streaming` / `digital_release_date` による振り分けを検証する。
 *
 * @param dates - 各パターンの日付（YYYY-MM-DD）
 */
export async function seedJpAvailabilityMovies(dates: {
  /** 配信中・JP未配信の作品に使う公開日（今日） */
  today: string;
  /** 配信予定作品の公開日（劇場公開済みを表す過去日） */
  pastReleaseDate: string;
  /** 配信予定作品のデジタル公開日（未来日） */
  futureDigitalDate: string;
  /** 劇場公開のみの作品の公開日（未来日） */
  futureTheatricalDate: string;
}): Promise<void> {
  const base = {
    poster_path: null,
    backdrop_path: null,
    overview: 'E2E用',
    vote_average: 7.5,
    vote_count: 100,
    popularity: 50,
    genre_ids: [28],
  };

  const response = await fetch(`${SUPABASE_URL}/rest/v1/movie_cache`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify([
      {
        ...base,
        id: JP_AVAILABILITY_MOVIE_IDS.STREAMING_NOW,
        title: 'E2E日本で配信中の作品',
        release_type: 'streaming',
        release_date: dates.today,
        is_currently_streaming: true,
        digital_release_date: dates.today,
      },
      {
        ...base,
        id: JP_AVAILABILITY_MOVIE_IDS.NOT_AVAILABLE_IN_JP,
        title: 'E2E日本では未配信の作品',
        release_type: 'streaming',
        release_date: dates.today,
        is_currently_streaming: false,
        digital_release_date: null,
      },
      {
        ...base,
        id: JP_AVAILABILITY_MOVIE_IDS.DIGITAL_UPCOMING,
        title: 'E2E劇場公開済みで配信はこれからの作品',
        release_type: 'streaming',
        release_date: dates.pastReleaseDate,
        is_currently_streaming: false,
        digital_release_date: dates.futureDigitalDate,
      },
      {
        ...base,
        id: JP_AVAILABILITY_MOVIE_IDS.THEATRICAL_ONLY,
        title: 'E2E劇場公開のみの作品',
        release_type: 'theatrical',
        release_date: dates.futureTheatricalDate,
        is_currently_streaming: false,
        digital_release_date: null,
      },
    ]),
  });

  await assertMovieCacheWriteOk(response, 'seedJpAvailabilityMovies');
}

/** JP配信実態の検証用にシードした行を物理削除する */
export async function cleanupJpAvailabilityMovies(): Promise<void> {
  const ids = Object.values(JP_AVAILABILITY_MOVIE_IDS).join(',');
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/movie_cache?id=in.(${ids})`,
    { method: 'DELETE', headers: supabaseHeaders },
  );

  await assertMovieCacheWriteOk(response, 'cleanupJpAvailabilityMovies');
}

/**
 * 地域（原語）フィルタの検証用に投入する映画ID
 *
 * {@link CROSS_RELEASE_TYPE_MOVIE_ID} と同じ理由で run 単位に分ける（#793）。
 */
export const REGION_FILTER_MOVIE_IDS = {
  /** 韓国語作品（既定では一覧に出ない） */
  KOREAN: runScopedMovieId(20),
  /** タミル語作品（タイ・インドグループ。既定では一覧に出ない） */
  TAMIL: runScopedMovieId(21),
  /** 日本語作品（既定でも一覧に出る） */
  JAPANESE: runScopedMovieId(22),
  /** 原語が未取得の作品（NULLは除外対象にしないため既定でも出る） */
  UNKNOWN_LANGUAGE: runScopedMovieId(23),
} as const;

/**
 * 地域フィルタ検証用に、原語違いの劇場公開作品を movie_cache へ投入する
 *
 * `original_language IS NULL` の行が除外されないこと（バックフィル未完了の
 * 作品を消さない仕様）も併せて検証できるよう、未取得の行も入れる。
 *
 * @param releaseDate - 公開日（YYYY-MM-DD）。一覧の日付範囲フィルタに合わせて指定する
 */
export async function seedRegionFilterMovies(
  releaseDate: string,
): Promise<void> {
  const base = {
    poster_path: null,
    backdrop_path: null,
    release_date: releaseDate,
    overview: 'E2E用',
    vote_average: 7.5,
    vote_count: 100,
    popularity: 50,
    genre_ids: [28],
    release_type: 'theatrical',
    is_currently_streaming: false,
    digital_release_date: null,
  };

  const response = await fetch(`${SUPABASE_URL}/rest/v1/movie_cache`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    // PostgREST の一括INSERTは全オブジェクトのキーが一致している必要がある
    body: JSON.stringify([
      {
        ...base,
        id: REGION_FILTER_MOVIE_IDS.KOREAN,
        title: 'E2E韓国語作品',
        original_language: 'ko',
      },
      {
        ...base,
        id: REGION_FILTER_MOVIE_IDS.TAMIL,
        title: 'E2Eタミル語作品',
        original_language: 'ta',
      },
      {
        ...base,
        id: REGION_FILTER_MOVIE_IDS.JAPANESE,
        title: 'E2E日本語作品',
        original_language: 'ja',
      },
      {
        ...base,
        id: REGION_FILTER_MOVIE_IDS.UNKNOWN_LANGUAGE,
        title: 'E2E原語未取得作品',
        original_language: null,
      },
    ]),
  });

  await assertMovieCacheWriteOk(response, 'seedRegionFilterMovies');
}

/** 地域フィルタ検証用にシードした movie_cache の行を物理削除する */
export async function cleanupRegionFilterMovies(): Promise<void> {
  const ids = Object.values(REGION_FILTER_MOVIE_IDS).join(',');
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/movie_cache?id=in.(${ids})`,
    { method: 'DELETE', headers: supabaseHeaders },
  );

  await assertMovieCacheWriteOk(response, 'cleanupRegionFilterMovies');
}

/**
 * この run に割り当てられたID領域の movie_cache 行をまとめて物理削除する。
 *
 * 各 spec の afterAll でも消しているが、異常終了すると取りこぼす。
 * ID領域ごと消せば、シードが増えても後片付けの追従漏れが起きない。
 */
export async function cleanupRunMovieCache(): Promise<void> {
  const { min, max } = runScopedMovieIdRange();
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/movie_cache?id=gte.${min}&id=lte.${max}`,
    { method: 'DELETE', headers: supabaseHeaders },
  );

  await assertMovieCacheWriteOk(response, 'cleanupRunMovieCache');
}

/**
 * 指定ユーザーのレコメンド手動更新を「たった今実行した」状態にする。
 *
 * クールダウンの検証のために refresh API を2回叩くと、1回目でAI生成が走り
 * 月間上限も消費してしまう。検証したいのは2回目が弾かれることだけなので、
 * 直前の実行時刻を rate_limits に書き込み、1回目の呼び出しから
 * クールダウンに当たる状態を作る。
 *
 * @param userId - 対象ユーザーのID
 */
export async function seedRecommendationRefreshCooldown(
  userId: string,
): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/rate_limits`, {
    method: 'POST',
    headers: { ...supabaseHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: userId,
      action_type: 'recommendation_refresh',
      attempts: 1,
      last_attempt_at: new Date().toISOString(),
    }),
  });
}

/**
 * テストユーザーのおすすめを物理削除する（refresh E2Eの後始末用）。
 */
export async function cleanupRecommendations(): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) return;

  await fetch(`${SUPABASE_URL}/rest/v1/recommendations?user_id=eq.${userId}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}

/**
 * テストユーザーの興味なし映画を物理削除する（rate_limitsも同時にリセット）
 */
export async function cleanupDismissedMovies(): Promise<void> {
  const userId = await getTestUserId();
  if (!userId) return;

  await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/dismissed_movies?user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: supabaseHeaders,
    }),
    cleanupRateLimits(),
  ]);
}

/**
 * テストユーザーのフィルター条件をデフォルト状態にリセットする
 */
export async function resetFilters(request: APIRequestContext): Promise<void> {
  await request.put('/api/filters', {
    data: {},
  });
}

/**
 * 指定メール・アクションの最新の未検証OTPコードをDBから取得する。
 * メール実送信に依存せずOTPフローを検証するために使用（OTP_EMAIL_TEST_BYPASS前提）。
 *
 * OTPコードは平文では保存されず、HMAC-SHA256（鍵 = OTP_HASH_PEPPER）の
 * ハッシュだけがDBにある（#640）。ハッシュは戻せないため、テスト側で
 * 000000〜999999 を総当たりして一致するコードを特定する。
 *
 * この方法を採るのは、**本番コードにテスト専用の分岐を一切入れないため**。
 * 「テスト時だけ平文も保存する」「テスト時はコードを固定する」といった方式は、
 * フラグが漏れた環境で脆弱性がそのまま復活する。
 *
 * 総当たりが成立するのは pepper を知っているから。DBだけを手に入れた攻撃者は
 * HMAC を計算できないため同じことはできない（それがこの設計の要点）。
 * 実測で1秒前後。
 */
export async function getLatestOtpCode(
  email: string,
  action: 'registration' | 'login' | 'password_change',
): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/otp_codes?email=eq.${encodeURIComponent(email)}` +
      `&action_type=eq.${action}&verified_at=is.null` +
      `&order=created_at.desc&limit=1&select=code_hash`,
    { headers: supabaseHeaders },
  );
  const data = await res.json();
  const codeHash: string | null = data[0]?.code_hash ?? null;

  if (!codeHash) return null;

  return findOtpCodeByHash(codeHash, email);
}

/**
 * ハッシュに一致する6桁コードを総当たりで特定する
 *
 * @param codeHash - DBに保存されているハッシュ（hex）
 * @param email - 宛先メールアドレス（HMACのメッセージに含まれる）
 * @returns 一致したコード。見つからなければ null
 */
function findOtpCodeByHash(codeHash: string, email: string): string | null {
  const pepper = process.env.OTP_HASH_PEPPER;

  if (!pepper) {
    throw new Error(
      'OTP_HASH_PEPPER が未設定のため、OTPコードを特定できません。' +
        'E2E実行環境に本番と同じ値を設定してください。',
    );
  }

  const prefix = `${email.toLowerCase()}:`;
  const expected = Buffer.from(codeHash, 'hex');

  for (let i = 0; i < 1_000_000; i++) {
    const candidate = String(i).padStart(6, '0');
    const actual = createHmac('sha256', pepper)
      .update(`${prefix}${candidate}`)
      .digest();

    if (actual.equals(expected)) return candidate;
  }

  return null;
}

/** otp_codes の未検証レコードを PATCH するための内部ヘルパー */
async function patchUnverifiedOtp(
  email: string,
  action: string,
  body: Record<string, unknown>,
): Promise<void> {
  const enc = encodeURIComponent(email);
  await fetch(
    `${SUPABASE_URL}/rest/v1/otp_codes?email=eq.${enc}` +
      `&action_type=eq.${action}&verified_at=is.null`,
    {
      method: 'PATCH',
      headers: { ...supabaseHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

/**
 * 最新の未検証OTPを期限切れにする（異常系E2E用）。
 */
export async function expireOtpCode(
  email: string,
  action: 'registration' | 'login' | 'password_change',
): Promise<void> {
  await patchUnverifiedOtp(email, action, {
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  });
}

/**
 * 未検証OTPの試行回数を上限まで引き上げる（異常系E2E用）。
 */
export async function maxOutOtpAttempts(
  email: string,
  action: 'registration' | 'login' | 'password_change',
  maxAttempts = 5,
): Promise<void> {
  await patchUnverifiedOtp(email, action, { attempts: maxAttempts });
}

/**
 * メール（identifier）単位で使われる認証/OTP系のレート制限 action_type 一覧。
 * これらは rate_limits テーブルに email を identifier として蓄積されるため、
 * CI/ローカルの繰り返し実行で累積し、近接実行する他テストと衝突して
 * RATE_LIMIT_EXCEEDED / VERIFY_RATE_LIMIT_EXCEEDED で不安定に失敗する。
 * - otp_send_daily: OTP日次送信上限（src/app/api/auth/otp/send/route.ts）
 * - otp_verify:     OTP検証のバースト上限（src/app/api/auth/otp/verify/route.ts, #416）
 * - login:          メールOTPログインの試行上限（src/lib/auth/auth.ts）
 * - register:       新規登録の試行上限（src/app/api/auth/register/route.ts）
 * - otp_resend:     OTP再送上限（DB制約で許可済み。将来の追従漏れを防ぐため含める）
 * ※ change_password は identifier が user.id（メール以外）かつ DB を叩く E2E で
 *   到達しないため、ここには含めない。
 */
const EMAIL_RATE_LIMIT_ACTION_TYPES = [
  'otp_send_daily',
  'otp_verify',
  'login',
  'register',
  'otp_resend',
] as const;

/**
 * 指定識別子（メール等）のレート制限レコードを物理削除してリセットする。
 * 既定では認証/OTP系の関連 action_type をすべて（{@link EMAIL_RATE_LIMIT_ACTION_TYPES}）
 * まとめてリセットし、テスト間の累積・残留で他テストがレート制限に到達するのを防ぐ。
 * OTP/認証系テストの前（beforeEach 等）に呼んで、自テストが累積に寄与せず・
 * 干渉されないようにする。
 *
 * @param identifier 対象の識別子（通常はメールアドレス）
 * @param actionTypes リセット対象の action_type。未指定なら関連する全種別。
 */
export async function cleanupRateLimit(
  identifier: string,
  actionTypes: readonly string[] = EMAIL_RATE_LIMIT_ACTION_TYPES,
): Promise<void> {
  const enc = encodeURIComponent(identifier);
  const inList = encodeURIComponent(`(${actionTypes.join(',')})`);
  await fetch(
    `${SUPABASE_URL}/rest/v1/rate_limits?identifier=eq.${enc}&action_type=in.${inList}`,
    { method: 'DELETE', headers: supabaseHeaders },
  );
}

/**
 * 指定メール（+任意でアクション種別）のOTPコードのみを物理削除する。
 * ユーザーは削除しないため、既存テストユーザーの後始末に安全に使える。
 */
export async function cleanupOtpCodes(
  email: string,
  action?: 'registration' | 'login' | 'password_change',
): Promise<void> {
  const enc = encodeURIComponent(email);
  const actionFilter = action ? `&action_type=eq.${action}` : '';
  await fetch(
    `${SUPABASE_URL}/rest/v1/otp_codes?email=eq.${enc}${actionFilter}`,
    { method: 'DELETE', headers: supabaseHeaders },
  );
}

/**
 * 指定メールのユーザーとOTPコードを物理削除する（signupテストの後始末用）。
 */
export async function cleanupAuthUser(email: string): Promise<void> {
  const enc = encodeURIComponent(email);
  await fetch(`${SUPABASE_URL}/rest/v1/otp_codes?email=eq.${enc}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
  await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${enc}`, {
    method: 'DELETE',
    headers: supabaseHeaders,
  });
}
