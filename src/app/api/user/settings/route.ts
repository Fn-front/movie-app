/**
 * ユーザー設定API
 * GET /api/user/settings - 設定取得
 * PUT /api/user/settings - 設定更新
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { updateSettingsSchema } from '@/schema/user';
import type { UserSettings } from '@/schema/user';
import { HTTP_STATUS, ERROR_CODE, SUPABASE_ERROR_CODE } from '@/constants';

/** デフォルトのユーザー設定 */
const DEFAULT_SETTINGS: UserSettings = {
  theme: 'light',
  notificationEnabled: false,
};

export async function GET() {
  try {
    // 認証チェック
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    // Supabaseクライアント検証
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // 設定取得
    const { data, error } = await supabase
      .from('user_settings')
      .select('theme, notification_enabled')
      .eq('user_id', session.user.id)
      .single();

    // レコードが存在しない場合はデフォルト値を返す
    if (error?.code === SUPABASE_ERROR_CODE.NOT_FOUND || !data) {
      return NextResponse.json(
        {
          success: true,
          data: DEFAULT_SETTINGS,
        },
        { status: HTTP_STATUS.OK },
      );
    }

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          theme: data.theme,
          notificationEnabled: data.notification_enabled,
        } satisfies UserSettings,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Get user settings error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: '設定の取得に失敗しました',
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
    const result = updateSettingsSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: 'バリデーションエラー',
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // DB用のカラム名に変換
    const updateData: Record<string, unknown> = {};
    if (result.data.theme !== undefined) {
      updateData.theme = result.data.theme;
    }
    if (result.data.notificationEnabled !== undefined) {
      updateData.notification_enabled = result.data.notificationEnabled;
    }

    // upsert（存在しなければ作成、存在すれば更新）
    const { error: upsertError } = await supabase.from('user_settings').upsert(
      {
        user_id: session.user.id,
        ...updateData,
      },
      { onConflict: 'user_id' },
    );

    if (upsertError) {
      throw upsertError;
    }

    return NextResponse.json(
      {
        success: true,
        message: '設定を更新しました',
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Update user settings error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: '設定の更新に失敗しました',
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
