/**
 * OpenAI APIを使用した受賞作品データ取得ロジック
 *
 * 処理フロー:
 * 1. Wikipedia APIで記事本文を取得（安定したデータソース）
 * 2. OpenAI APIで記事本文を構造化データに変換
 * 3. 映画タイトルをTMDb APIで検索 → tmdb_movie_id解決
 */

import type { AwardCategory, AwardDefinition } from '@/constants/awards';
import { AWARD_TITLE_MATCH_MAX_CANDIDATES } from '@/constants/awards';
import { OPENAI_CONFIG } from '@/constants';
import { isConcertFilm } from '@/lib/movies/concertFilm';
import { isStageBroadcast } from '@/lib/movies/stageBroadcast';
import {
  getMovieTitleAliases,
  hasExcludedKeyword,
  searchMovies,
} from '@/lib/tmdb/tmdb';
import {
  openAiAwardsResponseSchema,
  type OpenAiAwardItem,
} from '@/schema/awards';

import { createOpenAIClient, getOpenAIModel } from './client';

/**
 * wikitextから映画タイトル候補を抽出する
 * 『』で囲まれたテキストおよび * / ** 行の[[]]リンクから表示テキストを取得
 */
export function extractMovieTitlesFromWikitext(wikitext: string): Set<string> {
  const titles = new Set<string>();

  // パターン1: 『...』で囲まれたタイトル
  const bracketMatches = wikitext.matchAll(/『([^』]+)』/g);
  for (const match of bracketMatches) {
    titles.add(resolveWikitextToDisplayText(match[1]));
  }

  // パターン2: {{仮リンク}} テンプレート
  // label=あり: {{仮リンク|...|label=表示テキスト|...}}
  // label=なし: {{仮リンク|表示テキスト|lang|英語記事名}}（第1引数が表示テキスト）
  const kariLinkMatches = wikitext.matchAll(/\{\{仮リンク\|([^|}]+)[^}]*\}\}/g);
  for (const match of kariLinkMatches) {
    const fullTemplate = match[0];
    const labelMatch = fullTemplate.match(/\|label=([^|}]+)/);
    const displayText = (labelMatch ? labelMatch[1] : match[1]).replace(
      /'''/g,
      '',
    );
    titles.add(displayText);
  }

  // パターン3: * / ** 行の直接リンク（作品賞など『』なしのケース）
  // 『』を含む行は演技賞形式（人名 - 『映画』）なので、パターン1で取得済み。スキップする
  const lines = wikitext.split('\n');
  for (const line of lines) {
    if (!line.match(/^\*{1,2}\s/)) continue;
    if (line.includes('『')) continue;
    const linkMatches = line.matchAll(/\[\[([^\]]+)\]\]/g);
    for (const linkMatch of linkMatches) {
      const displayText = resolveWikitextLink(linkMatch[1]);
      if (!displayText.includes('賞')) {
        titles.add(displayText);
      }
    }
  }

  return titles;
}

/** wikitext内のマークアップを解決して表示テキストを取得 */
function resolveWikitextToDisplayText(raw: string): string {
  // '''太字'''を除去
  let text = raw.replace(/'''/g, '');
  // {{仮リンク|表示テキスト|...}} or {{仮リンク|...|label=表示テキスト|...}} → 表示テキスト
  text = text.replace(/\{\{仮リンク\|([^|}]+)[^}]*\}\}/g, (_, firstArg) => {
    const labelMatch = _.match(/\|label=([^|}]+)/);
    return labelMatch ? labelMatch[1] : firstArg;
  });
  // [[link|display]] → display, [[link]] → link
  text = text.replace(/\[\[([^\]]+)\]\]/g, (_, content) =>
    resolveWikitextLink(content),
  );
  return text.trim();
}

/** [[link|display]] → display, [[link#section|display]] → display */
function resolveWikitextLink(content: string): string {
  if (content.includes('|')) {
    return content.split('|').pop()!;
  }
  // セクションリンク [[title#section]] → title
  if (content.includes('#')) {
    return content.split('#')[0];
  }
  return content;
}

/** TMDb検索で解決済みの受賞作品情報 */
export interface ResolvedAwardMovie {
  tmdb_movie_id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  vote_count: number;
  genre_ids: number[] | null;
  category: string;
  is_winner: boolean;
  display_order: number;
  person_name?: string;
}

/**
 * システムプロンプトを生成
 */
