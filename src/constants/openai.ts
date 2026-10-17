/**
 * OpenAI API設定
 */

/**
 * OpenAI設定
 */
export const OPENAI_CONFIG = {
  /** デフォルトのモデル名（OPENAI_MODEL 未設定時に使用） */
  DEFAULT_MODEL: 'gpt-4o-mini',
  /**
   * レコメンド生成時のtemperature
   *
   * 他用途（AWARDS / TITLE_SUGGESTION は 0.2）より大幅に高いため、
   * ハルシネーション抑制を狙って 0.6 への引き下げを検討し、本番データ
   * （お気に入り69件・ウォッチリスト11件のユーザー）で各3回計測した。
   *
   *   0.8: 既視聴作品との衝突 8〜18件 / TMDb呼び出し 35〜41回 / 解決不能 0〜2件
   *   0.6: 既視聴作品との衝突 23〜36件 / TMDb呼び出し 46〜65回 / 解決不能 0件
   *
   * 0.6 では出力が決定的になり、ユーザーが既に観ている定番作をより確実に
   * 返すようになる。削減できた解決不能は0〜2件にとどまる一方、衝突と
   * TMDb呼び出しが大幅に増えるため、引き下げは見送り 0.8 を維持する。
   */
  RECOMMENDATIONS_TEMPERATURE: 0.8,
  /** タイトルサジェスト時のtemperature */
  TITLE_SUGGESTION_TEMPERATURE: 0.2,
  /** 受賞作品取得時のtemperature（正確性重視） */
  AWARDS_TEMPERATURE: 0.2,
} as const;
