/**
 * @jest-environment node
 */

/**
 * ゴールデングローブ賞 wikitextパーサ テスト
 *
 * 入力は日本語Wikipediaの実際のwikitextから抜粋している。
 * 書式が年で変わるため、第82回（`{{Award category}}` 形式）と
 * 第81回（表ヘッダ形式）の両方を固定する。
 */

import {
  fetchGoldenGlobesFromWikitext,
  parseEntryContent,
  parseGoldenGlobesWikitext,
} from './parseGoldenGlobesAwards';

/** 第82回ゴールデングローブ賞（2025年開催）の抜粋 */
const WIKITEXT_82ND = `=== 映画部門 ===
{| class="wikitable" style="width=100%"
| valign="top" style="width=50%" |{{Award category|#F9EFAA|[[ゴールデングローブ賞 映画部門 作品賞 (ドラマ部門)|作品賞 (ドラマ部門)]]}}

* '''『[[ブルータリスト (映画)|ブルータリスト]]』'''
** '''『'''[[名もなき者/A COMPLETE UNKNOWN]]'''』'''
** '''『'''[[教皇選挙 (映画)|教皇選挙]]'''』'''
| valign="top" style="width=50%" |{{Award category|#F9EFAA|[[ゴールデングローブ賞 映画部門 作品賞 (ミュージカル・コメディ部門)|作品賞 (ミュージカル・コメディ部門)]]}}

* '''『[[エミリア・ペレス]]』'''
** '''『'''[[ANORA アノーラ]]'''』'''
|-
| valign="top" style="width=50%" |{{Award category|#F9EFAA|[[ゴールデングローブ賞 アニメ映画賞|アニメ映画賞]]}}

* '''『[[Flow (映画)|Flow]]』'''
** '''『'''[[インサイド・ヘッド2]]'''』'''
| valign="top" style="width=50%" |{{Award category|#F9EFAA|[[ゴールデングローブ賞 映画部門 主演女優賞 (ドラマ部門)|主演女優賞 (ドラマ部門)]]}}

* '''[[フェルナンダ・トーレス]] – 『[[アイム・スティル・ヒア (2024年の映画)|アイム・スティル・ヒア]] 』- エウニセ・パイヴァ役'''
** [[パメラ・アンダーソン]] – The Last Showgirl - Shelly役
** [[アンジェリーナ・ジョリー]]– 『[[私は、マリア・カラス]]』- [[マリア・カラス]]役
** [[ティルダ・スウィントン]]– The Room Next Door - Martha Hunt役
** [[ケイト・ウィンスレット]] – 『[[リー・ミラー 彼女の瞳が映す世界]]』- [[リー・ミラー]]役
|}`;

/** 第81回ゴールデングローブ賞（2024年開催）の抜粋 */
const WIKITEXT_81ST = `===映画===
{| class=wikitable style="width=100%"
|-
! colspan=2 |映画作品賞
|-
! style="width=50%" | [[ゴールデングローブ賞 映画部門 作品賞 (ドラマ部門)|ドラマ部門]]
! style="width=50%" | [[ゴールデングローブ賞 映画部門 作品賞 (ミュージカル・コメディ部門)|ミュージカル・コメディ部門]]
|-
| valign="top" |
* '''『[[オッペンハイマー (映画)|オッペンハイマー]]』'''
** 『[[落下の解剖学]]』
** 『[[キラーズ・オブ・ザ・フラワームーン]]』
| valign="top" |
* '''『[[哀れなるものたち (映画)|哀れなるものたち]]』'''
** 『[[AIR/エア]]』
|-
! colspan=2 |他
|-
! style="width=50%" | [[ゴールデングローブ賞 監督賞|監督賞]]
! style="width=50%" | [[ゴールデングローブ賞 脚本賞|脚本賞]]
|-
| valign="top" |
* '''[[クリストファー・ノーラン]] – 『[[オッペンハイマー (映画)|オッペンハイマー]]』'''
** [[グレタ・ガーウィグ]] – 『[[バービー (映画)|バービー]]』
** {{仮リンク|イェルスキン・フェンドリックス|en|Jerskin Fendrix}} – 『[[哀れなるものたち (映画)|哀れなるものたち]]』 <small>(参考)</small>
| valign="top" |
* '''[[ジュスティーヌ・トリエ]]、[[アルチュール・アラリ]] – 『[[落下の解剖学]]』'''
|}`;

