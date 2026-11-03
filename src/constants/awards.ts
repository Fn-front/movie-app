/**
 * 受賞作品関連の定数
 */

/**
 * 賞の部門定義
 */
export interface AwardCategory {
  /** 部門キー */
  key: string;
  /** 表示名 */
  label: string;
}

/**
 * 賞の定義
 */
export interface AwardDefinition {
  /** 賞名（表示用） */
  label: string;
  /** 授賞式の月 */
  month: number;
  /** Wikipedia記事タイトルのテンプレート（{edition}が回数、{year}が年に置換される） */
  wikipediaTemplate: string;
  /**
   * 回数計算の基準年。`edition = 開催年 - firstEditionYear` で使う
   *
   * 「第1回の開催年」ではなく**その前年**にあたる。アカデミー賞の第1回は
   * 1929年だが、ここは 1928 を持つ。
   *
   * ⚠️ 中止年がある賞は差が一定にならない。カンヌは1948・1950が中止のため、
   *    この式が成立するのは第4回（1951年）以降。下限は
   *    `AWARD_SYNC_MIN_YEAR`（`./awardSync.ts`）で別に持つ。
   */
  firstEditionYear: number;
  /** 部門一覧 */
  categories: readonly AwardCategory[];
}

/**
 * 賞名のキー型
 */
export type AwardName = keyof typeof AWARD_DEFINITIONS;

/**
 * 賞の定義マスタ
 */
export const AWARD_DEFINITIONS = {
  academy_awards: {
    label: 'アカデミー賞',
    month: 3,
    wikipediaTemplate: '第{edition}回アカデミー賞',
    firstEditionYear: 1928,
    categories: [
      { key: 'best_picture', label: '作品賞' },
      { key: 'best_director', label: '監督賞' },
      { key: 'best_actor', label: '主演男優賞' },
      { key: 'best_actress', label: '主演女優賞' },
      { key: 'best_supporting_actor', label: '助演男優賞' },
      { key: 'best_supporting_actress', label: '助演女優賞' },
    ],
  },
  japan_academy_awards: {
    label: '日本アカデミー賞',
    month: 3,
    wikipediaTemplate: '第{edition}回日本アカデミー賞',
    firstEditionYear: 1977,
    categories: [
      { key: 'best_picture', label: '最優秀作品賞' },
      { key: 'best_director', label: '最優秀監督賞' },
      { key: 'best_actor', label: '最優秀主演男優賞' },
      { key: 'best_actress', label: '最優秀主演女優賞' },
      { key: 'best_supporting_actor', label: '最優秀助演男優賞' },
      { key: 'best_supporting_actress', label: '最優秀助演女優賞' },
      { key: 'best_newcomer', label: '新人俳優賞' },
    ],
  },
  cannes: {
    label: 'カンヌ映画祭',
    month: 5,
    /**
     * ⚠️ 年ベース（`{year}年のカンヌ国際映画祭`）にしないこと。
     *    その名前の記事は日本語Wikipediaに存在せず、記事取得が必ず失敗して
     *    同期が常に0件で終わる（実際に長期間その状態だった）。
     *    実在するのは回数ベースの `第{edition}回カンヌ国際映画祭`。
     */
    wikipediaTemplate: '第{edition}回カンヌ国際映画祭',
    firstEditionYear: 1947,
    categories: [
      { key: 'palme_dor', label: 'パルムドール' },
      { key: 'grand_prix', label: 'グランプリ' },
      { key: 'jury_prize', label: '審査員賞' },
      { key: 'best_director', label: '監督賞' },
      { key: 'best_actor', label: '男優賞' },
      { key: 'best_actress', label: '女優賞' },
      { key: 'camera_dor', label: 'カメラドール（新人監督賞）' },
      { key: 'un_certain_regard', label: 'ある視点部門賞' },
    ],
  },
  golden_globes: {
    label: 'ゴールデングローブ賞',
    month: 1,
    wikipediaTemplate: '第{edition}回ゴールデングローブ賞',
    firstEditionYear: 1943,
    categories: [
      { key: 'best_drama', label: '作品賞（ドラマ部門）' },
      {
        key: 'best_musical_comedy',
        label: '作品賞（ミュージカル・コメディ部門）',
      },
      { key: 'best_director', label: '監督賞' },
      { key: 'best_actor_drama', label: '主演男優賞（ドラマ部門）' },
      { key: 'best_actress_drama', label: '主演女優賞（ドラマ部門）' },
      {
        key: 'best_actor_musical_comedy',
        label: '主演男優賞（ミュージカル・コメディ部門）',
      },
      {
        key: 'best_actress_musical_comedy',
        label: '主演女優賞（ミュージカル・コメディ部門）',
      },
      { key: 'best_supporting_actor', label: '助演男優賞' },
      { key: 'best_supporting_actress', label: '助演女優賞' },
    ],
  },
} as const satisfies Record<string, AwardDefinition>;

/**
 * OpenAI からの受賞作品取得リトライ最大回数
 */
export const AWARDS_MAX_RETRIES = 3;

/**
 * 受賞作品の公開年許容差（この差を超える場合は前年に補正）
 *
 * ⚠️ これは OpenAI が返した `item.year` と**授賞式の年**を突き合わせて
 *    ソースデータの年を健全化する閾値で、Wikipedia+OpenAI 経路でしか使わない。
 *    TMDb の `release_date` との突き合わせ幅（`findBestMatch` の当年・翌年）
 *    とは対象が違う。名前が似ているが流用しないこと。
 */
export const AWARDS_YEAR_MATCH_TOLERANCE = 2;

/**
 * 1回の検索で、タイトル照合まで確かめる候補の上限
 *
 * 公開年が当年・翌年に入る候補を TMDb の関連度順に見ていき、タイトルが
 * 一致した最初の1件を採る。照合には別名の問い合わせが要ることがあるため、
 * 無制限に見ると1作品あたりの TMDb 呼び出しが検索結果の件数（最大20）× 検索
 * 4段階まで膨らむ。
 *
 * 3 にしている根拠: 実測した誤同定はいずれも「正解が候補に存在しない」ケースで、
 * 正解が含まれる場合は関連度1位だった。4件目以降まで見て正解が現れる例は
 * 確認できていない。
 */
export const AWARD_TITLE_MATCH_MAX_CANDIDATES = 3;

/**
 * CRON同期の対象外とする賞
 */
export const AWARDS_EXCLUDED = ['japan_academy_awards'] as const;

/**
 * 受賞年バリデーション範囲
 */
export const AWARD_YEAR_RANGE = {
  MIN: 1900,
  MAX: 2100,
} as const;

/**
 * 受賞作品ページのメッセージ
 */
export const AWARDS_MESSAGES = {
  /** ページタイトル */
  PAGE_TITLE: '受賞作品',
  /** データなし */
  NO_DATA: '選択した年度の受賞作品データはまだありません。',
  /** 取得エラー */
  FETCH_ERROR: '受賞作品データの取得に失敗しました。',
} as const;
