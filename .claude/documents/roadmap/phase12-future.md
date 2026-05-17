**ステータス: 未完了**

## フェーズ12: 将来的な機能（優先度低）

- [x] #237 — 受賞作品機能
  - [x] #276 — DB基盤（award_moviesテーブル）
  - [x] #277 — OpenAI受賞作品取得ロジック + Cron API
  - [x] #278 — 公開API Route + APIクライアント
  - [x] #279 — フロントエンド（ページ + コンポーネント + フック）
  - [x] #280 — テスト作成
  - [x] #281 — ドキュメント更新
- [ ] #170 — レビュー・評価機能
- [ ] #171 — 追加機能（シェア・通知・言語切り替え）
- [ ] #203 — ダークモード
- [x] #340 — React 19 + Next.js 16 対応アップグレード（シアター体験の前提）
- [x] シアター体験（3D可視化） — 設計書: [theater-experience-design.md](../theater-experience-design.md)
  - 依存: #340 完了後に着手（R3F v9 採用のため）
  - [x] DB基盤（theaters / theater_seats / theater_speakers + シードデータ1件）
  - [x] API Route（`/api/theaters`, `/api/theaters/[slug]`）+ zodバリデーション
  - [x] 物理計算ユーティリティ（ISO 9613-1準拠の係数）+ カスタムフック
  - [x] seatA11yList（Canvas外のセマンティックDOM座席一覧）
  - [x] 3Dシーン基盤（@react-three/fiber + drei、`<View>` で一人称プレビュー）
  - [x] 床面ヒートマップ（フラグメントシェーダー、WebGL2前提）+ 周波数切替
  - [x] 視野占有率パネル・スクリーン歪み表示
  - [x] WebGL2/モバイル非対応時のフォールバック画面
  - [x] ページ統合・動的ルート `[slug]`・ナビゲーション・認証ガード
  - [x] アクセシビリティ対応（WCAG 2.1 AA、`prefers-reduced-motion`）
  - [x] テスト（カバレッジ80%維持）
