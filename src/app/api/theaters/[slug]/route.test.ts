/**
 * @jest-environment node
 */

/**
 * 劇場詳細API Route テスト (GET)
 */

import { GET } from './route';

// --- Mocks ---

const mockSelect = jest.fn();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockFrom = jest.fn((_table?: string) => ({
  select: mockSelect,
}));

jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('@/helpers/auth', () => ({
  getAuthSession: jest.fn().mockResolvedValue({ user: { id: 'user-123' } }),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

import { getAuthSession } from '@/helpers/auth';

// --- Helpers ---

const createGetRequest = () =>
  new Request('http://localhost/api/theaters/standard-medium');

const createContext = (slug: string) => ({
  params: Promise.resolve({ slug }),
});

const mockTheater = {
  id: 'uuid-1',
  name: '汎用中規模シアター',
  slug: 'standard-medium',
  format: 'standard',
  room_width: 20,
  room_depth: 25,
  room_height: 8,
  screen_width: 14,
  screen_height: 6,
  screen_center_x: 0,
  screen_center_y: 4,
  screen_center_z: 12.5,
  audio_layout: 'atmos_9_1_6',
  description: 'テスト劇場',
};

const mockSeats = [
  {
    id: 'seat-1',
    row_label: 'A',
    seat_number: 1,
    position_x: -7,
    position_y: 0,
    position_z: 5,
    seat_type: 'standard',
  },
];

const mockSpeakers = [
  {
    id: 'speaker-1',
    channel: 'L',
    position_x: -6,
    position_y: 4,
    position_z: 12,
    power_watts: 500,
  },
];

function setupFullQuery() {
  mockFrom.mockImplementation((table?: string) => {
    if (table === 'theaters') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              is: jest.fn().mockReturnValue({
                single: jest
                  .fn()
                  .mockResolvedValue({ data: mockTheater, error: null }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'theater_seats') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              order: jest
                .fn()
                .mockResolvedValue({ data: mockSeats, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === 'theater_speakers') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: mockSpeakers, error: null }),
        }),
      };
    }
    return { select: jest.fn() };
  });
}

function setupNotFound() {
  mockFrom.mockImplementation((_table?: string) => ({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          is: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'not found' },
            }),
          }),
        }),
      }),
    }),
  }));
}

// --- Tests ---

describe('GET /api/theaters/[slug]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('劇場詳細を座席・スピーカーと共に取得できる', async () => {
    setupFullQuery();

    const response = await GET(
      createGetRequest(),
      createContext('standard-medium'),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.theater.slug).toBe('standard-medium');
    expect(json.data.theater.seats).toEqual(mockSeats);
    expect(json.data.theater.speakers).toEqual(mockSpeakers);
  });

  it('Cache-Controlヘッダーが設定される', async () => {
    setupFullQuery();

    const response = await GET(
      createGetRequest(),
      createContext('standard-medium'),
    );

    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600');
  });

  it('存在しないslugでは404を返す', async () => {
    setupNotFound();

    const response = await GET(
      createGetRequest(),
      createContext('non-existent'),
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('不正なslug形式ではバリデーションエラーを返す', async () => {
    const response = await GET(
      createGetRequest(),
      createContext('INVALID SLUG!'),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('未認証時は401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      createGetRequest(),
      createContext('standard-medium'),
    );

    expect(response.status).toBe(401);
  });
});
