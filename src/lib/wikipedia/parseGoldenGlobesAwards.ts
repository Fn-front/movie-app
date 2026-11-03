/**
 * ゴールデングローブ賞のwikitextから受賞・ノミネートを抽出する
 *
 * アカデミー賞が eiga.com を正規表現で抽出しているのと同じ発想で、
 * OpenAI を介さず記事から直接読む。OpenAI 経由には3つの問題があった。
 *
 * 1. 決定的でない。同じ年を同期し直すと件数が変わり、前に見えていた作品が消える
 * 2. 人名を返さない（JSONスキーマに無い）ため、同名異作を見分ける手がかりが無い
 * 3. 部門数ぶん課金される
 *
 * ハルシネーション検証（`extractMovieTitlesFromWikitext` との突き合わせ）も
 * 不要になる。記事から直接取るので、記事に無いものは原理的に出てこない。
 * むしろ従来はその検証が、`『』` も `[[]]` も持たない行（例:
 * `** [[パメラ・アンダーソン]] – The Last Showgirl - Shelly役`）を
 * ハルシネーション扱いで捨てており、取りこぼしの主因になっていた。
 */

import { AWARD_DEFINITIONS } from '@/constants/awards';
import type { OpenAiAwardItem } from '@/schema/awards';

/**
 * Wikipedia のリンク先 → `AWARD_DEFINITIONS.golden_globes` の部門キー
 *
 * **表示ラベルではなくリンク先をキーにする。** 表示ラベルは年と書式で変わるが
 * （第82回は「作品賞 (ドラマ部門)」、第81回は「ドラマ部門」）、リンク先の
 * 記事名は第80〜82回で完全に一致していることを実測で確認している。
 *
 * 監督賞だけ「映画部門」が付かない。テレビ部門の監督賞が無いため。
 *
 * ここに無いリンク先（アニメ映画賞・脚本賞・テレビ部門等）は追跡対象外として
 * 無視する。記事には載っているが `AWARD_DEFINITIONS` が持たない部門。
 */
const CATEGORY_TARGET_TO_KEY: Readonly<Record<string, string>> = {
  'ゴールデングローブ賞 映画部門 作品賞 (ドラマ部門)': 'best_drama',
  'ゴールデングローブ賞 映画部門 作品賞 (ミュージカル・コメディ部門)':
    'best_musical_comedy',
  'ゴールデングローブ賞 監督賞': 'best_director',
  'ゴールデングローブ賞 映画部門 主演男優賞 (ドラマ部門)': 'best_actor_drama',
  'ゴールデングローブ賞 映画部門 主演女優賞 (ドラマ部門)': 'best_actress_drama',
  'ゴールデングローブ賞 映画部門 主演男優賞 (ミュージカル・コメディ部門)':
    'best_actor_musical_comedy',
  'ゴールデングローブ賞 映画部門 主演女優賞 (ミュージカル・コメディ部門)':
    'best_actress_musical_comedy',
  'ゴールデングローブ賞 映画部門 助演男優賞': 'best_supporting_actor',
  'ゴールデングローブ賞 映画部門 助演女優賞': 'best_supporting_actress',
};

/** 表の行区切り */
const ROW_SEPARATOR = /^\s*\|-\s*$/m;

/** 受賞行（`* `）とノミネート行（`** `） */
const ENTRY_LINE = /^(\*{1,2})\s*(.+)$/;

/**
 * 人名と作品名を分ける区切り
 *
 * **半角ハイフン（`-`）を含めてはいけない。** 記事は人名と作品名を
 * 全角ダッシュ（`–` U+2013 / `—` U+2014）で区切り、作品名と役名を
 * 半角ハイフンで区切る。
 *   `[[パメラ・アンダーソン]] – The Last Showgirl - Shelly役`
 * 半角ハイフンを含めると `Spider-Man` のような作品名を人名と作品に
 * 割ってしまう。
 */
const NAME_FILM_SEPARATOR = /[–—−]/;

/** 役名の接尾辞（`- ウィリアム・リー役` のような末尾を落とす） */
const ROLE_SUFFIX = /^(.*?)\s*[–—−\-－]\s*[^–—−\-－]*役\s*$/;

/** 英語版記事名から曖昧さ回避の括弧を落とす（`Black Dog (2024 film)` → `Black Dog`） */
const EN_DISAMBIGUATION =
  /\s*\((?:[^()]*\b(?:film|movie)\b[^()]*|\d{4})\)\s*$/i;

/** パース結果の1件 */
export interface ParsedAwardEntry {
  categoryKey: string;
  titleJa: string;
  titleEn: string;
  isWinner: boolean;
  personName?: string;
}

/**
 * `<ref>` や `<small>` などの注釈を落とす
 *
 * `<ref name="x" />` の自己完結形と `<ref ...>...</ref>` の両方を消す。
 * 残すと `(死後ノミネート)` のような文字列が作品名に混ざる。
 */
