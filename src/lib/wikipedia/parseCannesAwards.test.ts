/**
 * @jest-environment node
 */

/**
 * カンヌ映画祭 wikitextパーサ テスト
 *
 * 入力は日本語Wikipediaの実際のwikitextから抜粋している。
 */

import {
  fetchCannesFromWikitext,
  parseCannesAwardLine,
  parseCannesWikitext,
} from './parseCannesAwards';

/** 第77回カンヌ国際映画祭（2024年開催）の抜粋 */
const WIKITEXT_77TH = `==受賞作品==
=== 公式選出 ===
; コンペティション<ref name="77th Cannes winners" />
* [[パルム・ドール]] - 『[[ANORA アノーラ]]』（[[ショーン・ベイカー]]監督）
* [[カンヌ国際映画祭 審査員特別グランプリ|グランプリ]] - 『[[私たちが光と想うすべて]]』（[[パヤル・カパーリヤー]]監督）
* [[カンヌ国際映画祭 監督賞|監督賞]] - [[ミゲル・ゴメス]]（『''[[:en:Grand Tour (film)|Grand Tour]]''』）
* [[カンヌ国際映画祭 女優賞|女優賞]] - {{仮リンク|アドリアナ・ラパス|en|Adriana Paz}}、[[ゾーイ・サルダナ]]、{{仮リンク|カルラ・ソフィア・ガスコン|en|Karla Sofía Gascón}}、[[セレーナ・ゴメス]]（『エミリア・ペレス』）
* [[カンヌ国際映画祭 脚本賞|脚本賞]] - [[コラリー・ファルジャ]]（『[[サブスタンス (映画)|サブスタンス]]』）

; ある視点<ref name="77th Cannes winners" />
* ある視点賞 - 『{{仮リンク|ブラックドッグ (映画)|label=ブラックドッグ|en|Black Dog (2024 film)}}』（{{仮リンク|クワン・フー|en|Guan Hu}}監督）
* ある視点審査員賞 - 『''[[:en:The Story of Souleymane|L'Histoire de Souleymane]]''』（{{仮リンク|ボリス・ロジキン|en|Boris Lojkine}}監督）

; ゴールデン・シネマ<ref name="77th Cannes winners" />
* [[カメラ・ドール]] - {{仮リンク|ハーフダン・ウルマン・トンデル|en|Halfdan Ullmann Tøndel}} (『''[[:en:Armand (film)|Armand]]''』)
** スペシャル・メンション - {{仮リンク|ハーフダン・ウルマン・トンデル|en|Halfdan Ullmann Tøndel}} (『''Mongrel''』)

; 短編映画<ref name="77th Cannes winners" />
* 短編映画パルム・ドール - 『''[[:en:The Man Who Could Not Remain Silent|Čovjek koji nije mogao šutjeti]]''』 (ネボイシャ・スリイェプチェヴィッチ監督)

=== 独立選出 ===
; 監督週間
* ヨーロッパ・シネマ・レーベル賞 - 『別の映画』（別の監督監督）

=== 独立賞 ===
; 国際映画批評家連盟賞
* コンペティション – 『まったく別の映画』（誰か監督）`;

/** 第78回カンヌ国際映画祭（2025年開催）の抜粋。審査員賞が同点受賞 */
const WIKITEXT_78TH = `==受賞作品==
=== 公式選出 ===
; コンペティション
* [[パルム・ドール]] - 『[[シンプル・アクシデント/偶然]]』（[[ジャファール・パナヒ]]監督）
* [[カンヌ国際映画祭 審査員賞|審査員賞]] - 『[[シラート]]』（{{仮リンク|オリヴァー・ラクセ|en|Oliver Laxe}}監督）、『[[落下音 (映画)|落下音]]』（{{仮リンク|マーシャ・シリンスキー|en|Mascha Schilinski}}監督）
* [[カンヌ国際映画祭 監督賞|監督賞]] - [[クレベール・メンドンサ・フィリオ]]（『{{仮リンク|シークレット・エージェント (2025年の映画)|label=シークレット・エージェント|en|The Secret Agent (2025 film)}}』）

; ゴールデン・シネマ
* [[カメラ・ドール]] - ハサン・ハディ (『''[[:en:The President's Cake|مملكة القصب]]''』)`;

