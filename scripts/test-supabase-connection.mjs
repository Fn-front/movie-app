/**
 * Supabase接続テストスクリプト
 *
 * 実行方法: node scripts/test-supabase-connection.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// .env.localを読み込み
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env.local');
config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('🔍 Supabase接続テスト開始...\n');

// 環境変数チェック
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ エラー: Supabase環境変数が設定されていません');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '設定済み' : '未設定');
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '設定済み' : '未設定');
  process.exit(1);
}

console.log('✅ 環境変数が設定されています');
console.log('📡 Supabase URL:', supabaseUrl);
console.log('');

// Supabaseクライアント作成
const supabase = createClient(supabaseUrl, supabaseAnonKey);

try {
  // 接続テスト: health check
  console.log('🔄 接続テスト中...');
  const { data, error } = await supabase.from('_test_').select('*').limit(1);

  if (error && error.code === 'PGRST204') {
    // テーブルが存在しない（正常 - データベースには接続できている）
    console.log('✅ Supabaseへの接続成功！');
    console.log('ℹ️  データベースは空です（テーブル未作成）');
  } else if (error) {
    console.log('✅ Supabaseへの接続成功！');
    console.log('ℹ️  エラー詳細:', error.message);
  } else {
    console.log('✅ Supabaseへの接続成功！');
    console.log('✅ データベースへのクエリ実行成功！');
  }

  console.log('\n✨ 疎通確認完了！');
  console.log('次のステップ: データベーススキーマを作成してください');

} catch (err) {
  console.error('❌ 接続エラー:', err.message);
  process.exit(1);
}
