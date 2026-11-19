/**
 * 興味なし映画API
 * GET /api/dismissed-movies - 興味なし一覧取得
 * POST /api/dismissed-movies - 興味なしに追加
 * DELETE /api/dismissed-movies - 興味なしから削除
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  HTTP_STATUS,
  ERROR_CODE,
  DISMISSED_MOVIES_SELECT,
  DISMISSED_MOVIES_PAGE_SIZE,
  DISMISSED_MOVIES_MAX_PAGES,
  DISMISSED_MOVIES_ERROR_MESSAGES,
  DISMISSED_MOVIES_SUCCESS_MESSAGES,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import {
  conflictResponse,
  isUniqueViolation,
  rateLimitExceededResponse,
} from '@/helpers/apiHelpers';
import { fetchAllPages } from '@/helpers/fetchAllPages';
import { parseAndValidate } from '@/helpers/requestValidation';
import { withAuth } from '@/helpers/routeHandler';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { getMovieDismissSignals } from '@/lib/tmdb/tmdb';
import type { DismissSignals } from '@/lib/types';
import { dismissedMoviesAddSchema } from '@/schema/dismissedMovies';

/**
 * 同じ作品の「興味なし」が既にあるか
 *
 * TMDb を叩く前に重複を弾くためだけの確認。他のルートへ広げないこと
 * （理由は POST の中のコメント / #1277）。
 */
async function hasActiveDismissedMovie(
  supabase: SupabaseClient,
  userId: string,
  tmdbMovieId: number,
): Promise<boolean> {
  const { data } = await supabase
    .from('dismissed_movies')
    .select('id')
    .eq('user_id', userId)
    .eq('tmdb_movie_id', tmdbMovieId)
    .is('deleted_at', null)
    .single();

  return !!data;
}

