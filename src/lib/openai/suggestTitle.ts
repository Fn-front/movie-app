/**
 * OpenAI Responses APIを使用した原題提案ロジック（Web検索付き）
 */

import { openAiTitleSuggestionsResponseSchema } from '@/schema/titleSuggestion';

import { createOpenAIClient, getOpenAIModel } from './client';

/**
 * システムプロンプトを生成（現在日付を含む）
 */
function buildSystemPrompt(): string {
  const today = new Date().toISOString().split('T')[0];

  return `あなたは映画タイトルの翻訳エキスパートです。
ユーザーが入力した日本語のキーワードに対して、関連する映画の原題（英語タイトル）の候補を回答してください。

必ずWeb検索を実行してください。以下の検索クエリを順番に試し、結果を総合して候補を出してください:
1. 「{入力キーワード} 映画 原題」
2. 「{入力キーワード} movie original title」

現在の日付: ${today}

ルール:
- 入力が既に原題（英語）の場合は空配列を返すこと
- 邦題として正式に知られている映画を最優先で含めること（最新の映画も含む）
- キーワードから推測できる関連映画も候補に含めること
- 思いつく候補をすべて返すこと（上限5件）
- 最も可能性が高い順に並べること
- 映画と全く関連がないと判断できる場合のみ空配列を返すこと
- 各候補は映画のタイトル文字列のみとし、公開年・括弧・補足説明は付けないこと（例: "Last Breath (2025)" ではなく "Last Breath"）

レスポンスは以下のJSON形式で返してください:
{
  "suggestions": ["原題1", "原題2", ...]
}`;
}

/**
 * OpenAI Responses APIを呼び出して原題候補を推測する（Web検索付き）
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
    const response = await client.responses.create({
      model: getOpenAIModel(),
      instructions: buildSystemPrompt(),
      input: `映画タイトル: ${query}`,
      tools: [{ type: 'web_search_preview' }],
      text: {
        format: {
          type: 'json_schema',
          name: 'title_suggestions',
          schema: {
            type: 'object',
            properties: {
              suggestions: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['suggestions'],
            additionalProperties: false,
          },
          strict: true,
        },
      },
      temperature: 0.2,
    });

    const content = response.output_text;
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
