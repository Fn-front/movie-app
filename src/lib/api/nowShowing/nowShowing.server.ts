/**
 * 劇場公開中の人気映画API（サーバーサイド用）
 */

import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';

import { NOW_SHOWING_REVALIDATE_SECONDS } from '@/constants/nowShowing';
import type { NowShowingMovie } from '@/lib/types';

/**
 * 劇場公開中の人気映画一覧をDBから取得する（キャッシュなし内部実装）
 *
 * unstable_cache内ではcookies()が使えないため、
 * 公開データ取得用にcookies不要のSupabaseクライアントを使用する。
 *
 * ⚠️ **ここで throw すると「ビルド失敗」になる。** ホーム（`/`）を静的
 * プリレンダにしたため、この関数は**ビルド時に**走る（#1115）。以前は
 * リクエスト時だったので `error.tsx` に落ちるだけだった。
 *
 * **それを承知のうえで throw のままにしている。** 空配列へ倒すと、環境変数の
 * 設定漏れや権限剥がれに気づけないまま「公開中セクションが空のホーム」を
 * revalidate まで配信してしまう。SEO とファーストビューを守るのが静的化の
 * 目的なので、静かに空になるよりデプロイを止めるほうを選ぶ。
 */
async function fetchNowShowingMovies(): Promise<NowShowingMovie[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not defined');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase
    .from('now_showing_movies')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/**
 * 劇場公開中の人気映画一覧をDBから取得する（Server Component用）
 * 1時間キャッシュ（Cronによる日次同期に合わせた頻度）
 *
 * ⚠️ ホームの ISR（`src/app/page.tsx` の `revalidate`）と**二段構え**になる。
 * どちらも1時間なので、元データの更新が画面に出るまで最大およそ2時間。
 * 同期は日次（`vercel.json` の `sync-now-showing`）なので許容範囲（#1115）。
 *
 * @returns 映画一覧（display_order順）
 */
export const getNowShowingMovies = unstable_cache(
  fetchNowShowingMovies,
  ['now-showing-movies'],
  { revalidate: NOW_SHOWING_REVALIDATE_SECONDS },
);
