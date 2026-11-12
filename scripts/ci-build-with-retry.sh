#!/usr/bin/env bash
#
# CI 用。next build が #787 の症状で失敗したら数回やり直す。
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
#   恒久対応は next/font/local への移行（ビルド時のフォント取得をなくす）→ #1083。
#
# ⚠️ 再試行の前に .next を消すこと（#1080）:
#   next build は cleanDistDir（既定 true）で毎回 .next を消すが、`cache` は
#   残す（node_modules/next/dist/esm/build/index.js の除外リスト）。
#   Turbopack の永続キャッシュ（.next/cache/turbopack。
#   experimental.turbopackFileSystemCacheForBuild が既定 true）に1回目の
#   失敗結果が乗るため、消さずに引き直すと**引き直しにならない**。
#
#     試行1: 12.68秒 → 496 errors
#     試行2:  0.94秒 → 496 errors（同一）
#     試行3:  0.61秒 → 496 errors（同一）
#
#   この run を手で再実行すると、同じキャッシュキーから復元して成功した。
#   入力が壊れているのではなく、失敗結果がキャッシュされているだけ。
#
# ⚠️ #787 の症状でなければ引き直さない:
#   .next を消すようにしたことで、再試行はコールドキャッシュのフルビルドになった。
#   型エラーのような「普通に壊れている」失敗まで引き直すと、落ちると分かっている
#   ビルドを3回やり直すことになり、PR が赤になるまでの待ち時間が3倍になる
#   （これを呼ぶジョブは build.yml と E2E シャード4本の計5つ）。
#   出力に #787 の目印が無ければ1回目で止める。
#
# 環境変数:
#   BUILD_MAX_ATTEMPTS  最大試行回数（既定 3）
#   BUILD_RETRY_DELAY   再試行までの待ち秒数（既定 10）

set -uo pipefail

ATTEMPTS="${BUILD_MAX_ATTEMPTS:-3}"
DELAY="${BUILD_RETRY_DELAY:-10}"

# `npm run` は呼び出し時のカレントではなく package.json のあるディレクトリで
# 走る。消す側だけカレント基準にすると、リポジトリ外から叩いたときに
# 「next build は別の .next を使い、こちらは存在しないパスを消す」という
# 無言のすれ違いになるので、スクリプトの位置から基準を決める
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# next.config.mjs に distDir の指定が無いので .next 固定。変えるならここも直す
DIST_DIR="$ROOT/.next"

# #787 の目印。これが出力に無ければ引き直さない
RETRYABLE_PATTERN='@vercel/turbopack-next/internal/font/google/font'

build_log="$(mktemp "${TMPDIR:-/tmp}/next-build-log.XXXXXX")"
trap 'rm -f "$build_log"' EXIT

status=0

for attempt in $(seq 1 "$ATTEMPTS"); do
  echo "::group::next build (試行 ${attempt}/${ATTEMPTS})"
  # if の直後の $? は if 文自体の結果になるため、else の中で拾う。
  # tee で流しているのは、CI のログに出しつつ再試行の判定に使うため
  if npm run build 2>&1 | tee "$build_log"; then
    echo "::endgroup::"
    if [ "$attempt" -gt 1 ]; then
      echo "::warning::next build は ${attempt} 回目で成功しました（#787）"
    fi
    exit 0
  else
    status=$?
  fi
  echo "::endgroup::"

  if ! grep -q "$RETRYABLE_PATTERN" "$build_log"; then
    echo "::error::next build が失敗しました。#787 の症状ではないので引き直しません"
    exit "$status"
  fi

  # 最終試行の失敗では .next を残す。消しても誰も得をしないので触らない
  # （.next をアーティファクトに上げているワークフローは無い）
  if [ "$attempt" -ge "$ATTEMPTS" ]; then
    echo "::error::next build が ${ATTEMPTS} 回とも失敗しました"
    exit "$status"
  fi

  # 失敗結果を捨ててから引き直す。消さないと2回目以降が同じ結論を
  # 再生するだけになる（冒頭の ⚠️ / #1080）
  echo "::warning::next build に失敗しました（試行 ${attempt}/${ATTEMPTS}）。${DIST_DIR} を捨てて ${DELAY} 秒後に再試行します"
  # 消せないまま引き直すと、この修正が無効な状態（失敗結果が残ったまま）に
  # 戻る。黙って元の不具合へ戻らないよう警告だけは出す
  rm -rf "$DIST_DIR" || echo "::warning::${DIST_DIR} の削除に失敗しました"
  sleep "$DELAY"
done
