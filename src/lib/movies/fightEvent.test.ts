/**
 * 格闘技・プロレス興行判定のテスト
 */

import {
  COMBAT_SPORTS_EVENT_KEYWORD_IDS,
  COMBAT_SPORTS_EVENT_TITLE_PHRASES,
  COMBAT_SPORTS_KEYWORD_IDS,
  WRESTLING_EVENT_TITLE_PHRASES,
  WRESTLING_KEYWORD_IDS,
  WRESTLING_PROMOTION_KEYWORD_IDS,
} from '@/constants';

import { isFightEvent } from './fightEvent';

const JOSHI_PURORESU = 367574;
const TOKYO_JOSHI = 360477;
const WRESTLING = 5970;
const PRO_WRESTLING = 206441;
const COMBAT_SPORTS = 192790;
const JMMA = 361498;
const JKICK = 361499;
const MMA = 9917;
const KICKBOXING = 18111;

describe('isFightEvent', () => {
  describe('団体キーワードによる判定', () => {
    it('joshi puroresu を持つ作品を興行と判定すること', () => {
      expect(
        isFightEvent(
          [WRESTLING, PRO_WRESTLING, JOSHI_PURORESU],
          'STARDOM CINDERELLA TOURNAMENT 2026 ～2回戦～',
        ),
      ).toBe(true);
    });

    it('tokyo joshi pro-wrestling を持つ作品を興行と判定すること', () => {
      expect(
        isFightEvent([TOKYO_JOSHI], 'ハイパーミサヲプロデュース興行『HYPE!4』'),
      ).toBe(true);
    });

    it('団体キーワードがあればタイトルに興行語が無くても判定すること', () => {
      expect(
        isFightEvent([JOSHI_PURORESU], 'TJPW Texas Stampede in Dallas'),
      ).toBe(true);
    });

    it('定数に列挙された団体キーワードがすべて判定に効くこと', () => {
      for (const id of WRESTLING_PROMOTION_KEYWORD_IDS) {
        expect(isFightEvent([id], '無関係なタイトル')).toBe(true);
      }
    });
  });

  describe('汎用キーワード＋タイトル語による判定', () => {
    it('pro wrestling と興行語の組み合わせで判定すること', () => {
      // 男子団体には団体キーワードが付かないことがある
      expect(
        isFightEvent(
          [WRESTLING, PRO_WRESTLING],
          'DDT Judgement 2026～旗揚げ29周年記念大会5時間スペシャル～',
        ),
      ).toBe(true);
    });

    it.each(WRESTLING_EVENT_TITLE_PHRASES.map((phrase) => [phrase]))(
      '興行語「%s」を含むタイトルを判定すること',
      (phrase) => {
        expect(isFightEvent([PRO_WRESTLING], `テスト${phrase}テスト`)).toBe(
          true,
        );
      },
    );

    it('全角英数を含むタイトルでも判定すること', () => {
      expect(isFightEvent([WRESTLING], 'ＤＤＴ 記念大会')).toBe(true);
    });
  });

  describe('劇映画を誤って判定しない', () => {
    it('pro wrestling だけを持つ劇映画を判定しないこと', () => {
      // 『レスラー』(2008) は pro wrestling を持つ
      expect(isFightEvent([PRO_WRESTLING], 'レスラー')).toBe(false);
    });

    it('wrestling だけを持つ劇映画を判定しないこと', () => {
      // 『ファイティング・ファミリー』『ナチョ・リブレ』は wrestling を持つ
      expect(isFightEvent([WRESTLING], 'ファイティング・ファミリー')).toBe(
        false,
      );
      expect(isFightEvent([WRESTLING], 'ナチョ・リブレ 覆面の神様')).toBe(
        false,
      );
    });

    it('興行語を含んでもレスリング系キーワードが無ければ判定しないこと', () => {
      // 『エヴァンゲリオン放送30周年記念特別興行』はタイトルに「興行」を含む
      expect(isFightEvent([], 'エヴァンゲリオン放送30周年記念特別興行')).toBe(
        false,
      );
    });

    it('キーワードもタイトル語も無い作品を判定しないこと', () => {
      expect(isFightEvent([18, 28], '通常の映画')).toBe(false);
    });

    it('キーワードが空配列でも落ちないこと', () => {
      expect(isFightEvent([], '大会')).toBe(false);
    });
  });

  describe('格闘技の興行キーワードによる判定', () => {
    it('combat sports を持つ興行を判定すること', () => {
      // 実測: RIZIN 55 は combat sports / jmma / jkick / mma / kickboxing を持つ
      expect(
        isFightEvent([MMA, KICKBOXING, COMBAT_SPORTS, JMMA, JKICK], 'RIZIN 55'),
      ).toBe(true);
    });

    it('jmma だけでも判定すること', () => {
      expect(isFightEvent([JMMA], '無関係なタイトル')).toBe(true);
    });

    it('jkick だけでも判定すること', () => {
      // 実測: Krush 72 は jkick を持つ
      expect(isFightEvent([JKICK], 'Krush 72')).toBe(true);
    });

    it('定数に列挙された興行キーワードがすべて判定に効くこと', () => {
      for (const id of COMBAT_SPORTS_EVENT_KEYWORD_IDS) {
        expect(isFightEvent([id], '無関係なタイトル')).toBe(true);
      }
    });
  });

  describe('格闘技の汎用キーワード＋興行名による判定', () => {
    it.each(COMBAT_SPORTS_EVENT_TITLE_PHRASES.map((phrase) => [phrase]))(
      '興行名「%s」を含むタイトルを判定すること',
      (phrase) => {
        expect(isFightEvent([MMA], `${phrase} 300`)).toBe(true);
      },
    );

    it('小文字の興行名でも判定すること', () => {
      expect(isFightEvent([MMA], 'rizin 55')).toBe(true);
    });

    it('全角の興行名でも判定すること', () => {
      expect(isFightEvent([KICKBOXING], 'ＲＩＺＩＮ ５５')).toBe(true);
    });
  });

  describe('格闘技の劇映画を誤って判定しない', () => {
    it('mma だけを持つ劇映画を判定しないこと', () => {
      // 実測: 『ウォーリアー』『スマッシング・マシーン』は mma を持つ
      expect(isFightEvent([MMA], 'ウォーリアー')).toBe(false);
      expect(isFightEvent([MMA], 'スマッシング・マシーン')).toBe(false);
    });

    it('kickboxing だけを持つ劇映画を判定しないこと', () => {
      // 実測: 『キックボクサー』等のアクション映画が kickboxing を持つ
      expect(
        isFightEvent([KICKBOXING], 'キックボクサー リジェネレーション'),
      ).toBe(false);
    });

    it('興行名を含んでも格闘技キーワードが無ければ判定しないこと', () => {
      expect(isFightEvent([], 'UFOの街')).toBe(false);
      expect(isFightEvent([18, 28], 'RIZINという名の映画')).toBe(false);
    });
  });

  describe('定数の整合性', () => {
    it('汎用キーワードと団体キーワードが重複していないこと', () => {
      const promotion: readonly number[] = WRESTLING_PROMOTION_KEYWORD_IDS;
      for (const id of WRESTLING_KEYWORD_IDS) {
        expect(promotion).not.toContain(id);
      }
    });

    it('格闘技の汎用キーワードと興行キーワードが重複していないこと', () => {
      const eventIds: readonly number[] = COMBAT_SPORTS_EVENT_KEYWORD_IDS;
      for (const id of COMBAT_SPORTS_KEYWORD_IDS) {
        expect(eventIds).not.toContain(id);
      }
    });
  });
});
