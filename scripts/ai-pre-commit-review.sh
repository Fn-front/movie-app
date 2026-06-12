#!/bin/bash
# Claude AI による pre-commit レビュー
# - staged diff を Claude Code CLI でレビュー
# - blocker / warning を JSON 出力で分離して表示
# - Phase 1: blocker でもコミットは継続（exit 0 固定）
# - 緊急バイパス: SKIP_AI_REVIEW=1 git commit ...

set -uo pipefail

DIFF=$(git diff --cached)

if [ -z "$DIFF" ]; then
  exit 0
fi

if [ "${SKIP_AI_REVIEW:-0}" = "1" ]; then
  echo "⏭️  AI レビューをスキップ (SKIP_AI_REVIEW=1)"
  exit 0
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "⚠️  claude コマンドが見つかりません。AI レビューをスキップします。"
  exit 0
fi

echo "🤖 Claude AI による pre-commit レビュー実行中..."

PROMPT=$(cat <<EOF
あなたはコードレビュアーです。以下の staged diff を、プロジェクトの GEMINI.md と .claude/rules/ のルールに照らしてレビューしてください。

出力は **JSON のみ**。他の文字（説明文・コードブロック記号など）を一切含めないこと:
{
  "blockers": [{"file": "path", "line": number, "message": "違反内容と修正方法"}],
  "warnings": [{"file": "path", "line": number, "message": "違反内容と修正方法"}]
}

判定基準:
- blockers: セキュリティ違反 / 認証バイパス / 環境変数のハードコード / OWASP Top 10 該当
- warnings: 命名規則 / React.memo / useCallback / displayName / cn() / インラインスタイル / その他軽微な品質問題
- 違反なし: {"blockers": [], "warnings": []}

--- staged diff ---
$DIFF
EOF
)

RESPONSE=$(claude -p --output-format json --max-turns 1 "$PROMPT" 2>/dev/null || echo '{"blockers": [], "warnings": []}')

# Claude の --output-format json は外側に Claude セッション情報を包む可能性。
# 内部の result フィールドを優先して取得し、なければ全体を解釈する。
RESULT=$(echo "$RESPONSE" | jq -r '.result // empty' 2>/dev/null)
if [ -n "$RESULT" ]; then
  RESPONSE="$RESULT"
fi

BLOCKERS=$(echo "$RESPONSE" | jq -r '.blockers // [] | length' 2>/dev/null || echo 0)
WARNINGS=$(echo "$RESPONSE" | jq -r '.warnings // [] | length' 2>/dev/null || echo 0)

if [ "$BLOCKERS" -gt 0 ]; then
  echo ""
  echo "🚨 重大な指摘 (Phase 1 では blocker にしません):"
  echo "$RESPONSE" | jq -r '.blockers[] | "  - \(.file):\(.line) \(.message)"' 2>/dev/null
fi

if [ "$WARNINGS" -gt 0 ]; then
  echo ""
  echo "⚠️  警告:"
  echo "$RESPONSE" | jq -r '.warnings[] | "  - \(.file):\(.line) \(.message)"' 2>/dev/null
fi

if [ "$BLOCKERS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo "✅ AI レビュー: 問題なし"
fi

exit 0
