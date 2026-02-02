/**
 * Supabaseスキーマ実行スクリプト
 *
 * 実行方法: node scripts/run-schema.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// .env.localを読み込み
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env.local');
config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 Supabaseスキーマ実行開始...\n');

// 環境変数チェック
if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ エラー: Supabase環境変数が設定されていません');
  process.exit(1);
}

// サービスロールキーでクライアント作成（RLSをバイパス）
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// SQLファイルを読み込み
const schemaPath = join(__dirname, '..', 'supabase', 'schema.sql');
const sql = readFileSync(schemaPath, 'utf-8');

console.log('📄 スキーマファイルを読み込みました');
console.log('📊 SQL文のサイズ:', sql.length, 'bytes\n');

try {
  // SQLを実行（rpcを使用）
  console.log('🔄 スキーマを実行中...\n');

  const { data, error } = await supabase.rpc('exec_sql', { sql });

  if (error) {
    // rpc関数が存在しない場合は、直接SQLを分割して実行
    console.log('ℹ️  rpc関数が存在しないため、直接実行を試みます...\n');

    // Note: Supabase JS SDKではDDL文を直接実行できないため、
    // SupabaseダッシュボードのSQL Editorで手動実行する必要があります
    console.log('⚠️  Supabase JS SDKではDDL文（CREATE TABLE等）を直接実行できません');
    console.log('');
    console.log('📋 以下の手順で手動実行してください：');
    console.log('1. https://supabase.com/dashboard にアクセス');
    console.log('2. プロジェクト（ffadavddxvpijvizsznk）を選択');
    console.log('3. 左サイドバーの「SQL Editor」をクリック');
    console.log('4. 「+ New query」をクリック');
    console.log('5. supabase/schema.sql の内容を全てコピー＆ペースト');
    console.log('6. 「Run」ボタンをクリック（Cmd/Ctrl + Enter）');
    console.log('');
    console.log('または、PostgreSQL CLIツール（psql）をインストールして実行することもできます：');
    console.log('  brew install postgresql@17');
    console.log('  psql "postgresql://postgres:[PASSWORD]@db.ffadavddxvpijvizsznk.supabase.co:5432/postgres" -f supabase/schema.sql');

    process.exit(1);
  }

  console.log('✅ スキーマの実行が完了しました！\n');
  console.log('次のステップ: Supabaseダッシュボードでテーブルを確認してください');

} catch (err) {
  console.error('❌ 実行エラー:', err.message);
  process.exit(1);
}