describe('parseCannesAwardLine', () => {
  it('作品→監督の並びから作品名と監督名を取り出す', () => {
    const result = parseCannesAwardLine(
      '『[[ANORA アノーラ]]』（[[ショーン・ベイカー]]監督）',
    );
    expect(result).toEqual([
      {
        titleJa: 'ANORA アノーラ',
        titleEn: 'ANORA アノーラ',
        personName: 'ショーン・ベイカー',
      },
    ]);
  });

  it('人名→作品の並びから作品名と人名を取り出す', () => {
    const result = parseCannesAwardLine(
      "[[ミゲル・ゴメス]]（『''[[:en:Grand Tour (film)|Grand Tour]]''』）",
    );
    expect(result).toEqual([
      {
        titleJa: 'Grand Tour',
        titleEn: 'Grand Tour',
        personName: 'ミゲル・ゴメス',
      },
    ]);
  });

  /**
   * 1作品に受賞者が複数いるケース。`、` で機械的に分割すると
   * 受賞者の数だけ作品が増えてしまう。
   */
  it('連名の受賞者は1件にまとめる', () => {
    const result = parseCannesAwardLine(
      '{{仮リンク|アドリアナ・ラパス|en|Adriana Paz}}、[[ゾーイ・サルダナ]]、{{仮リンク|カルラ・ソフィア・ガスコン|en|Karla Sofía Gascón}}、[[セレーナ・ゴメス]]（『エミリア・ペレス』）',
    );
    expect(result).toHaveLength(1);
    expect(result[0].titleJa).toBe('エミリア・ペレス');
    expect(result[0].personName).toBe(
      'アドリアナ・ラパス、ゾーイ・サルダナ、カルラ・ソフィア・ガスコン、セレーナ・ゴメス',
    );
  });

  it('同点受賞は作品の数だけ返す', () => {
    const result = parseCannesAwardLine(
      '『[[シラート]]』（{{仮リンク|オリヴァー・ラクセ|en|Oliver Laxe}}監督）、『[[落下音 (映画)|落下音]]』（{{仮リンク|マーシャ・シリンスキー|en|Mascha Schilinski}}監督）',
    );
    expect(result).toEqual([
      {
        titleJa: 'シラート',
        titleEn: 'シラート',
        personName: 'オリヴァー・ラクセ',
      },
      {
        titleJa: '落下音',
        titleEn: '落下音',
        personName: 'マーシャ・シリンスキー',
      },
    ]);
  });

  it('半角括弧の人名→作品でも取り出す', () => {
    const result = parseCannesAwardLine(
      "{{仮リンク|ハーフダン・ウルマン・トンデル|en|Halfdan Ullmann Tøndel}} (『''[[:en:Armand (film)|Armand]]''』)",
    );
    expect(result).toEqual([
      {
        titleJa: 'Armand',
        titleEn: 'Armand',
        personName: 'ハーフダン・ウルマン・トンデル',
      },
    ]);
  });

  /**
   * 邦題未定の作品は原題のまま書かれる。TMDbでは英題でしか当たらないため、
   * 別名から英題を拾えないと解決できない。
   */
  it('原題表記の作品から英題を拾う', () => {
    const result = parseCannesAwardLine(
      "ハサン・ハディ (『''[[:en:The President's Cake|مملكة القصب]]''』)",
    );
    expect(result[0].titleJa).toBe('مملكة القصب');
    expect(result[0].titleEn).toBe("The President's Cake");
  });

  it('作品名が無い行は何も返さない', () => {
    expect(parseCannesAwardLine('該当なし')).toEqual([]);
  });
});

