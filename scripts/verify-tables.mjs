/**
 * Supabaseテーブル作成確認スクリプト
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env.local');
config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 テーブル作成確認開始...\n');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const expectedTables = [
  'users',
  'otp_tokens',
  'password_reset_tokens',
  'watchlist',
  'movie_cache',
  'rate_limits',
  'user_preferences',
  'reviews'
];

try {
  console.log('📊 作成されたテーブルを確認中...\n');

  for (const tableName of expectedTables) {
    const { data, error } = await supabase.from(tableName).select('*').limit(0);

    if (error) {
      console.log(`❌ ${tableName}: エラー - ${error.message}`);
    } else {
      console.log(`✅ ${tableName}: 正常に作成されています`);
    }
  }

  console.log('\n✨ 確認完了！');
  console.log('\n次のステップ:');
  console.log('1. NextAuth.js v5設定ファイルを作成');
  console.log('2. 認証フローを実装');

} catch (err) {
  console.error('❌ エラー:', err.message);
  process.exit(1);
}
