/**
 * wikitext のマークアップを表示テキストへ均すユーティリティ
 *
 * 賞ごとのパーサ（`parseGoldenGlobesAwards` / `parseCannesAwards`）が共有する。
 * 記事の構造は賞で違うが、リンク・テンプレート・注釈の書き方は共通のため。
 */

/** 英語版記事名から曖昧さ回避の括弧を落とす（`Black Dog (2024 film)` → `Black Dog`） */
const EN_DISAMBIGUATION =
  /\s*\((?:[^()]*\b(?:film|movie)\b[^()]*|\d{4})\)\s*$/i;

/**
 * `<ref>` や `<small>` などの注釈・装飾テンプレートを落とす
 *
 * `<ref name="x" />` の自己完結形と `<ref ...>...</ref>` の両方を消す。
 * 残すと `(死後ノミネート)` や国名が作品名に混ざる。
 */
export function stripAnnotations(raw: string): string {
  return raw
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<small>[\s\S]*?<\/small>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{[Ff]lag[^}]*\}\}/g, '')
    .replace(/\{\{[A-Z]{3}\}\}/g, '');
}

/** `'''太字'''` `''斜体''` のマークアップを落とす */
export function stripEmphasis(raw: string): string {
  return raw.replace(/'{2,}/g, '');
}

/**
 * `[[link|display]]` → display、`[[link]]` → link、`[[link#section]]` → link
 */
export function resolveLink(content: string): string {
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
 *
 * `label=` が空（`|label=`）のこともあるため、空なら第1引数に倒す。
 */
export function parseKariLink(body: string): { display: string; en?: string } {
  const parts = body.split('|').map((p) => p.trim());
  const labelPart = parts.find((p) => p.startsWith('label='));
  const label = labelPart?.slice('label='.length);
  const display = label || parts[0];

  const enIndex = parts.indexOf('en');
  const en = enIndex >= 0 ? parts[enIndex + 1] : undefined;

  return { display, en: en || undefined };
}

/** 英語版記事名を作品タイトルとして使えるよう整える */
export function normalizeEnTitle(raw: string): string {
  return raw.replace(EN_DISAMBIGUATION, '').trim();
}

/**
 * wikitextの断片を表示テキストに均し、見つかった英語タイトルも返す
 *
 * 英語タイトルは `{{仮リンク|...|en|X}}` と `[[:en:X|...]]` から拾う。
 * 邦題が未定の作品は記事でも原題のまま書かれることがあり、TMDbでは
 * 英題でしか当たらないため、取れるときは拾っておく。
 */
export function flattenMarkup(raw: string): { text: string; en?: string } {
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
