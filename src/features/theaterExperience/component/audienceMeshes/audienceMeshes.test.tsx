/**
 * AudienceMeshes テスト
 *
 * R3F メッシュ層は jsdom（WebGL 非対応）では実行時の振る舞いを検証できないため、
 * 既存の `seatMeshes.test.tsx` と同じ方針でエクスポートと props 形状のみを確認する。
 * 配置の判断ロジックは `utils/occupancy`（体格バリアント・占有判定）と
 * `utils/rowCurve`（弧の接線向き）に切り出してあり、そちらで網羅的にテストしている。
 */

import type { TheaterSeat } from '../../types';
import { getInteriorTheme } from '../../utils/theaterPalette';

import { AudienceMeshes } from './audienceMeshes';

const seatAt = (id: string): TheaterSeat => ({
  id,
  row_label: 'A',
  seat_number: 1,
  position_x: 0,
  position_y: 0,
  position_z: 0,
  seat_type: 'standard',
});

describe('AudienceMeshes', () => {
  it('エクスポートが正しく定義されている', () => {
    expect(AudienceMeshes).toBeDefined();
    expect(AudienceMeshes.displayName).toBe('AudienceMeshes');
  });

  it('propsの型が正しい', () => {
    const props = {
      theme: getInteriorTheme('standard'),
      seats: [seatAt('seat-1'), seatAt('seat-2')],
      occupiedSeatIds: new Set(['seat-1']),
      rowCurveRadius: 29,
    };

    expect(props.seats).toHaveLength(2);
    // 占有席のみが描画対象になる
    expect(
      props.seats.filter((s) => props.occupiedSeatIds.has(s.id)),
    ).toHaveLength(1);
  });
});
