/**
 * フィルター条件保存API
 * GET /api/filters - 保存済みフィルター条件を取得
 * PUT /api/filters - フィルター条件を保存（upsert）
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { filterConditionsSchema } from '@/schema/filters';
import {
  HTTP_STATUS,
  ERROR_CODE,
  SUPABASE_ERROR_CODE,
  FILTER_ERROR_MESSAGES,
} from '@/constants';

export async function GET() {
  try {
    // 認証チェック
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    // Supabaseクライアント検証
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // ユーザーの保存済みフィルターを取得
    const { data, error } = await supabase
      .from('saved_filters')
      .select('filter_conditions')
      .eq('user_id', session.user.id)
      .single();

    if (error && error.code !== SUPABASE_ERROR_CODE.NOT_FOUND) {
      throw error;
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          filter_conditions: data?.filter_conditions ?? {},
        },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Get saved filter error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: FILTER_ERROR_MESSAGES.FETCH_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}

export async function PUT(request: Request) {
  try {
    // 認証チェック
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    // Supabaseクライアント検証
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // リクエストボディの取得・バリデーション
    const body = await request.json();
    const result = filterConditionsSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: FILTER_ERROR_MESSAGES.VALIDATION_ERROR,
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // upsert（user_idのUNIQUE制約でON CONFLICT）
    const { error } = await supabase.from('saved_filters').upsert(
      {
        user_id: session.user.id,
        filter_conditions: result.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        success: true,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Save filter error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: FILTER_ERROR_MESSAGES.SAVE_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
