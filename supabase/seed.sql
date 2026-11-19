-- ローカル／CI 用のシード（#1331）
--
-- ⚠️ 本番には絶対に入らない。seed が走るのは `supabase db reset`（ローカル専用）
--   だけで、`supabase db push` は seed を実行しない。
--
-- なぜ必要か:
--   受賞作品（/awards）は本番では賞の同期ジョブが `award_movies` を埋めるが、
--   まっさらな DB では0件になる。E2E は「一覧が表示される」「作品をクリックすると
--   詳細モーダルが開く」「年度を切り替えると一覧が更新される」を見ているため、
--   データが無いと落ちる（ローカル Supabase へ移した初回に実際に5件落ちた）。
--
-- E2E が満たす必要のある条件（e2e/awards/awards.spec.ts）:
--   1. `movie_tile` が1枚以上ある
--   2. **年度が2つ以上**ある（1つだと年度切替テストが test.skip になる）
--   3. 同じカテゴリに**受賞（is_winner=true）とノミネートが同居**する
--      （スマホ幅で両者のタイル幅が一致するかを見るため / #987）
--   4. `tmdb_movie_id` が**実在する**こと。詳細モーダルは TMDb へ問い合わせるため、
--      架空のIDだと開かない。ここの値は本番の `award_movies` から採った実データ
--
-- ⚠️ E2E が実行時に作るデータとは領域が分かれている。E2E 側は
--   `runScopedMovieId`（実在TMDb IDと重ならない合成ID帯 / e2e/helpers/runScope.ts）
--   を `movie_cache` に入れる。こちらは `award_movies` で、実在IDを使う。

INSERT INTO award_movies (
  tmdb_movie_id, title, poster_path, release_date, vote_average, genre_ids,
  award_name, award_year, category, is_winner, display_order, person_name
) VALUES
  (1064213, 'ANORA アノーラ', '/oPzW7Juxp2545owUEVC6ppRqQBj.jpg', '2025-02-28', 7.1, '{18,35,10749}'::integer[], 'academy_awards', 2025, 'best_director', true, 1, 'ショーン・ベイカー'),
  (549509, 'ブルータリスト', '/ztU8CjmgqXrQWVBTRbWeKTaUcQ0.jpg', '2025-02-21', 7.0, '{18,36}'::integer[], 'academy_awards', 2025, 'best_director', false, 2, 'ブラディ・コーベット'),
  (661539, '名もなき者/A COMPLETE UNKNOWN', '/tVainM8sgv9vYIowTfMlT9GaiK6.jpg', '2025-02-28', 7.1, '{18,10402}'::integer[], 'academy_awards', 2025, 'best_director', false, 3, 'ジェームズ・マンゴールド'),
  (974950, 'エミリア・ペレス', '/fko8fTfL6BcAqOUh6BZYUjt4SQP.jpg', '2025-03-28', 6.5, '{18,53}'::integer[], 'academy_awards', 2025, 'best_director', false, 4, 'ジャック・オーディアール'),
  (1064213, 'ANORA アノーラ', '/oPzW7Juxp2545owUEVC6ppRqQBj.jpg', '2025-02-28', 7.1, '{18,35,10749}'::integer[], 'academy_awards', 2025, 'best_picture', true, 1, NULL),
  (549509, 'ブルータリスト', '/ztU8CjmgqXrQWVBTRbWeKTaUcQ0.jpg', '2025-02-21', 7.0, '{18,36}'::integer[], 'academy_awards', 2025, 'best_picture', false, 2, NULL),
  (661539, '名もなき者/A COMPLETE UNKNOWN', '/tVainM8sgv9vYIowTfMlT9GaiK6.jpg', '2025-02-28', 7.1, '{18,10402}'::integer[], 'academy_awards', 2025, 'best_picture', false, 3, NULL),
  (974576, '教皇選挙', '/duUwtarUFB7araLzBTEKoSG6927.jpg', '2025-03-20', 7.2, '{18,53}'::integer[], 'academy_awards', 2025, 'best_picture', false, 4, NULL),
  (858024, 'ハムネット', '/9egBtJSTRUCHo4l57euQsDJM3Pi.jpg', '2026-04-10', 7.7, '{18,10749}'::integer[], 'academy_awards', 2026, 'best_director', false, 1, 'クロエ・ジャオ'),
  (1317288, 'マーティ・シュプリーム 世界をつかめ', '/hVhPgJ6FZL0AJbd86bEhWESYwYw.jpg', '2026-03-13', 7.4, '{18,53}'::integer[], 'academy_awards', 2026, 'best_director', false, 2, 'ジョシュ・サフディ'),
  (1054867, 'ワン・バトル・アフター・アナザー', '/6963S9BQk07eEk8r26eaHgw0RNY.jpg', '2025-10-03', 7.3, '{53,80,35}'::integer[], 'academy_awards', 2026, 'best_director', true, 3, 'ポール・トーマス・アンダーソン'),
  (1124566, 'センチメンタル・バリュー', '/1wM3MTY4Inf6fOL5nMqPKaVTfHi.jpg', '2026-02-20', 7.5, '{18}'::integer[], 'academy_awards', 2026, 'best_director', false, 4, 'ヨアキム・トリアー'),
  (701387, 'ブゴニア', '/1prf5Qob2ZRCFWp6XHvVSey8G6e.jpg', '2026-02-13', 7.3, '{878,53,35}'::integer[], 'academy_awards', 2026, 'best_picture', false, 1, NULL),
  (911430, 'F1／エフワン', '/mtgRgRG4k8ULNbqUrm9fHAOs1KW.jpg', '2025-06-27', 7.8, '{28,18}'::integer[], 'academy_awards', 2026, 'best_picture', false, 2, NULL),
  (1062722, 'フランケンシュタイン', '/siIvWg36CiikM2f43GtiYxHXEDj.jpg', '2025-10-24', 7.6, '{18,14,27}'::integer[], 'academy_awards', 2026, 'best_picture', false, 3, NULL),
  (858024, 'ハムネット', '/9egBtJSTRUCHo4l57euQsDJM3Pi.jpg', '2026-04-10', 7.7, '{18,10749}'::integer[], 'academy_awards', 2026, 'best_picture', false, 4, NULL),
  (1054867, 'ワン・バトル・アフター・アナザー', '/6963S9BQk07eEk8r26eaHgw0RNY.jpg', '2025-10-03', 7.3, '{53,80,35}'::integer[], 'academy_awards', 2026, 'best_picture', true, 6, NULL)
ON CONFLICT ON CONSTRAINT uq_award_movies_entry DO NOTHING;
