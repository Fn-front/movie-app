/**
 * speakerAiming テスト
 */

import { directionToEuler } from './speakerAiming';

/** rad → deg（読みやすさのため） */
const deg = (rad: number): number => (rad * 180) / Math.PI;

describe('directionToEuler', () => {
  it('-Z 向き (0,0,-1) では yaw が 180°（バッフルは +Z 側に作る規約）', () => {
    const [pitch, yaw, roll] = directionToEuler(0, 0, -1);
    expect(deg(pitch)).toBeCloseTo(0);
    expect(Math.abs(deg(yaw))).toBeCloseTo(180);
    expect(roll).toBe(0);
  });

  it('+Z 向き (0,0,1) では無回転になる', () => {
    const [pitch, yaw] = directionToEuler(0, 0, 1);
    expect(deg(yaw)).toBeCloseTo(0);
    expect(deg(pitch)).toBeCloseTo(0);
  });

  it('真横 (1,0,0) では yaw が +90°', () => {
    const [, yaw] = directionToEuler(1, 0, 0);
    expect(deg(yaw)).toBeCloseTo(90);
  });

  it('反対の横 (-1,0,0) では yaw が -90°（左右対称）', () => {
    const [, yaw] = directionToEuler(-1, 0, 0);
    expect(deg(yaw)).toBeCloseTo(-90);
  });

  it('下向き成分があると pitch が正になる（メッシュが前を下へ倒す）', () => {
    const [pitch] = directionToEuler(0, -0.5, 0.866);
    expect(deg(pitch)).toBeCloseTo(30);
  });

  it('上向き成分があると pitch が負になる', () => {
    const [pitch] = directionToEuler(0, 0.5, 0.866);
    expect(deg(pitch)).toBeCloseTo(-30);
  });

  it('真下 (0,-1,0) では pitch が +90°', () => {
    const [pitch] = directionToEuler(0, -1, 0);
    expect(deg(pitch)).toBeCloseTo(90);
  });

  it('正規化されていないベクトルでも正規化後と同じ角度を返す', () => {
    const scaled = directionToEuler(2, -1, 1.732);
    const unit = directionToEuler(1, -0.5, 0.866);
    scaled.forEach((v, i) => expect(v).toBeCloseTo(unit[i]));
  });

  it('ゼロベクトルでは [0,0,0] を返し NaN を出さない', () => {
    expect(directionToEuler(0, 0, 0)).toEqual([0, 0, 0]);
  });

  it('NaN 入力でも [0,0,0] を返す（不正データで描画が破綻しない）', () => {
    expect(directionToEuler(NaN, 0, 0)).toEqual([0, 0, 0]);
  });

  it('丸め誤差で |y| が 1 を僅かに超えても NaN にならない', () => {
    // DB は real 型のため、正規化済みのつもりでも長さが 1 を僅かに割ることがある
    const [pitch] = directionToEuler(0, -1.0000001, 0);
    expect(Number.isNaN(pitch)).toBe(false);
    expect(deg(pitch)).toBeCloseTo(90);
  });

  it('3成分すべてを返し、3番目（roll）は常に 0', () => {
    const result = directionToEuler(0.41, -0.21, -0.89);
    expect(result).toHaveLength(3);
    expect(result[2]).toBe(0);
  });

  it('実データ（LSS: 右サラウンド）が内向き・下向きを向く', () => {
    // 20260421000001_add_speaker_directivity.sql の LSS の値
    const [pitch, yaw] = directionToEuler(0.98, -0.2, -0.1);
    expect(deg(pitch)).toBeGreaterThan(0); // 下を向く
    expect(Math.abs(deg(yaw))).toBeGreaterThan(90); // 室内側へ大きく振れる
  });
});
