#!/bin/bash
#
# PostToolUse: ファイル編集後に prettier + eslint を自動実行
# 対象: .ts, .tsx, .scss ファイル
#

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d).tool_input?.file_path||'')")

if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# 対象拡張子のみ
if ! echo "$FILE_PATH" | grep -qE '\.(ts|tsx|scss)$'; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# prettier --write（exit codeのみ無視、stderrは維持）
npx prettier --write "$FILE_PATH" || true

# eslint --fix（.scss は対象外）
if echo "$FILE_PATH" | grep -qE '\.(ts|tsx)$'; then
  npx eslint --fix "$FILE_PATH" || true
fi

exit 0
