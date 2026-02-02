/**
 * Supabaseクライアント（クライアントサイド用）
 */

import { createBrowserClient } from '@supabase/ssr';

/**
 * ブラウザ用Supabaseクライアント
 *
 * @returns Supabaseクライアントインスタンス
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not defined');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
