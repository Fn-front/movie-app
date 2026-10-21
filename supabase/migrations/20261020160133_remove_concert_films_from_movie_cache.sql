-- ライブ・コンサート映像作品を movie_cache から削除する
--
-- 背景:
--   ko/zh/th を許可言語に加えて以降、K-POPのライブビューイングや
--   アニメ・特撮のフィルムコンサートが公開前タブに並ぶようになった。
--   保存前フィルタ（src/lib/movies/concertFilm.ts）で今後の流入は止まるが、
--   既に保存済みの行はフィルタでは消えないため、ここで削除する。
--
-- 判定条件:
--   ジャンルが Music(10402) を含み Music/Documentary(99) 以外を持たず、
--   かつタイトルがライブ興行を示すこと。
--   ジャンル構成は音楽ドキュメンタリー映画（『オアシス：ドント・ルック・
--   バック・イン・アンガー』等）と完全に同一なので、ジャンルだけで消すと
--   それらまで巻き添えになる。タイトルで区別する。
--
--   TMDbキーワードでしか判定できない作品はアプリ側の判定と揃わないため、
--   このマイグレーション作成時点で確認済みのIDを個別に列挙する。
--
-- 単語境界（\m...\M）で判定するのは、LIVE が ALIVE / OLIVE に、
-- TOUR が DETOUR に誤マッチするため。

DELETE FROM public.movie_cache
WHERE genre_ids @> '[10402]'::jsonb
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(genre_ids) AS genre
    WHERE genre::int NOT IN (10402, 99)
  )
  AND (
    upper(title) ~ '\m(CONCERT|LIVE|LIVESTREAM|TOUR)\M'
    OR upper(title) LIKE '%IN CINEMAS%'
    OR upper(title) LIKE '%THE STAGE%'
    OR upper(title) LIKE '%THE MUSICAL%'
    OR title LIKE '%ライヴ%'
    OR title LIKE '%ライブ%'
    OR title LIKE '%ツアー%'
    OR title LIKE '%コンサート%'
    OR title LIKE '%公演%'
    OR title LIKE '%콘서트%'
    OR title LIKE '%투어%'
    OR title LIKE '%演唱会%'
    -- タイトルに手がかりが無く、TMDbキーワードで判定した作品
    OR id IN (
      1612063, -- Twenty One Pilots: More Than We Ever Imagined (concert film)
      1637319, -- ハンナ・モンタナ 20周年記念スペシャル (anniversary concert)
      1576370, -- 東方神起 20th Anniversary Film『IDENTITY』 (live performance)
      1600421, -- 스트레이 키즈 : 더 도미네이트 익스피리언스 (concert film)
      142773   -- Queen Budapest (concert film)
    )
  );
