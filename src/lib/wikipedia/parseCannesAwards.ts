/**
 * カンヌ映画祭のwikitextから受賞作品を抽出する
 *
 * ゴールデングローブ賞（`parseGoldenGlobesAwards`）と同じく OpenAI を介さず
 * 記事から直接読むが、**記事の構造が根本的に違う**ため別のパーサにしている。
 *
 * | | ゴールデングローブ賞 | カンヌ |
 * | --- | --- | --- |
 * | 部門の区切り | `{{Award category}}` / 表ヘッダ | `; 部門グループ` |
 * | 行の形 | `* ` 受賞 / `** ` ノミネート | `* 賞名 - 作品（人名）` |
 * | ノミネート | あり | **なし（受賞のみ）** |
 *
 * ⚠️ **全件 `is_winner: true` で返す。** カンヌの記事はノミネートを載せない。
 *    従来の OpenAI 経路はプロンプトが「ノミネートを漏れなく」と要求するため、
 *    同じセクションにある別部門の受賞作をノミネートとして埋めていた
 *    （2024年のグランプリに6件入り、うち5件は他部門の受賞作だった）。
 */

import { AWARD_DEFINITIONS } from '@/constants/awards';
import type { OpenAiAwardItem } from '@/schema/awards';

import {
  flattenMarkup,
  stripAnnotations,
  stripEmphasis,
} from './wikitextMarkup';

/**
 * 記事中の賞名 → `AWARD_DEFINITIONS.cannes` の部門キー
 *
 * 賞名はリンクのこともプレーンテキストのこともある。リンクならリンク先、
 * 無ければ文字列そのものを引く。第76〜78回で表記が一致することを確認済み。
 *
 * ⚠️ **完全一致で引くこと。** 部分一致にすると `短編映画パルム・ドール` が
 *    `パルム・ドール` に、`ある視点審査員賞` が `ある視点賞` に化ける。
 *
 * パルム・ドールとカメラ・ドールだけ「カンヌ国際映画祭」の接頭辞が無く、
 * 「ある視点賞」はそもそもリンクになっていない。
 */
const AWARD_NAME_TO_KEY: Readonly<Record<string, string>> = {
  'パルム・ドール': 'palme_dor',
  'カンヌ国際映画祭 審査員特別グランプリ': 'grand_prix',
  'カンヌ国際映画祭 審査員賞': 'jury_prize',
  'カンヌ国際映画祭 監督賞': 'best_director',
  'カンヌ国際映画祭 男優賞': 'best_actor',
  'カンヌ国際映画祭 女優賞': 'best_actress',
  'カメラ・ドール': 'camera_dor',
  ある視点賞: 'un_certain_regard',
};

/**
 * 公式選出セクションの見出し
 *
 * 独立選出（国際批評家週間・監督週間）や独立賞（国際映画批評家連盟賞）には
 * 同名の賞が並ぶため、公式選出に絞る。見つからない場合は全体を走査する
 * （賞名を完全一致で引いているので、絞れなくても誤爆はしない）。
 */
const OFFICIAL_SELECTION_HEADING = /^===\s*公式選出\s*===\s*$/m;

/** 次の `=== 見出し ===` までを公式選出とみなす */
const NEXT_SUBSECTION_HEADING = /^===\s*[^=]+\s*===\s*$/m;

/**
 * 受賞行。`* ` のみを対象にする
 *
 * `** スペシャル・メンション` は次点の言及であって受賞ではないため拾わない。
 */
const AWARD_LINE = /^\*(?!\*)\s*(.+)$/;

/** 賞名と内容を分ける区切り。記事はダッシュの種類が揺れる */
const NAME_CONTENT_SEPARATOR = /\s[–—−-]\s/;

/**
 * 作品名と、その直後に続く括弧
 *
 * 括弧に「監督」が入っていれば作品→監督の並び、入っていなければ
 * 人名→作品の並びと判断する材料にする。
 */
const FILM_WITH_TRAILING_PAREN = /『([^』]*)』\s*(?:[（(]([^）)]*)[）)])?/g;

