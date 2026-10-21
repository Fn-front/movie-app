#!/usr/bin/env bash
#
# CI 用。next build が失敗したら数回やり直す。
#
# 背景（#787）:
#   next/font/google から生成される仮想モジュール
#   `@vercel/turbopack-next/internal/font/google/font` の解決が、
#   同一コミット・同一 .next/cache でも非決定的に失敗することがある。
#
#     Error: Turbopack build failed with 496 errors:
#     [next]/internal/font/google/noto_sans_jp_*.module.css:6:8
#     Error: Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
#
#   失敗した run を同じコミットで再実行すると通ることを確認済みで、
#   ビルド入力ではなく実行時の非決定性が原因。Next.js/Turbopack 側の問題なので
#   アプリ側では直せない。ジョブごと手で再実行するのは待ち時間が大きいため、
#   ここで吸収する。
#
#   恒久対応は next/font/local への移行（ビルド時のフォント取得をなくす）。
#
# 環境変数:
#   BUILD_MAX_ATTEMPTS  最大試行回数（既定 3）
#   BUILD_RETRY_DELAY   再試行までの待ち秒数（既定 10）

set -uo pipefail

ATTEMPTS="${BUILD_MAX_ATTEMPTS:-3}"
DELAY="${BUILD_RETRY_DELAY:-10}"

status=0

for attempt in $(seq 1 "$ATTEMPTS"); do
  echo "::group::next build (試行 ${attempt}/${ATTEMPTS})"
  # if の直後の $? は if 文自体の結果になるため、else の中で拾う
  if npm run build; then
    echo "::endgroup::"
    if [ "$attempt" -gt 1 ]; then
      echo "::warning::next build は ${attempt} 回目で成功しました（#787）"
    fi
    exit 0
  else
    status=$?
  fi
  echo "::endgroup::"

  if [ "$attempt" -ge "$ATTEMPTS" ]; then
    echo "::error::next build が ${ATTEMPTS} 回とも失敗しました"
    exit "$status"
  fi

  echo "::warning::next build に失敗しました（試行 ${attempt}/${ATTEMPTS}）。${DELAY} 秒後に再試行します"
  sleep "$DELAY"
done
