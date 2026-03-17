/**
 * OpenAI API設定
 */

/**
 * OpenAI temperature設定
 */
export const OPENAI_CONFIG = {
  /** レコメンド生成時のtemperature */
  RECOMMENDATIONS_TEMPERATURE: 0.8,
  /** タイトルサジェスト時のtemperature */
  TITLE_SUGGESTION_TEMPERATURE: 0.2,
} as const;