describe('parseEntryContent', () => {
  it('作品のみの行から作品名を取り出す', () => {
    const result = parseEntryContent(
      "'''『[[ブルータリスト (映画)|ブルータリスト]]』'''",
    );
    expect(result).toEqual({
      titleJa: 'ブルータリスト',
      titleEn: 'ブルータリスト',
      personName: undefined,
    });
  });

  it('『』の内側が太字でも作品名を取り出す', () => {
    const result = parseEntryContent(
      "'''『'''[[名もなき者/A COMPLETE UNKNOWN]]'''』'''",
    );
    expect(result?.titleJa).toBe('名もなき者/A COMPLETE UNKNOWN');
  });

  it('人名と作品名を分けて取り出す', () => {
    const result = parseEntryContent(
      "'''[[クリストファー・ノーラン]] – 『[[オッペンハイマー (映画)|オッペンハイマー]]』'''",
    );
    expect(result).toEqual({
      titleJa: 'オッペンハイマー',
      titleEn: 'オッペンハイマー',
      personName: 'クリストファー・ノーラン',
    });
  });

  it('役名が続く行でも作品名だけを取り出す', () => {
    const result = parseEntryContent(
      "'''[[フェルナンダ・トーレス]] – 『[[アイム・スティル・ヒア (2024年の映画)|アイム・スティル・ヒア]] 』- エウニセ・パイヴァ役'''",
    );
    expect(result?.titleJa).toBe('アイム・スティル・ヒア');
    expect(result?.personName).toBe('フェルナンダ・トーレス');
  });

  /**
   * 従来の OpenAI 経路はこの形を落としていた。ハルシネーション検証が
   * `『』` と `[[]]` しか見ておらず、素のテキストの作品名を
   * 「記事に無い」と判定していたため。
   */
  it('『』も[[]]も無い素のテキストの作品名を取り出す', () => {
    const result = parseEntryContent(
      '[[パメラ・アンダーソン]] – The Last Showgirl - Shelly役',
    );
    expect(result).toEqual({
      titleJa: 'The Last Showgirl',
      titleEn: 'The Last Showgirl',
      personName: 'パメラ・アンダーソン',
    });
  });

  it('人名の直後にダッシュが詰まっていても分けられる', () => {
    const result = parseEntryContent(
      '[[ティルダ・スウィントン]]– The Room Next Door - Martha Hunt役',
    );
    expect(result).toEqual({
      titleJa: 'The Room Next Door',
      titleEn: 'The Room Next Door',
      personName: 'ティルダ・スウィントン',
    });
  });

  /**
   * 半角ハイフンを人名区切りに含めると、作品名を途中で割ってしまう。
   * 記事は人名区切りに全角ダッシュ、役名区切りに半角ハイフンを使い分けている。
   */
  it('作品名に含まれる半角ハイフンで分割しない', () => {
    const result = parseEntryContent('** 『[[スパイダーマン]]』'.slice(3));
    expect(result?.titleJa).toBe('スパイダーマン');

    const plain = parseEntryContent('Spider-Man');
    expect(plain?.titleJa).toBe('Spider-Man');
  });

  it('仮リンクから英語タイトルを取り出す', () => {
    const result = parseEntryContent(
      '{{仮リンク|ブラックドッグ (映画)|label=ブラックドッグ|en|Black Dog (2024 film)}}',
    );
    expect(result?.titleJa).toBe('ブラックドッグ');
    expect(result?.titleEn).toBe('Black Dog');
  });

  it('英語版記事へのリンクから英語タイトルを取り出す', () => {
    const result = parseEntryContent(
      "'''[[ミゲル・ゴメス]] – 『[[:en:Grand Tour (film)|Grand Tour]]』'''",
    );
    expect(result?.titleJa).toBe('Grand Tour');
    expect(result?.titleEn).toBe('Grand Tour');
    expect(result?.personName).toBe('ミゲル・ゴメス');
  });

  it('注釈（ref・small・国旗テンプレート）を落とす', () => {
    const result = parseEntryContent(
      "'''『[[オッペンハイマー (映画)|オッペンハイマー]]』'''<ref name=\"x\" /> <small>(死後ノミネート)</small>",
    );
    expect(result?.titleJa).toBe('オッペンハイマー');
  });

  it('空行は null を返す', () => {
    expect(parseEntryContent("'''  '''")).toBeNull();
  });
});

