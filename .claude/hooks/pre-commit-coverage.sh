#!/bin/bash
#
# PreToolUse: git commit 前にテストカバレッジチェック
# 変更ファイルに関連するテストを実行し、カバレッジ80%未満ならブロック（exit 2）
#

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# git commit 以外は無視
if ! echo "$COMMAND" | grep -q "git commit"; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# ステージングされた .ts/.tsx ファイルを取得（テストファイル自体は除外）
CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' | grep -v '\.test\.' | grep -v '\.spec\.' || true)

if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

# 変更ファイルに対応するテストファイルを探す
TEST_FILES=""
for FILE in $CHANGED_FILES; do
  DIR=$(dirname "$FILE")
  BASE=$(basename "$FILE" | sed 's/\.\(ts\|tsx\)$//')
  # 同ディレクトリの .test.ts/.test.tsx を探す
  for EXT in "test.ts" "test.tsx"; do
    TEST_PATH="$DIR/$BASE.$EXT"
    if [ -f "$TEST_PATH" ]; then
      TEST_FILES="$TEST_FILES $TEST_PATH"
    fi
  done
done

if [ -z "$TEST_FILES" ]; then
  exit 0
fi

# カバレッジ付きでテスト実行
COLLECT_FROM=""
for FILE in $CHANGED_FILES; do
  COLLECT_FROM="$COLLECT_FROM --collectCoverageFrom='$FILE'"
done

OUTPUT=$(eval npx jest $TEST_FILES --coverage $COLLECT_FROM --passWithNoTests 2>&1) || true

# カバレッジ閾値チェック（全指標80%以上）
if echo "$OUTPUT" | grep -q "coverage threshold"; then
  echo "テストカバレッジが80%未満です。カバレッジを改善してからコミットしてください。" >&2
  echo "" >&2
  echo "$OUTPUT" | grep -A 20 "^-" >&2
  exit 2
fi

# テスト失敗チェック
if echo "$OUTPUT" | grep -q "Tests:.*failed"; then
  echo "テストが失敗しています。テストを修正してからコミットしてください。" >&2
  exit 2
fi

exit 0
