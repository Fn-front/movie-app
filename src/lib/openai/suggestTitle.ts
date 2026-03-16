/**
 * OpenAI APIを使用した原題提案ロジック
 */

import { openAiTitleSuggestionResponseSchema } from '@/schema/titleSuggestion';

import { createOpenAIClient, getOpenAIModel } from './client';

const SYSTEM_PROMPT = `あなたは映画タイトルの翻訳エキスパートです。
ユーザーが入力した日本語の映画タイトル（邦題）に対して、対応する原題（英語タイトル）を回答してください。

ルール:
- 入力が既に原題（英語）の場合は null を返すこと
- 入力が映画タイトルと判断できない場合は null を返すこと
- 確信が持てない場合は null を返すこと
- 最も一般的に知られている原題を返すこと

レスポンスは以下のJSON形式で返してください:
{
  "suggested_title": "英語の原題" または null
}`;

/**
 * OpenAI APIを呼び出して原題を推測する
 *
 * @param query - 検索キーワード（邦題）
 * @returns 推測された原題、失敗・提案なしの場合はnull
 */
export async function fetchTitleSuggestionFromOpenAI(
  query: string,
): Promise<string | null> {
  const client = createOpenAIClient();
  if (!client) {
    console.error('OpenAI API key is not configured');
    return null;
  }

  try {
    const response = await client.chat.completions.create({
      model: getOpenAIModel(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `映画タイトル: ${query}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('OpenAI returned empty response for title suggestion');
      return null;
    }

    const parsed = JSON.parse(content);
    const result = openAiTitleSuggestionResponseSchema.safeParse(parsed);

    if (!result.success) {
      console.error(
        'OpenAI title suggestion response validation failed:',
        result.error,
      );
      return null;
    }

    return result.data.suggested_title;
  } catch (error) {
    console.error('OpenAI title suggestion API call failed:', error);
    return null;
  }
}
