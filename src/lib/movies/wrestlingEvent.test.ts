/**
 * プロレス興行判定のテスト
 */

import {
  WRESTLING_EVENT_TITLE_PHRASES,
  WRESTLING_KEYWORD_IDS,
  WRESTLING_PROMOTION_KEYWORD_IDS,
} from '@/constants';

import { isWrestlingEvent } from './wrestlingEvent';

const JOSHI_PURORESU = 367574;
const TOKYO_JOSHI = 360477;
const WRESTLING = 5970;
const PRO_WRESTLING = 206441;

describe('isWrestlingEvent', () => {
  describe('団体キーワードによる判定', () => {
    it('joshi puroresu を持つ作品を興行と判定すること', () => {
      expect(
        isWrestlingEvent(
          [WRESTLING, PRO_WRESTLING, JOSHI_PURORESU],
          'STARDOM CINDERELLA TOURNAMENT 2026 ～2回戦～',
        ),
      ).toBe(true);
    });

    it('tokyo joshi pro-wrestling を持つ作品を興行と判定すること', () => {
      expect(
        isWrestlingEvent(
          [TOKYO_JOSHI],
          'ハイパーミサヲプロデュース興行『HYPE!4』',
        ),
      ).toBe(true);
    });

    it('団体キーワードがあればタイトルに興行語が無くても判定すること', () => {
      expect(
        isWrestlingEvent([JOSHI_PURORESU], 'TJPW Texas Stampede in Dallas'),
      ).toBe(true);
    });

    it('定数に列挙された団体キーワードがすべて判定に効くこと', () => {
      for (const id of WRESTLING_PROMOTION_KEYWORD_IDS) {
        expect(isWrestlingEvent([id], '無関係なタイトル')).toBe(true);
      }
    });
  });

  describe('汎用キーワード＋タイトル語による判定', () => {
    it('pro wrestling と興行語の組み合わせで判定すること', () => {
      // 男子団体には団体キーワードが付かないことがある
      expect(
        isWrestlingEvent(
          [WRESTLING, PRO_WRESTLING],
          'DDT Judgement 2026～旗揚げ29周年記念大会5時間スペシャル～',
        ),
      ).toBe(true);
    });

    it.each(WRESTLING_EVENT_TITLE_PHRASES.map((phrase) => [phrase]))(
      '興行語「%s」を含むタイトルを判定すること',
      (phrase) => {
        expect(isWrestlingEvent([PRO_WRESTLING], `テスト${phrase}テスト`)).toBe(
          true,
        );
      },
    );

    it('全角英数を含むタイトルでも判定すること', () => {
      expect(isWrestlingEvent([WRESTLING], 'ＤＤＴ 記念大会')).toBe(true);
    });
  });

  describe('劇映画を誤って判定しない', () => {
    it('pro wrestling だけを持つ劇映画を判定しないこと', () => {
      // 『レスラー』(2008) は pro wrestling を持つ
      expect(isWrestlingEvent([PRO_WRESTLING], 'レスラー')).toBe(false);
    });

    it('wrestling だけを持つ劇映画を判定しないこと', () => {
      // 『ファイティング・ファミリー』『ナチョ・リブレ』は wrestling を持つ
      expect(isWrestlingEvent([WRESTLING], 'ファイティング・ファミリー')).toBe(
        false,
      );
      expect(isWrestlingEvent([WRESTLING], 'ナチョ・リブレ 覆面の神様')).toBe(
        false,
      );
    });

    it('興行語を含んでもレスリング系キーワードが無ければ判定しないこと', () => {
      // 『エヴァンゲリオン放送30周年記念特別興行』はタイトルに「興行」を含む
      expect(
        isWrestlingEvent([], 'エヴァンゲリオン放送30周年記念特別興行'),
      ).toBe(false);
    });

    it('キーワードもタイトル語も無い作品を判定しないこと', () => {
      expect(isWrestlingEvent([18, 28], '通常の映画')).toBe(false);
    });

    it('キーワードが空配列でも落ちないこと', () => {
      expect(isWrestlingEvent([], '大会')).toBe(false);
    });
  });

  describe('定数の整合性', () => {
    it('汎用キーワードと団体キーワードが重複していないこと', () => {
      const promotion: readonly number[] = WRESTLING_PROMOTION_KEYWORD_IDS;
      for (const id of WRESTLING_KEYWORD_IDS) {
        expect(promotion).not.toContain(id);
      }
    });
  });
});
