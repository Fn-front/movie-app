/**
 * eiga.com アカデミー賞データ取得
 *
 * eiga.com のアカデミー賞特集ページからノミネート・受賞作品を正規表現で抽出する。
 * Wikipedia + OpenAI 方式の代替として、ハルシネーションのない確実な抽出を行う。
 */

import axios from 'axios';

import { EIGA_FETCH_TIMEOUT_MS } from '@/constants';
import type { OpenAiAwardItem } from '@/schema/awards';
import { getRequiredEnv } from '@/utils/env';

/** eiga.comページと対応する部門のマッピング */
interface EigaPageConfig {
  path: string;
  /** null の場合は all-others ページ（セクションヘッダーで部門を判別） */
  category: string | null;
  /** 抽出方法: 'movie_link' は h5_link 内の /movie/ リンク、'sub_link' は h5_link_sub */
  extractType: 'movie_link' | 'sub_link';
}

const EIGA_OSCAR_PAGES: EigaPageConfig[] = [
  { path: 'all.html', category: 'best_picture', extractType: 'movie_link' },
  {
    path: 'all-director.html',
    category: 'best_director',
    extractType: 'sub_link',
  },
  { path: 'all-actor.html', category: 'best_actor', extractType: 'sub_link' },
  {
    path: 'all-actress.html',
    category: 'best_actress',
    extractType: 'sub_link',
  },
  { path: 'all-others.html', category: null, extractType: 'sub_link' },
];

/** all-othersページのセクション名からカテゴリキーへのマッピング */
const SECTION_TO_CATEGORY: Record<string, string> = {
  助演男優賞: 'best_supporting_actor',
  助演女優賞: 'best_supporting_actress',
};

/** 抽出されたノミネート作品 */
export interface ExtractedNominee {
  title: string;
  isWinner: boolean;
  /** 監督名・俳優名（演技賞・監督賞の場合） */
  personName?: string;
}

/**
 * eiga.com からアカデミー賞ノミネート・受賞作品を取得する
 *
 * @param ceremonyYear - 授賞式の年（例: 2026 → 第98回）
 * @returns TMDb解決用の OpenAiAwardItem 配列
 */
export async function fetchEigaOscarAwards(
  ceremonyYear: number,
): Promise<OpenAiAwardItem[]> {
  const baseUrl = getRequiredEnv('EIGA_OSCAR_BASE_URL');
  const allItems: OpenAiAwardItem[] = [];

  for (const page of EIGA_OSCAR_PAGES) {
    const url = `${baseUrl}/${ceremonyYear}/${page.path}`;
    let html: string;
    try {
      html = await fetchHtml(url);
    } catch (error) {
      console.warn(`Failed to fetch ${url}:`, error);
      continue;
    }

    if (page.category) {
      const nominees =
        page.extractType === 'movie_link'
          ? extractBestPictureNominees(html)
          : extractPersonCategoryNominees(html);

      for (const nominee of nominees) {
        allItems.push({
          title_ja: nominee.title,
          title_en: nominee.title,
          category: page.category,
          is_winner: nominee.isWinner,
          year: ceremonyYear - 1,
          person_name: nominee.personName,
        });
      }
    } else {
      const sectionNominees = extractOthersPageNominees(html);
      for (const { section, nominees } of sectionNominees) {
        const categoryKey = SECTION_TO_CATEGORY[section];
        if (!categoryKey) continue;

        for (const nominee of nominees) {
          allItems.push({
            title_ja: nominee.title,
            title_en: nominee.title,
            category: categoryKey,
            is_winner: nominee.isWinner,
            year: ceremonyYear - 1,
            person_name: nominee.personName,
          });
        }
      }
    }
  }

  return allItems;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    responseType: 'text',
    timeout: EIGA_FETCH_TIMEOUT_MS,
  });
  return response.data;
}

/**
 * HTMLタグとエンティティを除去してテキストを取得
 *
 * タグ除去は1回の置換で完結する。`[^>]*` が各 `<` から最初の `>` までを貪欲に
 * 消すため、`>` が後続する `<` は必ず同じ走査で一緒に消費される。走査後に残る
 * `<` には後続の `>` が無く、`A<<b>script>B` のような入れ子でもタグが組み上がって
 * 残ることはない（`Ascript>B` になる）。繰り返し適用しても結果は変わらないため
 * ループは設けない。
 */
function cleanHtmlText(raw: string): string {
  return decodeHtmlEntities(
    raw
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, '')
      .trim(),
  );
}