/** 人名部分の末尾に残る開き括弧とダッシュ */
const PERSON_TRAILING_NOISE = /[（(\s、,]+$/;

/** パース結果の1件 */
export interface ParsedCannesEntry {
  categoryKey: string;
  titleJa: string;
  titleEn: string;
  personName?: string;
}

/** 公式選出セクションだけを切り出す */
function extractOfficialSelection(wikitext: string): string {
  const headingMatch = wikitext.match(OFFICIAL_SELECTION_HEADING);
  if (headingMatch?.index === undefined) return wikitext;

  const after = wikitext.slice(headingMatch.index + headingMatch[0].length);
  const nextMatch = after.match(NEXT_SUBSECTION_HEADING);

  return nextMatch?.index === undefined
    ? after
    : after.slice(0, nextMatch.index);
}

/**
 * 賞名を部門キーに解決する
 *
 * `[[カンヌ国際映画祭 監督賞|監督賞]]` ならリンク先、`ある視点賞` なら
 * 文字列そのもので引く。
 */
function resolveCategoryKey(namePart: string): string | null {
  const linkMatch = namePart.match(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/);
  const name = linkMatch ? linkMatch[1].trim() : stripEmphasis(namePart).trim();

  return AWARD_NAME_TO_KEY[name] ?? null;
}

/** 括弧の中身から「監督」などの役割語を落として人名だけにする */
function cleanPersonName(raw: string): string | undefined {
  const { text } = flattenMarkup(raw);
  const trimmed = text
    .replace(/監督$/, '')
    .replace(PERSON_TRAILING_NOISE, '')
    .trim();

  return trimmed || undefined;
}

/**
 * 1行の内容から受賞作品を取り出す
 *
 * 並びが2通りあり、作品名の直後の括弧に「監督」が入っているかで見分ける。
 *   作品→監督: `『落下の解剖学』（ジュスティーヌ・トリエ監督）`
 *   人名→作品: `トラン・アン・ユン（『ポトフ 美食家と料理人』）`
 *
 * 同点受賞は作品が複数並ぶ（`『A』（X監督）、『B』（Y監督）`）。`『』` の数だけ
 * 返す。一方、1作品に受賞者が複数いる場合（演技賞の連名）は `『』` が1つなので
 * 1件にまとまり、人名が連名のまま入る。**`、` で機械的に分割してはいけない。**
 */
export function parseCannesAwardLine(
  content: string,
): { titleJa: string; titleEn: string; personName?: string }[] {
  const cleaned = stripAnnotations(content);
  const results: { titleJa: string; titleEn: string; personName?: string }[] =
    [];

  let previousEnd = 0;

  for (const match of cleaned.matchAll(FILM_WITH_TRAILING_PAREN)) {
    const [whole, filmBody, trailingParen] = match;
    const film = flattenMarkup(stripEmphasis(filmBody));
    if (!film.text) continue;

    const isDirectorSuffix = trailingParen?.includes('監督') ?? false;
    const personName = isDirectorSuffix
      ? cleanPersonName(trailingParen!)
      : cleanPersonName(cleaned.slice(previousEnd, match.index!));

    results.push({
      titleJa: film.text,
      titleEn: film.en ?? film.text,
      ...(personName ? { personName } : {}),
    });

    previousEnd = match.index! + whole.length;
  }

  return results;
}

/**
 * カンヌ映画祭のwikitextから受賞作品を抽出する
 *
 * @param wikitext - 「受賞作品」セクションのwikitext
 * @returns 追跡対象の部門に属する受賞作品（すべて受賞）
 */
export function parseCannesWikitext(wikitext: string): ParsedCannesEntry[] {
  const results: ParsedCannesEntry[] = [];

  for (const line of extractOfficialSelection(wikitext).split('\n')) {
    const lineMatch = line.trim().match(AWARD_LINE);
    if (!lineMatch) continue;

    const separatorMatch = lineMatch[1].match(NAME_CONTENT_SEPARATOR);
    if (separatorMatch?.index === undefined) continue;

    const categoryKey = resolveCategoryKey(
      lineMatch[1].slice(0, separatorMatch.index),
    );
    if (!categoryKey) continue;

    const content = lineMatch[1].slice(
      separatorMatch.index + separatorMatch[0].length,
    );

    for (const film of parseCannesAwardLine(content)) {
      results.push({ categoryKey, ...film });
    }
  }

  return results;
}

/**
 * パース結果を TMDb 解決へ渡す形に変換する
 *
 * `year` は受賞作品の公開年。カンヌは**開催年と同年の作品**が対象のため、
 * 授賞式の前年を入れる他の賞と違い `ceremonyYear` をそのまま使う。
 * 日本公開のずれは `findBestMatch` が当年・翌年の窓で吸収する。
 *
 * @param wikitext - 「受賞作品」セクションのwikitext
 * @param ceremonyYear - 開催年
 */
export function fetchCannesFromWikitext(
  wikitext: string,
  ceremonyYear: number,
): OpenAiAwardItem[] {
  const validKeys: ReadonlySet<string> = new Set(
    AWARD_DEFINITIONS.cannes.categories.map((c) => c.key),
  );

  return parseCannesWikitext(wikitext)
    .filter((entry) => validKeys.has(entry.categoryKey))
    .map((entry) => ({
      title_ja: entry.titleJa,
      title_en: entry.titleEn,
      category: entry.categoryKey,
      is_winner: true,
      year: ceremonyYear,
      ...(entry.personName ? { person_name: entry.personName } : {}),
    }));
}
