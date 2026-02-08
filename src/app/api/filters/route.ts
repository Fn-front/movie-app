/**
 * フィルター条件保存API
 * GET /api/filters - 保存済みフィルター条件を取得
 * PUT /api/filters - フィルター条件を保存（upsert）
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { auth } from '@/lib/auth/auth';
import { filterConditionsSchema } from '@/schema/filters';
import { HTTP_STATUS } from '@/constants';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET() {
  try {
    // 認証チェック
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: AUTH_ERROR_MESSAGES.UNAUTHORIZED,
          },
        },
        { status: HTTP_STATUS.UNAUTHORIZED },
      );
    }

    // Supabaseクライアント検証
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: AUTH_ERROR_MESSAGES.DB_CONNECTION_ERROR,
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ユーザーの保存済みフィルターを取得
    const { data, error } = await supabase
      .from('saved_filters')
      .select('filter_conditions')
      .eq('user_id', session.user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
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
          code: 'SERVER_ERROR',
          message: 'フィルター条件の取得中にエラーが発生しました。',
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}

export async function PUT(request: Request) {
  try {
    // 認証チェック
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: AUTH_ERROR_MESSAGES.UNAUTHORIZED,
          },
        },
        { status: HTTP_STATUS.UNAUTHORIZED },
      );
    }

    // Supabaseクライアント検証
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: AUTH_ERROR_MESSAGES.DB_CONNECTION_ERROR,
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // リクエストボディの取得・バリデーション
    const body = await request.json();
    const result = filterConditionsSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'フィルター条件が不正です。',
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
          code: 'SERVER_ERROR',
          message: 'フィルター条件の保存中にエラーが発生しました。',
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