describe('parseGoldenGlobesWikitext', () => {
  describe('第82回（Award categoryテンプレート形式）', () => {
    const entries = parseGoldenGlobesWikitext(WIKITEXT_82ND);

    it('セル自身が持つ部門に一覧を割り当てる', () => {
      const drama = entries.filter((e) => e.categoryKey === 'best_drama');
      expect(drama.map((e) => e.titleJa)).toEqual([
        'ブルータリスト',
        '名もなき者/A COMPLETE UNKNOWN',
        '教皇選挙',
      ]);

      const musical = entries.filter(
        (e) => e.categoryKey === 'best_musical_comedy',
      );
      expect(musical.map((e) => e.titleJa)).toEqual([
        'エミリア・ペレス',
        'ANORA アノーラ',
      ]);
    });

    it('`*` を受賞、`**` をノミネートとして区別する', () => {
      const drama = entries.filter((e) => e.categoryKey === 'best_drama');
      expect(drama.map((e) => e.isWinner)).toEqual([true, false, false]);
    });

    it('追跡対象外の部門（アニメ映画賞）は含めない', () => {
      expect(entries.some((e) => e.titleJa === 'Flow')).toBe(false);
    });

    /**
     * 従来は5件中3件しか取れていなかった。素のテキストの2件が
     * ハルシネーション扱いで捨てられていたため。
     */
    it('主演女優賞（ドラマ部門）を記事どおり5件すべて取る', () => {
      const actress = entries.filter(
        (e) => e.categoryKey === 'best_actress_drama',
      );
      expect(actress.map((e) => e.titleJa)).toEqual([
        'アイム・スティル・ヒア',
        'The Last Showgirl',
        '私は、マリア・カラス',
        'The Room Next Door',
        'リー・ミラー 彼女の瞳が映す世界',
      ]);
    });

    it('演技部門で人名を取る', () => {
      const actress = entries.filter(
        (e) => e.categoryKey === 'best_actress_drama',
      );
      expect(actress.map((e) => e.personName)).toEqual([
        'フェルナンダ・トーレス',
        'パメラ・アンダーソン',
        'アンジェリーナ・ジョリー',
        'ティルダ・スウィントン',
        'ケイト・ウィンスレット',
      ]);
    });

    it('作品賞では人名を持たない', () => {
      const drama = entries.filter((e) => e.categoryKey === 'best_drama');
      expect(drama.every((e) => e.personName === undefined)).toBe(true);
    });
  });

  describe('第81回（表ヘッダ形式）', () => {
    const entries = parseGoldenGlobesWikitext(WIKITEXT_81ST);

    /**
     * この形式は見出しセルが先に並び、その後のデータセルと列の位置で
     * 対応する。順番に処理すると両方の一覧が2列目の部門に入ってしまう。
     */
    it('見出し行とデータ行を列の位置で対応させる', () => {
      const drama = entries.filter((e) => e.categoryKey === 'best_drama');
      expect(drama.map((e) => e.titleJa)).toEqual([
        'オッペンハイマー',
        '落下の解剖学',
        'キラーズ・オブ・ザ・フラワームーン',
      ]);

      const musical = entries.filter(
        (e) => e.categoryKey === 'best_musical_comedy',
      );
      expect(musical.map((e) => e.titleJa)).toEqual([
        '哀れなるものたち',
        'AIR/エア',
      ]);
    });

    it('リンクを持たない見出し行（`! colspan=2 |他`）で対応を崩さない', () => {
      const director = entries.filter((e) => e.categoryKey === 'best_director');
      expect(director.map((e) => e.titleJa)).toEqual([
        'オッペンハイマー',
        'バービー',
        '哀れなるものたち',
      ]);
      expect(director[0].personName).toBe('クリストファー・ノーラン');
    });

    it('追跡対象外の部門（脚本賞）は含めない', () => {
      expect(
        entries.some((e) => e.personName?.includes('ジュスティーヌ・トリエ')),
      ).toBe(false);
    });
  });

  it('表が無いwikitextでは空配列を返す', () => {
    expect(
      parseGoldenGlobesWikitext('== 受賞とノミネート ==\n本文のみ'),
    ).toEqual([]);
  });
});

describe('fetchGoldenGlobesFromWikitext', () => {
  it('TMDb解決に渡す形へ変換する', () => {
    const items = fetchGoldenGlobesFromWikitext(WIKITEXT_82ND, 2025);
    const winner = items.find(
      (i) => i.category === 'best_drama' && i.is_winner,
    );

    expect(winner).toEqual({
      title_ja: 'ブルータリスト',
      title_en: 'ブルータリスト',
      category: 'best_drama',
      is_winner: true,
      year: 2024,
    });
  });

  it('授賞式の前年を公開年に入れる', () => {
    const items = fetchGoldenGlobesFromWikitext(WIKITEXT_82ND, 2025);
    expect(items.every((i) => i.year === 2024)).toBe(true);
  });

  it('演技部門では person_name を持たせる', () => {
    const items = fetchGoldenGlobesFromWikitext(WIKITEXT_82ND, 2025);
    const jolie = items.find((i) => i.title_ja === '私は、マリア・カラス');
    expect(jolie?.person_name).toBe('アンジェリーナ・ジョリー');
  });

  it('AWARD_DEFINITIONSに無い部門キーは混ざらない', () => {
    const items = fetchGoldenGlobesFromWikitext(WIKITEXT_81ST, 2024);
    const keys = new Set(items.map((i) => i.category));
    expect([...keys].sort()).toEqual([
      'best_director',
      'best_drama',
      'best_musical_comedy',
    ]);
  });
});
