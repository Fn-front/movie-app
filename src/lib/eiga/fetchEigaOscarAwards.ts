/**
 * eiga.com アカデミー賞データ取得
 *
 * eiga.com のアカデミー賞特集ページからノミネート・受賞作品を正規表現で抽出する。
 * Wikipedia + OpenAI 方式の代替として、ハルシネーションのない確実な抽出を行う。
 */

import axios from 'axios';

import type { OpenAiAwardItem } from '@/schema/awards';

const EIGA_OSCAR_BASE_URL = 'https://eiga.com/official/oscar';
const EIGA_FETCH_TIMEOUT_MS = 30000;

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
  const allItems: OpenAiAwardItem[] = [];

  for (const page of EIGA_OSCAR_PAGES) {
    const url = `${EIGA_OSCAR_BASE_URL}/${ceremonyYear}/${page.path}`;
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

/** HTMLタグとエンティティを除去してテキストを取得 */
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
  let cleaned = title.replace(/（[^）]*）/g, '').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^映画[「\u300c](.+)[」\u300d]$/);
  return match ? match[1] : cleaned;
}

/** HTMLエンティティをデコード */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
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