function stripAnnotations(raw: string): string {
  return raw
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<small>[\s\S]*?<\/small>/g, '')
    .replace(/\{\{[Ff]lag[^}]*\}\}/g, '')
    .replace(/\{\{[A-Z]{3}\}\}/g, '');
}

/** `'''太字'''` `''斜体''` のマークアップを落とす */
function stripEmphasis(raw: string): string {
  return raw.replace(/'{2,}/g, '');
}

/**
 * `[[link|display]]` → display、`[[link]]` → link、`[[link#section]]` → link
 */
function resolveLink(content: string): string {
  if (content.includes('|')) return content.split('|').pop()!.trim();
  if (content.includes('#')) return content.split('#')[0].trim();
  return content.trim();
}

/**
 * `{{仮リンク|...}}` から表示テキストと英語版記事名を取り出す
 *
 * 2つの書き方がある。
 *   `{{仮リンク|表示テキスト|en|English Title}}`
 *   `{{仮リンク|日本語記事名|label=表示テキスト|en|English Title}}`
 */
function parseKariLink(body: string): { display: string; en?: string } {
  const parts = body.split('|').map((p) => p.trim());
  const labelPart = parts.find((p) => p.startsWith('label='));
  const display = labelPart ? labelPart.slice('label='.length) : parts[0];

  const enIndex = parts.indexOf('en');
  const en = enIndex >= 0 ? parts[enIndex + 1] : undefined;

  return { display, en: en || undefined };
}

/**
 * wikitextの断片を表示テキストに均し、見つかった英語タイトルも返す
 *
 * 英語タイトルは `{{仮リンク|...|en|X}}` と `[[:en:X|...]]` から拾う。
 * 記事が邦題しか持たない作品では取れないため、呼び出し側で邦題に倒す。
 */
function flattenMarkup(raw: string): { text: string; en?: string } {
  let en: string | undefined;

  let text = raw.replace(/\{\{仮リンク\|([^}]+)\}\}/g, (_, body: string) => {
    const parsed = parseKariLink(body);
    if (!en && parsed.en) en = parsed.en;
    return parsed.display;
  });

  text = text.replace(/\[\[([^\]]+)\]\]/g, (_, content: string) => {
    const enPrefix = content.match(/^:en:([^|]+)(?:\|(.*))?$/);
    if (enPrefix) {
      if (!en) en = enPrefix[1];
      return (enPrefix[2] ?? enPrefix[1]).trim();
    }
    return resolveLink(content);
  });

  return { text: text.trim(), en: en ? normalizeEnTitle(en) : undefined };
}

/** 英語版記事名を作品タイトルとして使えるよう整える */
function normalizeEnTitle(raw: string): string {
  return raw.replace(EN_DISAMBIGUATION, '').trim();
}

/**
 * 行から作品名・人名を取り出す
 *
 * 形が2通りある。
 *   作品のみ: `'''『[[ブルータリスト (映画)|ブルータリスト]]』'''`
 *   人名+作品: `'''[[エイドリアン・ブロディ]] –『[[ブルータリスト]]』 ラースロー・トート役'''`
 *
 * 作品名が `『』` で囲まれない行もある。
 *   `[[パメラ・アンダーソン]] – The Last Showgirl - Shelly役`
 * 従来の OpenAI 経路はこの形をハルシネーション扱いで捨てていたため、
 * ここで必ず拾う。
 */
export function parseEntryContent(
  raw: string,
): { titleJa: string; titleEn: string; personName?: string } | null {
  const cleaned = stripEmphasis(stripAnnotations(raw)).trim();
  if (!cleaned) return null;

  const bracketed = cleaned.match(/『([^』]+)』/);

  if (bracketed) {
    const film = flattenMarkup(bracketed[1]);
    if (!film.text) return null;

    const beforeFilm = cleaned.slice(0, cleaned.indexOf('『'));
    return {
      titleJa: film.text,
      titleEn: film.en ?? film.text,
      personName: extractPersonName(beforeFilm),
    };
  }

  // `『』` が無い行。人名と作品名をダッシュで分ける
  const separatorIndex = cleaned.search(NAME_FILM_SEPARATOR);
  if (separatorIndex < 0) {
    const whole = flattenMarkup(cleaned);
    return whole.text
      ? { titleJa: whole.text, titleEn: whole.en ?? whole.text }
      : null;
  }

  const personPart = cleaned.slice(0, separatorIndex);
  const rest = cleaned.slice(separatorIndex + 1).trim();
  const withoutRole = rest.match(ROLE_SUFFIX);
  const film = flattenMarkup((withoutRole ? withoutRole[1] : rest).trim());

  if (!film.text) return null;

  return {
    titleJa: film.text,
    titleEn: film.en ?? film.text,
    personName: extractPersonName(personPart),
  };
}

/**
 * 人名部分を整える。空なら undefined
 *
 * 複数人の受賞（脚本賞の共同脚本など）は `、` 区切りのまま1つの文字列にする。
 * 追跡している部門では単独名がほとんどで、分割して持つ器も無いため。
 */
