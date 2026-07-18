/**
 * OpenAI API設定
 */

/**
 * OpenAI設定
 */
export const OPENAI_CONFIG = {
  /** デフォルトのモデル名（OPENAI_MODEL 未設定時に使用） */
  DEFAULT_MODEL: 'gpt-4o-mini',
  /** レコメンド生成時のtemperature */
  RECOMMENDATIONS_TEMPERATURE: 0.8,
  /** タイトルサジェスト時のtemperature */
  TITLE_SUGGESTION_TEMPERATURE: 0.2,
  /** 受賞作品取得時のtemperature（正確性重視） */
  AWARDS_TEMPERATURE: 0.2,
} as const;