function buildSystemPrompt(): string {
  return `あなたは映画賞データの構造化エキスパートです。
提供されたWikipedia記事のwikitextから、指定された部門の受賞作品とノミネート作品を正確に抽出してJSON形式で返してください。

## wikitextの読み方
- 記事はwikitext（MediaWikiマークアップ）形式です
- 受賞者は '''太字''' で記載され、先頭行（* で始まる行）に配置されます
- ノミネート者は ** で始まる行に記載されます
- 映画タイトルは『』や[[]]で囲まれています
- {{Award category|...|部門名}} がセクション区切りです

## 抽出ルール
- title_ja、title_enには必ず「映画のタイトル」を入れること。俳優名・監督名・人物名は絶対に入れないこと
- 映画タイトルはwikitext中の『』や[[]]で囲まれた文字列をそのまま使用すること。推測や補完をしないこと
- 演技賞の場合、記事中の俳優名の横に『』で記載されている出演映画のタイトルを返すこと
- 監督賞の場合、記事中の監督名の横に『』で記載されている監督作品のタイトルを返すこと
- yearは映画の公開年（授賞式の年ではなく）。通常は授賞式の前年か同年の公開作品が対象
- wikitextのリンク先にセクション指定（#実写映画 等）がある場合、そのバージョンの公開年を使うこと
- 受賞者（is_winner: true）は'''太字'''かつ先頭（*で始まる行）の1名のみ
- ノミネート者（**で始まる行）は記事に記載されている全員を漏れなく返すこと
- 記事中のすべてのノミネート者を1人も欠落なく抽出すること
- アダルト作品（ポルノ・成人指定作品・ピンク映画等）は抽出対象に含めないこと

レスポンスは以下のJSON形式で返してください:
{
  "awards": [
    {
      "title_ja": "日本語タイトル",
      "title_en": "英語タイトル",
      "category": "部門キー",
      "is_winner": true,
      "year": 2025
    }
  ]
}`;
}

/**
 * Wikipedia記事タイトルを生成
 */
export function buildWikipediaTitle(
  awardYear: number,
  awardDef: AwardDefinition,
): string {
  const edition =
    awardDef.firstEditionYear > 0 ? awardYear - awardDef.firstEditionYear : 0;
  return awardDef.wikipediaTemplate
    .replace('{edition}', String(edition))
    .replace('{year}', String(awardYear));
}

/**
 * Wikipedia記事本文を含むユーザープロンプトを組み立てる
 */
export function buildUserPrompt(
  awardYear: number,
  awardLabel: string,
  category: AwardCategory,
  articleText: string,
): string {
  return `以下は${awardYear}年に授賞式が行われた${awardLabel}のWikipedia記事（wikitext形式）です。
この記事から「${category.label}」部門の受賞作品とノミネート作品を抽出してください。

- categoryフィールドには "${category.key}" をそのまま使用してください
- yearフィールドには映画の公開年（授賞式の年ではなく）を入れてください
- '''太字'''の先頭行（*）が受賞者（is_winner: true）です
- **で始まる行がノミネート者です。全員を漏れなく返してください

---
${articleText}
---`;
}

/**
 * OpenAI APIを呼び出して1部門の受賞作品データを抽出
 */
export async function fetchAwardsFromOpenAI(
  awardYear: number,
  awardLabel: string,
  category: AwardCategory,
  articleText: string,
): Promise<OpenAiAwardItem[] | null> {
  const client = createOpenAIClient();
  if (!client) {
    console.error('OpenAI API key is not configured');
    return null;
  }

  const userPrompt = buildUserPrompt(
    awardYear,
    awardLabel,
    category,
    articleText,
  );

  try {
    const response = await client.responses.create({
      model: getOpenAIModel(),
      instructions: buildSystemPrompt(),
      input: userPrompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'awards_response',
          schema: {
            type: 'object',
            properties: {
              awards: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title_ja: { type: 'string' },
                    title_en: { type: 'string' },
                    category: { type: 'string' },
                    is_winner: { type: 'boolean' },
                    year: { type: 'number' },
                  },
                  required: [
                    'title_ja',
                    'title_en',
                    'category',
                    'is_winner',
                    'year',
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ['awards'],
            additionalProperties: false,
          },
          strict: true,
        },
      },
      temperature: OPENAI_CONFIG.AWARDS_TEMPERATURE,
    });

    const textOutput = response.output.find((o) => o.type === 'message');
    if (!textOutput || textOutput.type !== 'message') {
      console.error('OpenAI returned no message output');
      return null;
    }

    const textContent = textOutput.content.find(
      (c) => c.type === 'output_text',
    );
    if (!textContent || textContent.type !== 'output_text') {
      console.error('OpenAI returned no text content');
      return null;
    }

    const parsed = JSON.parse(textContent.text);
    const result = openAiAwardsResponseSchema.safeParse(parsed);

    if (!result.success) {
      console.error('OpenAI response validation failed:', result.error);
      return null;
    }

    return result.data.awards;
  } catch (error) {
    console.error('OpenAI API call failed:', error);
    return null;
  }
}