/** eiga.com特有のタイトルラッピング（映画「...」）と全角括弧の注釈を除去 */
function unwrapMovieTitle(title: string): string {
  const cleaned = title
    .replace(/（[^）]*）/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const match = cleaned.match(/^映画[「\u300c](.+)[」\u300d]$/);
  return match ? match[1] : cleaned;
}

/**
 * 名前付きHTMLエンティティの対応表
 *
 * `&nbsp;` は含めない。cleanHtmlText がデコード前に削除しており、
 * ここで空白へ変換すると挙動が変わるため。
 */
const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Unicode のコードポイントの上限 */
const MAX_CODE_POINT = 0x10ffff;

/**
 * HTMLエンティティをデコードする
 *
 * **1回の走査で完結させる**こと。段階的に置換すると二重にデコードしてしまう。
 * 例えば数値参照を先に処理してから `&amp;` を `&` に変える実装では、
 * `&amp;lt;` が `&lt;`（文字列としての "&lt;"）ではなく `<` になる。
 *
 * `String.prototype.replace` は置換結果を再走査しないため、全パターンを
 * 1つの正規表現で受ければ各エンティティはちょうど1回だけデコードされる。
 */
function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g,
    (matched, decimal?: string, hex?: string, name?: string) => {
      if (decimal !== undefined) {
        return fromCodePoint(Number(decimal), matched);
      }

      if (hex !== undefined) {
        return fromCodePoint(parseInt(hex, 16), matched);
      }

      // 未知の名前付きエンティティは元の文字列のまま残す（壊さない）
      return NAMED_HTML_ENTITIES[name!.toLowerCase()] ?? matched;
    },
  );
}

/**
 * コードポイントを文字へ変換する。範囲外なら元の表記をそのまま返す
 *
 * `String.fromCodePoint` は範囲外の値で例外を投げる。スクレイピング対象の
 * 不正なマークアップで同期処理全体を落とさないため、ここで吸収する。
 */
function fromCodePoint(codePoint: number, fallback: string): string {
  if (!Number.isInteger(codePoint) || codePoint < 0) return fallback;
  if (codePoint > MAX_CODE_POINT) return fallback;

  return String.fromCodePoint(codePoint);
}

/**
 * 作品賞ページからノミネート作品を抽出
 * h5_link 内の /movie/ リンクに映画タイトルが直接入る
 */
export function extractBestPictureNominees(html: string): ExtractedNominee[] {
  const results: ExtractedNominee[] = [];

  const pattern =
    /class="nominate_ctb(\s+winner)?"[\s\S]*?<h5 class="h5_link">\s*<a href="\/movie\/\d+\/">([\s\S]*?)<\/a>/g;

  let match;
  while ((match = pattern.exec(html)) !== null) {
    const title = unwrapMovieTitle(cleanHtmlText(match[2]));
    if (title) {
      results.push({
        title,
        isWinner: match[1] !== undefined,
      });
    }
  }

  return results;
}

/**
 * 演技賞・監督賞ページからノミネート作品と人名を抽出
 * h5_link に人名、h5_link_sub に「映画タイトル」
 */
export function extractPersonCategoryNominees(
  html: string,
): ExtractedNominee[] {
  const results: ExtractedNominee[] = [];

  // h5_link 内の /person/ リンクで人名、h5_link_sub で映画タイトルを抽出
  // <a>タグ内に<i>タグや&nbsp;が含まれるため、aタグの中身全体をキャプチャしてcleanHtmlTextで処理
  const pattern =
    /class="nominate_ctb(\s+winner)?"[\s\S]*?<h5 class="h5_link">\s*<a href="\/person\/\d+\/">([\s\S]*?)<\/a>[\s\S]*?class="h5_link_sub">\u300c<a href="\/movie\/\d+\/">([^<]+)<\/a>\u300d/g;

  let match;
  while ((match = pattern.exec(html)) !== null) {
    const personName = cleanHtmlText(match[2]);
    if (!personName) continue;
    results.push({
      title: decodeHtmlEntities(match[3].trim()),
      isWinner: match[1] !== undefined,
      personName,
    });
  }

  return results;
}

/**
 * all-othersページからセクション別にノミネート作品を抽出
 */
export function extractOthersPageNominees(
  html: string,
): { section: string; nominees: ExtractedNominee[] }[] {
  const results: { section: string; nominees: ExtractedNominee[] }[] = [];

  // セクションヘッダーとノミネートブロック（人名+映画タイトル）を順番に検出
  // <a>タグ内に<i>タグや&nbsp;が含まれるため、aタグの中身全体をキャプチャ
  const tokenPattern =
    /(?:<h4 class="underline"><span>([^<]+)<\/span><\/h4>)|(?:class="nominate_ctb(\s+winner)?"[\s\S]*?<h5 class="h5_link">\s*<a href="\/person\/\d+\/">([\s\S]*?)<\/a>[\s\S]*?class="h5_link_sub">\u300c<a href="\/movie\/\d+\/">([^<]+)<\/a>\u300d)/g;

  let currentSection = '';
  let currentNominees: ExtractedNominee[] = [];

  let match;
  while ((match = tokenPattern.exec(html)) !== null) {
    if (match[1]) {
      // セクションヘッダー → 前のセクションを保存して切り替え
      if (currentSection && currentNominees.length > 0) {
        results.push({ section: currentSection, nominees: currentNominees });
      }
      currentSection = match[1];
      currentNominees = [];
    } else if (match[4]) {
      const personName = cleanHtmlText(match[3]);
      currentNominees.push({
        title: decodeHtmlEntities(match[4].trim()),
        isWinner: match[2] !== undefined,
        ...(personName ? { personName } : {}),
      });
    }
  }

  // 最後のセクション
  if (currentSection && currentNominees.length > 0) {
    results.push({ section: currentSection, nominees: currentNominees });
  }

  return results;
}
