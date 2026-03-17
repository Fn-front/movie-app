/**
 * OpenAI APIを使用した原題提案ロジック
 */

import { openAiTitleSuggestionsResponseSchema } from '@/schema/titleSuggestion';

import { createOpenAIClient, getOpenAIModel } from './client';

/**
 * システムプロンプトを生成（現在日付を含む）
 */
function buildSystemPrompt(): string {
  const today = new Date().toISOString().split('T')[0];

  return `あなたは映画タイトルの翻訳エキスパートです。
ユーザーが入力した日本語のキーワードに対して、関連する映画の原題（英語タイトル）の候補をすべて回答してください。

現在の日付: ${today}

ルール:
- 入力が既に原題（英語）の場合は空配列を返すこと
- 邦題として正式に知られている映画を最優先で含めること（最新の映画も含む）
- キーワードから推測できる関連映画も候補に含めること
- 思いつく候補をすべて返すこと（上限5件）
- 最も可能性が高い順に並べること
- 映画と全く関連がないと判断できる場合のみ空配列を返すこと

レスポンスは以下のJSON形式で返してください:
{
  "suggestions": ["原題1", "原題2", ...]
}`;
}

/**
 * OpenAI APIを呼び出して原題候補を推測する
 *
 * @param query - 検索キーワード（邦題）
 * @returns 推測された原題候補の配列、失敗時は空配列
 */
export async function fetchTitleSuggestionsFromOpenAI(
  query: string,
): Promise<string[]> {
  const client = createOpenAIClient();
  if (!client) {
    console.error('OpenAI API key is not configured');
    return [];
  }

  try {
    const response = await client.chat.completions.create({
      model: getOpenAIModel(),
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: `映画タイトル: ${query}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('OpenAI returned empty response for title suggestion');
      return [];
    }

    const parsed = JSON.parse(content);
    const result = openAiTitleSuggestionsResponseSchema.safeParse(parsed);

    if (!result.success) {
      console.error(
        'OpenAI title suggestion response validation failed:',
        result.error,
      );
      return [];
    }

    return result.data.suggestions;
  } catch (error) {
    console.error('OpenAI title suggestion API call failed:', error);
    return [];
  }
}
