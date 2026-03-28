#!/bin/bash
#
# PreToolUse: git commit 前にテストカバレッジチェック
# 変更ファイルに関連するテストを実行し、カバレッジ80%未満ならブロック（exit 2）
#

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d).tool_input?.command||'')")

# git commit 以外は無視
if ! echo "$COMMAND" | grep -q "git commit"; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# ステージングされた .ts/.tsx ファイルを取得（テストファイル自体は除外）
mapfile -t CHANGED_FILES < <(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' | grep -v '\.test\.' | grep -v '\.spec\.' || true)

if [ ${#CHANGED_FILES[@]} -eq 0 ]; then
  exit 0
fi

# 変更ファイルに対応するテストファイルを探す
TEST_FILES=()
for FILE in "${CHANGED_FILES[@]}"; do
  DIR=$(dirname "$FILE")
  BASE=$(basename "$FILE" | sed 's/\.\(ts\|tsx\)$//')
  for EXT in "test.ts" "test.tsx"; do
    TEST_PATH="$DIR/$BASE.$EXT"
    if [ -f "$TEST_PATH" ]; then
      TEST_FILES+=("$TEST_PATH")
    fi
  done
done

if [ ${#TEST_FILES[@]} -eq 0 ]; then
  exit 0
fi

# カバレッジ付きでテスト実行（Bash配列で安全にコマンド構築）
JEST_ARGS=(--coverage --passWithNoTests --coverageReporters=json-summary --coverageReporters=text)
for FILE in "${CHANGED_FILES[@]}"; do
  JEST_ARGS+=(--collectCoverageFrom="$FILE")
done

OUTPUT=$(npx jest "${TEST_FILES[@]}" "${JEST_ARGS[@]}" 2>&1) || true

# テスト失敗チェック
if echo "$OUTPUT" | grep -q "Tests:.*failed"; then
  echo "テストが失敗しています。テストを修正してからコミットしてください。" >&2
  exit 2
fi

# json-summaryからカバレッジ数値をチェック（80%未満ならブロック）
COVERAGE_FILE="$CLAUDE_PROJECT_DIR/coverage/coverage-summary.json"
if [ -f "$COVERAGE_FILE" ]; then
  BELOW_THRESHOLD=$(node -e "
    const data = require('$COVERAGE_FILE');
    const total = data.total;
    const metrics = ['statements', 'branches', 'functions', 'lines'];
    const failures = metrics.filter(m => total[m].pct < 80);
    if (failures.length > 0) {
      failures.forEach(m => console.error(m + ': ' + total[m].pct + '%'));
      process.exit(1);
    }
  " 2>&1) || {
    echo "テストカバレッジが80%未満です。カバレッジを改善してからコミットしてください。" >&2
    echo "$BELOW_THRESHOLD" >&2
    exit 2
  }
fi

exit 0