describe('parseCannesWikitext', () => {
  const entries = parseCannesWikitext(WIKITEXT_77TH);

  it('追跡対象の部門を抽出する', () => {
    expect(
      entries.map((e) => [e.categoryKey, e.titleJa, e.personName]),
    ).toEqual([
      ['palme_dor', 'ANORA アノーラ', 'ショーン・ベイカー'],
      ['grand_prix', '私たちが光と想うすべて', 'パヤル・カパーリヤー'],
      ['best_director', 'Grand Tour', 'ミゲル・ゴメス'],
      [
        'best_actress',
        'エミリア・ペレス',
        'アドリアナ・ラパス、ゾーイ・サルダナ、カルラ・ソフィア・ガスコン、セレーナ・ゴメス',
      ],
      ['un_certain_regard', 'ブラックドッグ', 'クワン・フー'],
      ['camera_dor', 'Armand', 'ハーフダン・ウルマン・トンデル'],
    ]);
  });

  /**
   * 部分一致で引くと `短編映画パルム・ドール` が `パルム・ドール` に、
   * `ある視点審査員賞` が `ある視点賞` に化ける。
   */
  it('賞名が前方一致・部分一致する別の賞を取り込まない', () => {
    expect(entries.filter((e) => e.categoryKey === 'palme_dor')).toHaveLength(
      1,
    );
    expect(
      entries.filter((e) => e.categoryKey === 'un_certain_regard'),
    ).toHaveLength(1);
  });

  it('スペシャル・メンション（`**` 行）は受賞として扱わない', () => {
    expect(entries.some((e) => e.titleJa === 'Mongrel')).toBe(false);
  });

  it('追跡対象外の部門（脚本賞）は含めない', () => {
    expect(entries.some((e) => e.titleJa === 'サブスタンス')).toBe(false);
  });

  it('独立選出・独立賞のセクションは対象外にする', () => {
    expect(entries.some((e) => e.titleJa === '別の映画')).toBe(false);
    expect(entries.some((e) => e.titleJa === 'まったく別の映画')).toBe(false);
  });

  it('公式選出の見出しが無い場合も賞名の完全一致で抽出できる', () => {
    const withoutHeading = `; コンペティション
* [[パルム・ドール]] - 『[[テスト映画]]』（[[テスト監督]]監督）`;
    expect(parseCannesWikitext(withoutHeading)).toEqual([
      {
        categoryKey: 'palme_dor',
        titleJa: 'テスト映画',
        titleEn: 'テスト映画',
        personName: 'テスト監督',
      },
    ]);
  });

  it('同点受賞を両方とも抽出する', () => {
    const jury = parseCannesWikitext(WIKITEXT_78TH).filter(
      (e) => e.categoryKey === 'jury_prize',
    );
    expect(jury.map((e) => e.titleJa)).toEqual(['シラート', '落下音']);
  });
});

describe('fetchCannesFromWikitext', () => {
  /**
   * カンヌの記事はノミネートを載せない。従来の OpenAI 経路は
   * 「ノミネートを漏れなく」というプロンプトに引きずられ、
   * 他部門の受賞作をノミネートとして埋めていた。
   */
  it('すべて受賞として返す', () => {
    const items = fetchCannesFromWikitext(WIKITEXT_77TH, 2024);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.is_winner)).toBe(true);
  });

  /**
   * カンヌは開催年と同年の作品が対象。授賞式の前年を入れる
   * アカデミー賞・ゴールデングローブ賞とは違う。
   */
  it('公開年に開催年をそのまま入れる', () => {
    const items = fetchCannesFromWikitext(WIKITEXT_77TH, 2024);
    expect(items.every((i) => i.year === 2024)).toBe(true);
  });

  it('AWARD_DEFINITIONSに無い部門キーは混ざらない', () => {
    const keys = new Set(
      fetchCannesFromWikitext(WIKITEXT_77TH, 2024).map((i) => i.category),
    );
    expect([...keys].sort()).toEqual([
      'best_actress',
      'best_director',
      'camera_dor',
      'grand_prix',
      'palme_dor',
      'un_certain_regard',
    ]);
  });

  it('person_name を持たせる', () => {
    const items = fetchCannesFromWikitext(WIKITEXT_77TH, 2024);
    const cameraDor = items.find((i) => i.category === 'camera_dor');
    expect(cameraDor?.person_name).toBe('ハーフダン・ウルマン・トンデル');
  });
});
