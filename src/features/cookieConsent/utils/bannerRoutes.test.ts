import { ROUTES } from '@/constants';

import { isConsentBannerHiddenRoute } from './bannerRoutes';

describe('isConsentBannerHiddenRoute', () => {
  it.each([
    ['ログイン', ROUTES.LOGIN],
    ['新規登録', ROUTES.REGISTER],
    ['パスワードを忘れた', ROUTES.FORGOT_PASSWORD],
    ['パスワード再設定', ROUTES.RESET_PASSWORD],
    ['二段階認証', ROUTES.TOTP_CHALLENGE],
    ['認証エラー', ROUTES.AUTH_ERROR],
  ])('認証フローの %s では隠す', (_label, route) => {
    expect(isConsentBannerHiddenRoute(route)).toBe(true);
  });

  it.each([
    ['ホーム', '/'],
    ['公開中', ROUTES.NOW_SHOWING],
    ['設定', ROUTES.SETTINGS],
    // バナー本文からのリンク先。ここで消えると同意の判断材料を読めない
    ['プライバシーポリシー', ROUTES.PRIVACY],
  ])('通常のページ（%s）では隠さない', (_label, route) => {
    expect(isConsentBannerHiddenRoute(route)).toBe(false);
  });

  it('`/authors` のように前方一致するだけのパスは隠さない', () => {
    // プレフィックスの区切りを `/auth` にすると巻き込む
    expect(isConsentBannerHiddenRoute('/authors')).toBe(false);
    expect(isConsentBannerHiddenRoute('/auth-guide')).toBe(false);
  });

  it('pathname が無い間は隠さない', () => {
    // 判定できないときに隠すと、通常ページでバナーが出ない窓ができる
    expect(isConsentBannerHiddenRoute(null)).toBe(false);
  });
});
