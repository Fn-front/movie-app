-- 舞台・演劇の中継作品を movie_cache から削除する
--
-- 背景:
--   National Theatre Live や『舞台「〇〇」』のような、劇場で上演された
--   演劇・ミュージカル・バレエの収録上映が一覧に並んでいた。
--   20261020160133 で除外したライブ・コンサート映像と性質は同じだが、
--   そちらは Music 系ジャンルで候補を絞る判定のため、Drama / Comedy が付く
--   舞台中継は素通りしていた。
--
--   保存前フィルタ（src/lib/movies/stageBroadcast.ts）で今後の流入は止まるが、
--   既に保存済みの行はフィルタでは消えないため、ここで削除する。
--
-- 判定条件:
--   アプリ側の判定と揃えるため、NFKC 正規化してから照合する
--   （全角英字 ＮＡＴＩＯＮＡＬ や全角空白を畳むため）。
--
--   「舞台」「ミュージカル」は括弧が続くことを必須にする。部分一致にすると
--   『ストレンジャー・シングス …"最後の冒険"の舞台裏～』や
--   『ハイスクール・ミュージカル／ザ・ムービー』まで巻き込むため。

DELETE FROM public.movie_cache
WHERE upper(normalize(title, NFKC)) LIKE '%NATIONAL THEATRE LIVE%'
   OR upper(normalize(title, NFKC)) LIKE '%OPERA BALLET%'
   OR normalize(title, NFKC) LIKE '%ナショナル・シアター・ライブ%'
   OR normalize(title, NFKC) LIKE '%ザ・ステージ%'
   OR normalize(title, NFKC) ~ '舞台\s*[『「]'
   OR normalize(title, NFKC) ~ 'ミュージカル\s*[『「]';
