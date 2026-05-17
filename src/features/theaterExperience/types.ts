/**
 * シアター体験機能の型定義
 */

export type AudioLayout = 'atmos_9_1_6';

export type SpeakerChannel =
  | 'L'
  | 'R'
  | 'C'
  | 'LFE'
  | 'LSS'
  | 'RSS'
  | 'LBS'
  | 'RBS'
  | 'LSW'
  | 'RSW'
  | 'LTF'
  | 'RTF'
  | 'LTM'
  | 'RTM'
  | 'LTR'
  | 'RTR';

export type TheaterFormat = 'standard' | 'imax' | 'dolby_cinema';

export type SeatType = 'standard' | 'premium' | 'wheelchair';

export type FrequencyBand = 'low' | 'mid' | 'high';

/** 劇場基本情報 */
export interface Theater {
  id: string;
  name: string;
  slug: string;
  format: TheaterFormat;
  room_width: number;
  room_depth: number;
  room_height: number;
  screen_width: number;
  screen_height: number;
  screen_center_x: number;
  screen_center_y: number;
  screen_center_z: number;
  audio_layout: AudioLayout;
  description?: string;
}

/** 劇場座席 */
export interface TheaterSeat {
  id: string;
  row_label: string;
  seat_number: number;
  position_x: number;
  position_y: number;
  position_z: number;
  seat_type: SeatType;
}

/** 劇場スピーカー */
export interface TheaterSpeaker {
  id: string;
  channel: SpeakerChannel;
  position_x: number;
  position_y: number;
  position_z: number;
  power_watts: number;
  direction_x: number;
  direction_y: number;
  direction_z: number;
  directivity_alpha: number;
}

/** 劇場詳細（座席・スピーカー含む） */
export interface TheaterDetail extends Theater {
  seats: TheaterSeat[];
  speakers: TheaterSpeaker[];
}

/** 劇場一覧の要素（一覧APIで返す最小限の情報） */
export interface TheaterListItem {
  id: string;
  name: string;
  slug: string;
  format: TheaterFormat;
  audio_layout: AudioLayout;
  description?: string;
}

/** 視野占有率メトリクス */
export interface FieldOfViewMetrics {
  /** 水平視野占有率（0〜1） */
  horizontal_ratio: number;
  /** 垂直視野占有率（0〜1） */
  vertical_ratio: number;
  /** スクリーンまでの距離（m） */
  distance_to_screen: number;
  /** 歪みスコア（0〜1、両端席ほど高い） */
  distortion_score: number;
}

/** 劇場一覧APIレスポンス */
export interface TheatersApiResponse {
  success: true;
  data: {
    theaters: TheaterListItem[];
  };
}

/** 劇場詳細APIレスポンス */
export interface TheaterDetailApiResponse {
  success: true;
  data: {
    theater: TheaterDetail;
  };
}
