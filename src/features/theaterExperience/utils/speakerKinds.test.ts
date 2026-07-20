/**
 * speakerKinds テスト
 */

import type { SpeakerChannel } from '../types';
import {
  getSpeakerKind,
  getSpeakerSize,
  isSpeakerVisible,
  type SpeakerKind,
} from './speakerKinds';

/** 箱の体積（サイズ差の比較用） */
function volume(size: {
  width: number;
  height: number;
  depth: number;
}): number {
  return size.width * size.height * size.depth;
}

describe('getSpeakerKind', () => {
  it('L/R/C/LFE はスクリーンch', () => {
    for (const ch of ['L', 'R', 'C', 'LFE'] as SpeakerChannel[]) {
      expect(getSpeakerKind(ch)).toBe('screen');
    }
  });

  it('LTF/RTF/LTM/RTM/LTR/RTR は天井ch', () => {
    for (const ch of [
      'LTF',
      'RTF',
      'LTM',
      'RTM',
      'LTR',
      'RTR',
    ] as SpeakerChannel[]) {
      expect(getSpeakerKind(ch)).toBe('ceiling');
    }
  });

  it('側壁/後壁ch（LSS/RSS/LSW/RSW/LBS/RBS）はサラウンド', () => {
    for (const ch of [
      'LSS',
      'RSS',
      'LSW',
      'RSW',
      'LBS',
      'RBS',
    ] as SpeakerChannel[]) {
      expect(getSpeakerKind(ch)).toBe('surround');
    }
  });

  it('16ch全てがいずれかの種別に分類される', () => {
    const all: SpeakerChannel[] = [
      'L',
      'R',
      'C',
      'LFE',
      'LSS',
      'RSS',
      'LBS',
      'RBS',
      'LSW',
      'RSW',
      'LTF',
      'RTF',
      'LTM',
      'RTM',
      'LTR',
      'RTR',
    ];
    for (const ch of all) {
      expect(['screen', 'surround', 'ceiling']).toContain(getSpeakerKind(ch));
    }
  });
});

describe('getSpeakerSize', () => {
  it('種別ごとに寸法が異なる（差別化されている）', () => {
    const surround = getSpeakerSize('surround');
    const ceiling = getSpeakerSize('ceiling');
    const screen = getSpeakerSize('screen');
    // 3種別で同一寸法が無い
    const sigs = [surround, ceiling, screen].map(
      (s) => `${s.width}x${s.height}x${s.depth}`,
    );
    expect(new Set(sigs).size).toBe(3);
  });

  it('サラウンドは縦長（高さ＞幅）の小型箱', () => {
    const s = getSpeakerSize('surround');
    expect(s.height).toBeGreaterThan(s.width);
  });

  it('天井は薄いフラッシュ型（高さが幅・奥行より小さい）', () => {
    const c = getSpeakerSize('ceiling');
    expect(c.height).toBeLessThan(c.width);
    expect(c.height).toBeLessThan(c.depth);
  });

  it('サラウンド・天井はスクリーン箱より小型（体積が小さい）', () => {
    const screenVol = volume(getSpeakerSize('screen'));
    expect(volume(getSpeakerSize('surround'))).toBeLessThan(screenVol);
    expect(volume(getSpeakerSize('ceiling'))).toBeLessThan(screenVol);
  });
});

describe('isSpeakerVisible', () => {
  it('スクリーンchは非表示、サラウンド・天井は表示', () => {
    const cases: [SpeakerKind, boolean][] = [
      ['screen', false],
      ['surround', true],
      ['ceiling', true],
    ];
    for (const [kind, visible] of cases) {
      expect(isSpeakerVisible(kind)).toBe(visible);
    }
  });
});