function extractPersonName(raw: string): string | undefined {
  const { text } = flattenMarkup(stripEmphasis(stripAnnotations(raw)));
  const trimmed = text.replace(/[–—−\-－\s]+$/, '').trim();
  return trimmed || undefined;
}

/** セルから部門のリンク先を取り出す。該当しなければ null */
function findCategoryTarget(cell: string): string | null {
  for (const match of cell.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)) {
    const target = match[1].trim();
    if (target in CATEGORY_TARGET_TO_KEY) return target;
  }
  return null;
}

/** セル内の受賞・ノミネート行を取り出す */
function findEntryLines(cell: string): { isWinner: boolean; body: string }[] {
  const entries: { isWinner: boolean; body: string }[] = [];

  for (const line of cell.split('\n')) {
    const match = line.trim().match(ENTRY_LINE);
    if (!match) continue;
    entries.push({ isWinner: match[1].length === 1, body: match[2] });
  }

  return entries;
}

/**
 * 表の1行をセルに割る
 *
 * `!` 始まりが見出しセル、`|` 始まりがデータセル。`!!` / `||` による
 * 同一行内の区切りは記事で使われていないため扱わない。
 */
function splitCells(row: string): string[] {
  const cells: string[] = [];
  let current: string[] | null = null;

  for (const line of row.split('\n')) {
    if (/^\s*[!|]/.test(line) && !/^\s*\{\||^\s*\|\}/.test(line)) {
      if (current) cells.push(current.join('\n'));
      current = [line.replace(/^\s*[!|]/, '')];
      continue;
    }
    if (current) current.push(line);
  }

  if (current) cells.push(current.join('\n'));
  return cells;
}

/**
 * ゴールデングローブ賞のwikitextから受賞・ノミネートを抽出する
 *
 * 記事の書式は年で変わる。第82回は `{{Award category|…}}` で部門を示し、
 * 同じセルに一覧が続く。第80・81回は見出しセル（`!` 行）が先に並び、
 * その後のデータセルと**列の位置で対応**する。
 *
 * 両方を1つの走査で扱うため、行をセルに割った上で
 *   - セル自身が部門を持つ → そのセルの一覧はその部門（第82回）
 *   - 持たない            → 直前の見出し行の同じ位置の部門（第80・81回）
 * とする。
 *
 * @param wikitext - 「受賞とノミネート」セクションのwikitext
 * @returns 追跡対象の部門に属する受賞・ノミネート
 */
export function parseGoldenGlobesWikitext(
  wikitext: string,
): ParsedAwardEntry[] {
  const results: ParsedAwardEntry[] = [];
  const rows = wikitext.split(ROW_SEPARATOR);

  let pendingTargets: (string | null)[] = [];

  for (const row of rows) {
    const cells = splitCells(row);
    const cellEntries = cells.map(findEntryLines);
    const cellTargets = cells.map(findCategoryTarget);
    const hasEntries = cellEntries.some((entries) => entries.length > 0);

    if (!hasEntries) {
      // 見出しだけの行。部門が1つも無ければ（`! colspan=2 |他` 等）保持を上書きしない
      if (cellTargets.some(Boolean)) pendingTargets = cellTargets;
      continue;
    }

    cells.forEach((_, index) => {
      const target = cellTargets[index] ?? pendingTargets[index] ?? null;
      if (!target) return;

      const categoryKey = CATEGORY_TARGET_TO_KEY[target];
      if (!categoryKey) return;

      for (const entry of cellEntries[index]) {
        const parsed = parseEntryContent(entry.body);
        if (!parsed) continue;

        results.push({
          categoryKey,
          titleJa: parsed.titleJa,
          titleEn: parsed.titleEn,
          isWinner: entry.isWinner,
          ...(parsed.personName ? { personName: parsed.personName } : {}),
        });
      }
    });

    pendingTargets = [];
  }

  return results;
}

/**
 * パース結果を TMDb 解決へ渡す形に変換する
 *
 * `year` は受賞作品の公開年。授賞式の前年に当たる（第82回は2025年開催で
 * 2024年公開作品が対象）。eiga.com 経路が `ceremonyYear - 1` を入れているのと
 * 揃える。実際の公開年との差は `findBestMatch` が当年・翌年の窓で吸収する。
 *
 * @param wikitext - 「受賞とノミネート」セクションのwikitext
 * @param ceremonyYear - 授賞式の年
 */
export function fetchGoldenGlobesFromWikitext(
  wikitext: string,
  ceremonyYear: number,
): OpenAiAwardItem[] {
  const validKeys: ReadonlySet<string> = new Set(
    AWARD_DEFINITIONS.golden_globes.categories.map((c) => c.key),
  );

  return parseGoldenGlobesWikitext(wikitext)
    .filter((entry) => validKeys.has(entry.categoryKey))
    .map((entry) => ({
      title_ja: entry.titleJa,
      title_en: entry.titleEn,
      category: entry.categoryKey,
      is_winner: entry.isWinner,
      year: ceremonyYear - 1,
      ...(entry.personName ? { person_name: entry.personName } : {}),
    }));
}
