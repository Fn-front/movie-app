/**
 * 受賞作品定数 テスト
 */

import { AWARD_DEFINITIONS, AWARDS_MESSAGES } from './awards';

describe('AWARD_DEFINITIONS', () => {
  it('4つの賞が定義されている', () => {
    const awardNames = Object.keys(AWARD_DEFINITIONS);
    expect(awardNames).toHaveLength(4);
    expect(awardNames).toEqual([
      'academy_awards',
      'japan_academy_awards',
      'cannes',
      'golden_globes',
    ]);
  });

  it('各賞にlabel, month, categoriesが定義されている', () => {
    for (const [, definition] of Object.entries(AWARD_DEFINITIONS)) {
      expect(definition).toHaveProperty('label');
      expect(definition).toHaveProperty('month');
      expect(definition).toHaveProperty('categories');
      expect(typeof definition.label).toBe('string');
      expect(typeof definition.month).toBe('number');
      expect(definition.month).toBeGreaterThanOrEqual(1);
      expect(definition.month).toBeLessThanOrEqual(12);
      expect(Array.isArray(definition.categories)).toBe(true);
      expect(definition.categories.length).toBeGreaterThan(0);
    }
  });

  it('各カテゴリにkeyとlabelが定義されている', () => {
    for (const [, definition] of Object.entries(AWARD_DEFINITIONS)) {
      for (const category of definition.categories) {
        expect(typeof category.key).toBe('string');
        expect(typeof category.label).toBe('string');
        expect(category.key.length).toBeGreaterThan(0);
        expect(category.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('アカデミー賞は3月で6部門', () => {
    expect(AWARD_DEFINITIONS.academy_awards.label).toBe('アカデミー賞');
    expect(AWARD_DEFINITIONS.academy_awards.month).toBe(3);
    expect(AWARD_DEFINITIONS.academy_awards.categories).toHaveLength(6);
  });

  it('日本アカデミー賞は3月で7部門', () => {
    expect(AWARD_DEFINITIONS.japan_academy_awards.label).toBe(
      '日本アカデミー賞',
    );
    expect(AWARD_DEFINITIONS.japan_academy_awards.month).toBe(3);
    expect(AWARD_DEFINITIONS.japan_academy_awards.categories).toHaveLength(7);
  });

  it('カンヌ映画祭は5月で8部門', () => {
    expect(AWARD_DEFINITIONS.cannes.label).toBe('カンヌ映画祭');
    expect(AWARD_DEFINITIONS.cannes.month).toBe(5);
    expect(AWARD_DEFINITIONS.cannes.categories).toHaveLength(8);
  });

  it('ゴールデングローブ賞は1月で9部門', () => {
    expect(AWARD_DEFINITIONS.golden_globes.label).toBe('ゴールデングローブ賞');
    expect(AWARD_DEFINITIONS.golden_globes.month).toBe(1);
    expect(AWARD_DEFINITIONS.golden_globes.categories).toHaveLength(9);
  });

  it('各賞内でカテゴリキーが重複していない', () => {
    for (const [, definition] of Object.entries(AWARD_DEFINITIONS)) {
      const keys = definition.categories.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('AWARDS_MESSAGES', () => {
  it('必要なメッセージが定義されている', () => {
    expect(AWARDS_MESSAGES.PAGE_TITLE).toBe('受賞作品');
    expect(typeof AWARDS_MESSAGES.NO_DATA).toBe('string');
    expect(typeof AWARDS_MESSAGES.FETCH_ERROR).toBe('string');
  });
});