/**
 * TMDb検索結果から、公開年が当年・翌年のものを TMDb の関連度順で返す
 *
 * **該当が無ければ空配列を返す。先頭結果へのフォールバックはしない。**
 * かつては `?? results[0]` で先頭を無条件採用していたが、年もタイトルも
 * 手がかりが無い候補を採ると無関係な作品が公開データに載る。実害として
 * 第82回ゴールデングローブ賞の『マリア』(2024) に、2017年のドキュメンタリー
 * 『私は、マリア・カラス』(465871) が入っていた。
 *
 * ⚠️ `year` と `release_date` は基準が違う。`year` は受賞作品データ側の
 *    **本国公開年**（eiga.com 経路は `ceremonyYear - 1`、OpenAI 経路は
 *    「映画の公開年」）だが、`release_date` は tmdbClient が `region: 'JP'` を
 *    付けているため**日本のリリース代表日**で返る。洋画の日本公開は本国より
 *    遅れて年をまたぐことが珍しくないため、`year` だけで突き合わせると
 *    本命が外れる。
 *
 *    実例: 第96回アカデミー賞の『オッペンハイマー』(872585) は本国2023年公開・
 *    日本公開2024-03-29。`year=2023` と一致しないため関連度1位にいても飛ばされ、
 *    2023年日本公開の同名別作品『オッペンハイマーの真実』(1230570) が
 *    選ばれていた。
 *
 * ⚠️ **当年を優先して翌年はフォールバック、という順序にしてはいけない。**
 *    それでは上の実例が直らない（`1230570` が当年完全一致で勝ち続ける）。
 *    当年・翌年を対等に扱い、その中は TMDb の関連度順のまま返すのが要点。
 *    「年一致を最優先する」から「年ウィンドウ内で関連度順に見る」への
 *    意図的な方針転換であり、翌年候補が当年完全一致より上位にいれば
 *    翌年候補が先に来る。
 *
 * ⚠️ 窓を広げた影響は呼び出し元の4経路で重みが違う。`year` 付きの検索は
 *    TMDb 側で既に年が絞られた集合の再ランキングなので安全だが、`year`
 *    なしのフォールバック検索ではここが唯一の年ガードになる。そのため
 *    年だけで同定を決めず、採用前に `matchesAwardTitle` を必ず通す。
 */
function selectYearWindowCandidates<
  T extends { id: number; release_date?: string },
>(results: T[], year: number): T[] {
  const acceptedYears = new Set([String(year), String(year + 1)]);

  return results.filter((m) =>
    acceptedYears.has(m.release_date?.slice(0, 4) ?? ''),
  );
}

/**
 * タイトル比較で無視する記号
 *
 * 長音符（U+30FC `ー`）は**含めない**。ハイフンに見えるが意味を持つ文字で、
 * 落とすと「ローマ」と「ロマ」が同じになる。NFKC は長音符を変換しないため、
 * ここで明示的に除外しない限り保持される。
 *
 * ⚠️ **この一覧から `/` を取り除かないこと。** 取得元と TMDb で邦題の区切りが
 *    食い違う。eiga.com は空白、TMDb は `/` を使う。
 *      `名もなき者 A COMPLETE UNKNOWN`  ↔  `名もなき者/A COMPLETE UNKNOWN`
 *      `クィア QUEER`                   ↔  `クィア／QUEER`
 *    正規化後に `/` が残ると、この差だけで不一致になり候補が丸ごと弾かれる
 *    （第82回ゴールデングローブ賞で3作品・延べ5件が落ちた）。全角 `／` は
 *    NFKC で `/` に畳まれるので、半角だけ列挙すれば足りる。
 *
 *    文字クラス内の `/` はエスケープしない。`\/` は `no-useless-escape` で
 *    エラーになる。
 */