export const GET = withAuth(
  async ({ session, supabase }) => {
    // レート制限チェック（#934）
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.READ_USER_DATA,
      RATE_LIMIT_CONFIG.READ_USER_DATA.maxAttempts,
      RATE_LIMIT_CONFIG.READ_USER_DATA.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    // ⚠️ `range()` で区切る。PostgREST は `max_rows`（1000）を超えた結果を
    // エラーも truncation フラグも返さずに打ち切るため、絞り込み無しで
    // 投げると 1001件目以降が静かに消える（#1274）。
    //
    // 消えると、除外されるはずの作品がレコメンドに再び出る。件数が少ない
    // うちは症状が出ないので、**閾値を超えたことに気づけない**。
    //
    // 並びは `created_at` だけだと同時刻の行でページ間の重複・抜けが起きうる
    // ので、`id` をタイブレークに足す
    const data = await fetchAllPages({
      pageSize: DISMISSED_MOVIES_PAGE_SIZE,
      maxPages: DISMISSED_MOVIES_MAX_PAGES,
      label: 'dismissed-movies',
      query: (from, to) =>
        supabase
          .from('dismissed_movies')
          .select(DISMISSED_MOVIES_SELECT)
          .eq('user_id', session.user.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
    });

    return NextResponse.json(
      { success: true, data },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Dismissed movies fetch error',
    errorMessage: DISMISSED_MOVIES_ERROR_MESSAGES.FETCH_FAILED,
  },
);

export const POST = withAuth(
  async ({ session, supabase, request }) => {
    // レート制限チェック
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.WRITE_DISMISSED_MOVIES,
      RATE_LIMIT_CONFIG.WRITE_DISMISSED_MOVIES.maxAttempts,
      RATE_LIMIT_CONFIG.WRITE_DISMISSED_MOVIES.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const parsed = await parseAndValidate(
      request,
      dismissedMoviesAddSchema,
      DISMISSED_MOVIES_ERROR_MESSAGES.INVALID_BODY,
    );

    if (parsed.error) return parsed.error;

    // ⚠️ **ここだけは事前チェックを残す**（#1277）。
    //
    // `favorites` / `watchlist` の POST からは外した。重複は部分UNIQUE
    // インデックスが保証していて、INSERT の 23505 → 409 で同じ応答を
    // 返せるので、成功時に1往復ムダになるだけだったため。
    //
    // このルートは事情が違う。すぐ下に TMDb の呼び出し
    // （`getMovieDismissSignals`）がある。外すと重複リクエストでも
    // TMDb を叩いてから 409 を返すことになり、**かえって遅くなる**。
    // ここで弾けば外部APIに触らずに済む。
    //
    // ⚠️ 汎用ヘルパーには置かない。`apiHelpers` に `checkDuplicate` として
    // 置いていたときは、同じ事情が無いルートからも呼ばれて往復が増えた。
    // 例外である以上、例外の側に閉じ込める
    const isDuplicate = await hasActiveDismissedMovie(
      supabase,
      session.user.id,
      parsed.data.tmdb_movie_id,
    );

    if (isDuplicate) {
      return conflictResponse(DISMISSED_MOVIES_ERROR_MESSAGES.ALREADY_EXISTS);
    }

    // 監督・テーマ・年代をレコメンドの傾向学習用に収集する。
    // TMDbが落ちていても「興味なし」の登録自体は成功させたいので、
    // 失敗時はログだけ残して各項目を null のまま保存する。
    let signals: DismissSignals | null = null;
    try {
      signals = await getMovieDismissSignals(parsed.data.tmdb_movie_id);
    } catch (error) {
      console.error(
        `Failed to collect dismiss signals for movie ${parsed.data.tmdb_movie_id}:`,
        error,
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from('dismissed_movies')
      .insert({
        user_id: session.user.id,
        tmdb_movie_id: parsed.data.tmdb_movie_id,
        title: parsed.data.title,
        poster_path: parsed.data.poster_path ?? null,
        genre_ids: parsed.data.genre_ids ?? null,
        keywords: signals?.keywords.length ? signals.keywords : null,
        director_name: signals?.directorName ?? null,
        release_year: signals?.releaseYear ?? null,
      })
      .select(DISMISSED_MOVIES_SELECT)
      .single();

    if (insertError) {
      if (isUniqueViolation(insertError)) {
        return conflictResponse(DISMISSED_MOVIES_ERROR_MESSAGES.ALREADY_EXISTS);
      }
      throw insertError;
    }

    return NextResponse.json(
      {
        success: true,
        message: DISMISSED_MOVIES_SUCCESS_MESSAGES.ADDED,
        data: inserted,
      },
      { status: HTTP_STATUS.CREATED },
    );
  },
  {
    errorLog: 'Dismissed movie add error',
    errorMessage: DISMISSED_MOVIES_ERROR_MESSAGES.ADD_FAILED,
  },
);

export const DELETE = withAuth(
  async ({ session, supabase, request }) => {
    // レート制限チェック
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.WRITE_DISMISSED_MOVIES,
      RATE_LIMIT_CONFIG.WRITE_DISMISSED_MOVIES.maxAttempts,
      RATE_LIMIT_CONFIG.WRITE_DISMISSED_MOVIES.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const { searchParams } = new URL(request.url);
    const tmdbMovieId = searchParams.get('tmdb_movie_id');

    if (!tmdbMovieId || isNaN(Number(tmdbMovieId))) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: DISMISSED_MOVIES_ERROR_MESSAGES.INVALID_BODY,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const { error: updateError } = await supabase
      .from('dismissed_movies')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .eq('tmdb_movie_id', Number(tmdbMovieId))
      .is('deleted_at', null);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json(
      {
        success: true,
        message: DISMISSED_MOVIES_SUCCESS_MESSAGES.REMOVED,
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Dismissed movie remove error',
    errorMessage: DISMISSED_MOVIES_ERROR_MESSAGES.REMOVE_FAILED,
  },
);