const TITLE_NOISE_PATTERN =
  /[\s・:;,.!?"'~_|/()[\]{}\-‐–—、。！？「」『』【】（）〜”“’]/g;

/**
 * タイトルを比較用に正規化する
 *
 * NFKC で全角英数・半角カナを畳み、小文字化し、区切り記号を落とす。
 * 取得元（eiga.com / Wikipedia）の表記と TMDb の登録タイトルは中黒・コロン・
 * スラッシュ・副題の括弧などが揺れるため、素の文字列比較では一致しない。
 */
function normalizeTitle(raw: string | undefined): string {
  if (!raw) return '';
  return raw.normalize('NFKC').toLowerCase().replace(TITLE_NOISE_PATTERN, '');
}

/**
 * TMDbの候補が、探している受賞作品かをタイトルで確かめる
 *
 * 検索でヒットしたことは「その作品である」ことを意味しない。TMDbの検索は
 * 部分一致でも返すため、`resolveAwardsWithTMDb` は同定の裏付けを別に持つ必要が
 * ある。実例として、検索語「マリア・カラス」に対し2017年のドキュメンタリー
 * 『私は、マリア・カラス』が返り、そのまま保存されていた。
 *
 * **まず検索レスポンスの `title` / `original_title` で判定し、一致しなければ
 * 初めて別名を問い合わせる。** 大半の候補は追加の問い合わせなしで確定するため、
 * TMDbへの呼び出しを最小限に抑えられる。
 *
 * 別名まで見る必要がある実例: 『ザ・ルーム・ネクスト・ドア』(1088514) は
 * 邦題が日本語、原題がスペイン語（La habitación de al lado）で、検索語の英題
 * "The Room Next Door" はどちらとも一致しない。別名を見ないと正解を捨てる。
 *
 * ⚠️ これは「別作品を採らない」ための検査であって、同名異作を見分ける力は無い。
 *    第82回ゴールデングローブ賞の『マリア』(1038263) と、原題 Mary の別作品
 *    『マリア』(1243381) はどちらも邦題が「マリア」で、タイトルだけでは
 *    区別できない。見分けるには監督名など別の手がかりが要る。
 */
async function matchesAwardTitle(
  movie: { id: number; title: string; original_title?: string },
  item: OpenAiAwardItem,
): Promise<boolean> {
  const needles = [item.title_ja, item.title_en]
    .map(normalizeTitle)
    .filter(Boolean);

  if (needles.length === 0) return false;

  const direct = [movie.title, movie.original_title].map(normalizeTitle);
  if (needles.some((n) => direct.includes(n))) return true;

  const aliases = (await getMovieTitleAliases(movie.id)).map(normalizeTitle);
  return needles.some((n) => aliases.includes(n));
}

/**
 * OpenAIの受賞作品結果をTMDb検索で解決し、映画情報を取得する
 */
export async function resolveAwardsWithTMDb(
  items: OpenAiAwardItem[],
  awardDefinition: AwardDefinition,
  /**
   * 解決に失敗した作品が出た部門を積む集合（省略可）
   *
   * TMDb のリトライ対象は 429/503/504 のみで、ECONNRESET や 500 は作品ごとの
   * catch で握られ**その作品だけ黙って落ちる**。取りこぼした部門は
   * 「前回あって今回無い行」の判定に使えないため、呼び出し元が旧世代削除の
   * 対象から外せるように記録する
   */
  unresolvedCategories?: Set<string>,
): Promise<ResolvedAwardMovie[]> {
  const resolved: ResolvedAwardMovie[] = [];
  const validCategoryKeys = new Set(
    awardDefinition.categories.map((c) => c.key),
  );
  // 部門ごとのdisplay_orderカウンター
  const categoryOrderMap = new Map<string, number>();

  for (const item of items) {
    if (!validCategoryKeys.has(item.category)) {
      console.warn(`Unknown category key: ${item.category}, skipping`);
      continue;
    }

    try {
      /**
       * adult作品を除外し、公開年が当年・翌年に入る候補を関連度順で返す
       *
       * searchMoviesでも除外済みだが、受賞作品はDBに保存され未認証ユーザーにも
       * 表示されるため、採用直前でも明示的に弾く二重防御とする。
       * フォールバック検索が4パターンあるためヘルパー化して漏れを防ぐ。
       *
       * 件数を `AWARD_TITLE_MATCH_MAX_CANDIDATES` で切るのは、後段のタイトル
       * 照合が候補ごとにTMDbへ問い合わせうるため。
       */
      const searchCandidates = async (params: {
        query: string;
        year?: number;
      }) => {
        if (!params.query?.trim()) return [];

        const searchResult = await searchMovies(params);
        const safeResults = searchResult.results.filter((m) => !m.adult);
        return selectYearWindowCandidates(safeResults, item.year).slice(
          0,
          AWARD_TITLE_MATCH_MAX_CANDIDATES,
        );
      };

      // 日本語タイトル+公開年 → 日本語のみ → 英語+公開年 → 英語のみ の順に探す。
      // 前段で採用できた時点で打ち切る
      const searchStages: { query: string; year?: number }[] = [
        { query: item.title_ja, year: item.year },
        { query: item.title_ja },
        { query: item.title_en, year: item.year },
        { query: item.title_en },
      ];

      let movie:
        | Awaited<ReturnType<typeof searchCandidates>>[number]
        | undefined;

      // 一度却下した映画を段をまたいで再判定しない。検索語を変えても同じ映画が
      // 返るのは普通で、記録しないと同じ作品に対して最大4回ぶんの問い合わせを
      // 繰り返す（判定結果は変わらないので、増えるのはコストだけ）
      const rejectedMovieIds = new Set<number>();

      for (const stage of searchStages) {
        const candidates = await searchCandidates(stage);

        for (const candidate of candidates) {
          if (rejectedMovieIds.has(candidate.id)) continue;

          // ライブ・コンサート映像や舞台中継は映画賞の対象ではないが、
          // AIが抽出したタイトルのTMDb検索で紛れ込みうるため弾く。
          // 同期判定の isStageBroadcast を先に通し、TMDbへの問い合わせを省く
          if (isStageBroadcast(candidate)) {
            rejectedMovieIds.add(candidate.id);
            continue;
          }

          // 検索でヒットしただけでは同定にならない。無関係な作品を公開データに
          // 載せないため、ここで必ず裏を取る
          if (!(await matchesAwardTitle(candidate, item))) {
            rejectedMovieIds.add(candidate.id);
            continue;
          }

          // 除外キーワード（ポルノ・ピンク映画等）を含む映画を弾く。
          // adult フラグだけでは `adult=false` のアダルト作品を通してしまう
          if (await hasExcludedKeyword(candidate.id)) {
            rejectedMovieIds.add(candidate.id);
            continue;
          }

          if (await isConcertFilm(candidate)) {
            rejectedMovieIds.add(candidate.id);
            continue;
          }

          movie = candidate;
          break;
        }

        if (movie) break;
      }

      if (!movie) {
        console.warn(
          `TMDb match failed for "${item.title_ja}" / "${item.title_en}" (year=${item.year})`,
        );
        unresolvedCategories?.add(item.category);
        continue;
      }

      // 空白だけの人名は「人名なし」に寄せる。DB の一意キーは NULL 同士を
      // 重複とみなす（NULLS NOT DISTINCT）ため、空文字を素通しすると
      // 同じ作品賞が「空文字の行」と「NULLの行」で2行入る
      const personName = item.person_name?.trim() || undefined;

      // 同じ映画×同じ部門×同じ人の重複を防止（DBユニーク制約に合わせる）。
      // 人名まで見るのは、演技賞で同じ作品から複数人がノミネートされるため。
      // 人名を無視すると先に来た1人だけが残り、受賞者が後ろにいると受賞が消える
      if (
        resolved.some(
          (r) =>
            r.tmdb_movie_id === movie.id &&
            r.category === item.category &&
            r.person_name === personName,
        )
      ) {
        continue;
      }

      // 部門ごとの連番を採番
      const currentOrder = (categoryOrderMap.get(item.category) ?? 0) + 1;
      categoryOrderMap.set(item.category, currentOrder);

      resolved.push({
        tmdb_movie_id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        release_date: movie.release_date || null,
        vote_average: movie.vote_average ?? null,
        vote_count: movie.vote_count ?? 0,
        genre_ids: movie.genre_ids ?? null,
        category: item.category,
        is_winner: item.is_winner,
        display_order: currentOrder,
        person_name: personName,
      });
    } catch (error) {
      console.error(`TMDb search failed for "${item.title_ja}":`, error);
      unresolvedCategories?.add(item.category);
      continue;
    }
  }

  return resolved;
}
