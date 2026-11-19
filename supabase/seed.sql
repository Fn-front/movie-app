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


-- 映画一覧の3ページ分（/movies/now-showing, /upcoming, 配信中）
--
-- なぜ必要か:
--   これらは本番では movie_cache から描画される（実測で 1,258 行）。
--   まっさらな DB だと **E2E が実行時に投入する合成映画だけ**がページを占める。
--   合成映画の poster_path は `/e2e-poster.jpg` のような架空値なので
--   image.tmdb.org が 404 を返し続け、Next.js の画像最適化が終わらない。
--   結果 `waitForLoadState(networkidle)` が30秒待っても到達せず、
--   e2e/mobile/tapTarget.spec.ts の `/movies/now-showing` が落ちた（CI シャード3）。
--
-- ⚠️ **4象限すべて**入れること（劇場/配信 × 公開中/公開予定）。公開中だけ埋めたときは
--   e2e/movies/filterPersistence.spec.ts が新たに落ちた。
--   「公開中でジャンル絞り込み → 公開予定へ遷移」という経路で、
--   遷移先にデータが無く一覧も空状態メッセージも出ないため。
--   本番は4象限とも埋まっているので、それに合わせる。
--
--   さらに「配信 × 公開予定」を抜かすと
--   e2e/movies/filterPersistence.spec.ts の『ストリーミングタブもナビ往復後の
--   URLに復元される』が落ちる。空状態のメッセージは「表示する映画がありません。」
--   だが、テストが待つのは `/映画が見つかりませんでした/` なので、
--   **0件になった時点で必ずタイムアウトする**。
--   フィルターのジャンル一覧は TMDb の固定リストで先頭が アクション(28) のため、
--   各象限に genre 28 を含む作品が最低1件要る（本番もこの象限は1件しかない）。
--
-- ⚠️ 件数は増やしすぎないこと。overview は 200 文字で切っている。
--   各ページが描画できる最小限（人気順）にとどめる。

INSERT INTO movie_cache (
  id, title, poster_path, backdrop_path, release_date, overview,
  vote_average, popularity, genre_ids, release_type, is_revival,
  is_now_playing, vote_count, original_language, is_currently_streaming,
  digital_release_date
) VALUES
-- 劇場公開中（/movies/now-showing）
  (1400837, 'アザー・マミー', '/qs0kHXbRadmtDIH5EmIoiqV0rX1.jpg', '/smZ8BT4Vzw4iCEppTLCnN8jNYtn.jpg', '2026-11-20', '', 6.4, 366.892, '[27]'::jsonb, 'theatrical', false, true, 514, 'en', false, NULL),
  (1381071, 'ゴジラ-0.0', '/zpcoFlZwyLnBt7bb5wmvGDCdg06.jpg', '/oqrYIDH4tvfEzPe1yqT4jzmAWHQ.jpg', '2026-11-03', '第96回アカデミー賞でアジア映画として初の視覚効果賞を受賞するなど、世界的に大きな話題を集めた「ゴジラ－1.0」の続編。山崎貴が引き続き監督・脚本・VFXを担い、前作から2年後の世界を舞台に、再び姿を現したゴジラとの新たな戦いを描き出す。  戦争によって「無（ゼロ）」となった日本を、ゴジラが「負（マイナス）」に叩き落としてから2年。もがき苦しみながらも復興を遂げ、ようやく取り戻したはずの日常に、再', 7.7, 137.676, '[878, 27, 28]'::jsonb, 'theatrical', false, true, 256, 'ja', false, NULL),
  (1567605, 'クリスマス・キャロル／3人のゴーストたち', '/zy5CBj2ZHOqPWCW124oE4a74dZE.jpg', '/fdOVxyNNL95SuI8BGaN6vudEuYX.jpg', '2026-11-13', '', 7.6, 137.357, '[14, 35]'::jsonb, 'theatrical', false, true, 105, 'en', false, NULL),
  (1283515, 'ヴェリティ／真実', '/rmaNMA1seHqpjtnYKzyynFAr1g8.jpg', '/cKetrF2dAnQ0AMV5i4BMOs41I5P.jpg', '2026-11-06', '仕事にも人生にも行き詰まっている売れない作家ローウェン・アシュリー（ダコタ・ジョンソン）のもとへ、突然、驚くようなオファーが届く。それは交通事故で生死を彷徨う人気作家ヴェリティ・クロフォード（アン・ハサウェイ）のためのゴーストライター業だった。なぜ自分が選ばれたのか疑問を持ちながらも、またとないチャンスを引き受けるべく、ローウェンは人里離れたクロフォード家の邸宅へと移り住む。次第にヴェリティの夫ジ', 7.0, 107.792, '[9648, 53]'::jsonb, 'theatrical', false, true, 737, 'en', false, NULL),
  (1153576, 'ストリートファイター／ザ・ムービー', '/1JBlbyXionXPRaqW1UQw7eKkxNP.jpg', '/9vNW8ysMKIbefbEQOFEZIKpMqwZ.jpg', '2026-10-16', '舞台は1993年。かつて、共に天才格闘家として名を馳せ、兄弟のような存在であったリュウとケン。ある理由により疎遠になった二人のもとに、謎の女性格闘家・春麗が現れ、“ワールドウォリアー・トーナメント（世界格闘王決定戦）”の招待状が差し出される。世界最強の猛者たち“ストリートファイター”と戦うことになった二人は、その拳で運命を変えることができるのか？', 6.3, 83.921, '[28, 14]'::jsonb, 'theatrical', false, true, 247, 'en', false, NULL),
  (1400940, 'クレイフェイス', '/6ttcIVdQbS6esi5wPEUuVKQN8SX.jpg', '/f1TVhqJJdxMvUsUDuKHS0ekgYkk.jpg', '2026-10-30', 'ゴッサムの路地裏で育った少年から、ハリウッドの主演俳優へ。瞬く間にスターの座へ駆け上がったマット・ヘイゲンだったが、地元の犯罪組織のボスによって顔を無残に損なわれ、その輝かしいキャリアは突然、悲劇的な終わりを迎える。周囲のスタッフにも見捨てられ、すべてを失ったマットは、最先端の治療に最後の望みを託す。奇跡的に元の姿を取り戻した彼だったが、その治療は思いもよらぬ形で彼の現実感覚を蝕んでいく。やがてマ', 7.4, 74.463, '[27, 53, 878]'::jsonb, 'theatrical', false, true, 455, 'en', false, NULL),
  (1234139, 'ஜெயிலர் 2', '/upwdEyhhYZ7pT2hD535fr2MGfpx.jpg', '/uxGoKyTnXylK5M4z1hyyaWbmBV7.jpg', '2026-10-15', '', 8.0, 62.638, '[28, 35, 18]'::jsonb, 'theatrical', false, true, 40, 'ta', false, NULL),
  (1255833, 'クジラに落ちた男', '/q4z5EiiOwYWUDkkPMAmFVjqWnBa.jpg', '/shW2jHkQLZVv4Fko2rJDqTGU0gx.jpg', '2026-10-16', '', 6.6, 50.319, '[53]'::jsonb, 'theatrical', false, true, 146, 'en', false, NULL),
  (1483525, 'もしもの愛', '/hGUnENS15d3Ve5W9TQY5ZdP2O18.jpg', '/k0BY5D4Ya6NHhsvNYMmaabpvUtS.jpg', '2026-10-23', 'まったく異なる人生を歩む2 組の夫婦の交錯する日常を捉え、平穏に見えた日々に少しずつ亀裂が生まれていく様子を描き出す。', 7.2, 28.133, '[18]'::jsonb, 'theatrical', false, true, 88, 'ko', false, NULL),
  (1457866, 'ザ・ファーザー・ミスアドベンチャー・オブ・クリフ・ブース', '/gEqfmochcRmyDQFThatTKQfH9GT.jpg', '/qqPspJFy0XrEoVTKZdp0Em7kej6.jpg', '2026-11-25', '舞台は1977年のロサンゼルス。『ワンス・アポン・ア・タイム・イン・ハリウッド』から約8年後、クリフ・ブースはスタントマンを引退し、映画館のスタッフやバーテンダーとして働きながら、ハリウッドの裏問題を処理する“スタジオ・フィクサー”として暗躍している。ある日、タレントエージェントのカレン・クロスビーから依頼を受け、人気TVスターのチャーリー・ピーターズをめぐるトラブルに巻き込まれていく。さらに、チ', 0.0, 13.150, '[35, 18, 53]'::jsonb, 'theatrical', false, true, 0, 'en', false, NULL),
  (467905, '大富豪になるための正しい殺し方', '/adIG9Tsf9FkUkJ1euYjtktSMOyT.jpg', '/bkUa5ZDqjQPx6rkxs0hM87vaWVa.jpg', '2026-11-13', '生まれながらに大富豪一族から追放され、貧しい生活を余儀なくされたベケット・レッドフェロー。280億ドルの遺産と「ふさわしい人生」を取り戻すため、相続に立ちはだかる親族たちを巧妙な「事故」に見せかけ抹殺していく。母親仕込みの知性を武器に暗躍するベケットだったが、ジュリアの登場で完璧な計画は狂い始め……。', 6.9, 11.056, '[35, 53, 80]'::jsonb, 'theatrical', false, true, 878, 'en', false, NULL),
  (1755291, 'NAZA ナザ', '/12lO7y7j57j6mpQCUccOdEpSZzA.jpg', '/inju8joDtL7KHtlFEGjFZ2UuqFa.jpg', '2026-10-24', '夜のテルアビブ、とある建物の屋上でイスラエル人ジャーナリストのユヴァル・アブラハームとラヘル・ショールは、イスラエル軍の兵士と諜報員24名に極秘インタビューを行った。ガザでの民間人殺害について、どのような指令を受けたのか。何をしたのか。ある者はデジタル化された遠隔攻撃を「事務作業のようなものだ」と語り、ある者は「食糧配給所に人が集まったところを撃った」と証言する。ひとりひとりの言葉から浮かび上がる', 8.0, 10.510, '[99]'::jsonb, 'theatrical', false, true, 150, 'en', false, NULL),
  (1278101, 'ちっぽけな僕の、おおきな世界', '/5le1y4AKBSUJ5XTIG4ClGDL2rpC.jpg', '/vd7OvudVEAzO9QG5c80Qdf9mKqq.jpg', '2026-11-06', 'フィクションとドキュメンタリー双方で活躍するヤン・リーナーの監督作品。障がいを持ちながらも力強く生きる若者を、その母、祖母との関係のなかに描く。『少年の君』（19）でスターとなったイー・ヤンチェンシーが主演。', 8.8, 6.353, '[18, 10751]'::jsonb, 'theatrical', false, true, 162, 'zh', false, NULL),
  (338969, 'トキシック・アベンジャー', '/cCWojb6N9UcTzNVtS4bOM3vQ30x.jpg', '/qo7WRoSXkpgvmc9TgaklzrsukLW.jpg', '2026-11-13', '', 5.9, 5.785, '[28, 35, 878]'::jsonb, 'theatrical', false, true, 476, 'en', false, NULL),
  (1147710, '하이재킹', '/pLEenJ0I1XqySVezRdETf2n2w7H.jpg', '/hQ9grQ2RjHS3X7crItJqhoGvUPm.jpg', '2026-11-13', '', 6.8, 4.879, '[28, 53, 80]'::jsonb, 'theatrical', false, true, 171, 'ko', false, NULL),
  (507244, 'アフターバーン　世紀末の秘宝', '/xR0IhVBjbNU34b8erhJCgRbjXo3.jpg', '/o0H6PjNX3wPS1JLOvw9Z0sEDDgW.jpg', '2026-11-13', '', 6.2, 4.295, '[28, 878, 35]'::jsonb, 'theatrical', true, true, 381, 'en', false, NULL),
  (1306816, '世界で最後の愛しい娘！', '/aASLRiO8p9xLIvG9EHXSyZ71sPl.jpg', '/gT7MXlPs7ohpdefR5cdgdPx1zsf.jpg', '2026-11-13', '', 7.3, 4.181, '[35, 18]'::jsonb, 'theatrical', false, true, 56, 'ko', false, NULL),
  (1159206, 'ファーザー マザー シスター ブラザー', '/ph4rTUcsXsGMcLIysFlYxWUdlYu.jpg', '/n36zycrAqHn2uzx65IeAdnsZcMj.jpg', '2026-11-20', '', 6.4, 4.107, '[18]'::jsonb, 'theatrical', false, true, 370, 'en', false, NULL),
  (1411577, '넘버원', '/qg0MKxZtg5CROXqfXBGVZmaxGbK.jpg', '/or89P4LOBh450EygOzUffbJ9M07.jpg', '2026-11-20', '', 6.1, 3.937, '[14, 18]'::jsonb, 'theatrical', false, true, 15, 'ko', false, NULL),
  (1184941, 'Blue Heron/ブルーヘロン', '/paHhnxAaquGELtqtzdYQfR281Kb.jpg', '/t62n8FPCo4kJZYnsxkcLojgThJF.jpg', '2026-10-23', '1990年代後半の夏、8歳の少女サーシャはハンガリー系移民の家族とともにカナダ・バンクーバー島に移り住む。豊かな自然に囲まれた土地で、サーシャは兄たちや新しい友人たちと過ごしながら、少しずつ居場所を見つけていく。ところが、一番上の兄ジェレミーは「問題行動」を繰り返し、家族は限界を迎えつつある。両親はジェレミーの問題を専門家たちに相談する中、困難な選択を迫られていた。20年後、映画監督となったサーシ', 6.6, 3.685, '[18]'::jsonb, 'theatrical', false, true, 54, 'en', false, NULL),
  (1567149, '仮面ライダーカブト20th 天を継ぐもの', '/5LBfnGFPXn5hUmywY7L4jDTEi9E.jpg', '/A9D1tp0USj38oBIFk32P3YVouo3.jpg', '2026-11-06', '最強の仮面ライダー、ふたたび！  あの男たちが、20年の時を経て帰ってくる。そして伝説は未来へ……！  人間に擬態して地球侵略を進める宇宙生命体ワームに対抗するため、秘密組織ZECTが開発した「マスクドライダーシステム」。ワームとZECT、そしてマスクドライダー（仮面ライダー）たちの熾烈を極めた戦いは、人類の勝利に終わった、はずだったが……!?  多彩なキャラクターと、オリジナリティ溢れるストーリ', 6.0, 3.371, '[878, 28, 18]'::jsonb, 'theatrical', false, true, 2, 'ja', false, NULL),
  (793058, 'ハイファイブ！', '/xpqa2ShXecFxMUGKv82Zx56ZoUD.jpg', '/imAihjOnerraFPxAeKOlugUu1YE.jpg', '2026-10-16', '', 7.1, 3.118, '[28, 12, 35, 14]'::jsonb, 'theatrical', false, true, 83, 'ko', false, NULL),
  (1553200, '青春ブタ野郎はディアフレンドの夢を見ない', '/iSG98AUNeBEol9GhoPVdPMxjpYb.jpg', '/iR3R7012MUISPSejxeGFEXHfhDE.jpg', '2026-10-16', '「実は、私が霧島透子なんです」  謎に包まれた大人気ネットシンガーの正体は 国民的女優の桜島麻衣だった――と、沸き立つ観客たち。 その光景は梓川咲太がクリスマスイブに見た夢と同じ――。  4月1日、麻衣の衝撃の告白を皮切りにかつて皆が夢で見たあり得ない出来事が次々と起こり続ける。  見た夢が正夢になるSNSの書き込み「＃夢見る」の存在も消え、目の前の現実と自分の認識が食い違う咲太のもとに、もう一つ', 8.0, 3.114, '[16, 18, 9648, 10749]'::jsonb, 'theatrical', false, true, 2, 'ja', false, NULL),
  (1526917, 'メイドインアビス 目覚める神秘', '/7HfBlYDlMVaHnvd7NEpZLd8r7FO.jpg', '/7vZSK3hXn9fNiaij2YjvNXdwOUn.jpg', '2026-10-23', '', 0.0, 2.775, '[16, 878, 14, 12]'::jsonb, 'theatrical', false, true, 0, 'ja', false, NULL),
-- 公開予定（/movies/upcoming）
  (1400837, 'アザー・マミー', '/qs0kHXbRadmtDIH5EmIoiqV0rX1.jpg', '/smZ8BT4Vzw4iCEppTLCnN8jNYtn.jpg', '2026-11-20', '', 6.4, 366.892, '[27]'::jsonb, 'theatrical', false, true, 514, 'en', false, NULL),
  (1003596, 'アベンジャーズ／ドゥームズデイ', '/axD1jIfE2Is83vDKyTb1CnZ2EBt.jpg', '/rObL4of4eFA8yWaN9pRFo9aOVNi.jpg', '2026-12-18', '異なる3つの世界から集いし愛すべき英雄たちが、破滅的な衝突の運命に直面する。彼らは、これまで経験したことのないような、存亡をかけた脅威に立ち向かうことになる。', 0.0, 181.715, '[878, 28, 12]'::jsonb, 'theatrical', false, false, 0, 'en', false, NULL),
  (891621, 'ワイルド・ホース・ナイン', '/ic83Sukgjq7sj0lYDqlQgLQkkiq.jpg', '/3uLA0ujne91bkzFStZICCYeqhnt.jpg', '2027-01-29', '舞台は1973年のチリ軍事クーデター直前のこと。CIAの局長MJ（スティーヴ・ブシェミ）の命令により、エージェントのクリス（ジョン・マルコヴィッチ）とリー（サム・ロックウェル）はチリの首都サンティアゴからイースター島へと派遣される。 島を象徴する石像に囲まれ、長年パートナーを組んできた二人がそれぞれの暗い過去や現在進行中の陰謀と格闘する中、クリスが反体制派の二人の学生（マリアナ・ディ・ジローラモ、', 7.9, 75.179, '[35, 80, 53]'::jsonb, 'theatrical', false, false, 262, 'en', false, NULL),
  (1117898, 'キャット・イン・ザ・ハット', '/ltbl17lqYWdbHfgfsm5BPujOS4f.jpg', '/9y9o686DsQg0KzPtERzcW7Cf8IE.jpg', '2026-12-25', '', 6.8, 66.634, '[16, 14, 12, 10751, 35]'::jsonb, 'theatrical', false, false, 30, 'en', false, NULL),
  (1375646, 'コロニー／群体', '/zrYz4XEfT4Rx6Div0wPFfQwyFqK.jpg', '/iGViga8sDCET1S6GfwOlAbuhSGQ.jpg', '2027-01-01', 'ソウル都心の超高層ビル。突如発生した未知のバイオテロにより封鎖され逃げ場なきビルに残されたバイオテクノロジー教授であるクォン・セジョン（チョン・ジヒョン）らは、粘る糸を引きながら猛スピードで襲い来る“未知の感染者たち”が、集団知性を持ち、進化し続けることに気づく。生存者たちはヤツらから逃げ切り、超高層ビルから脱出することが出来るのかー──？', 8.2, 51.701, '[27, 28, 878]'::jsonb, 'theatrical', false, false, 1624, 'ko', false, NULL),
  (1375441, 'プライムタイム', '/wqzFMOXLvt9EF5EkNGeI4QLaALE.jpg', '/sEsMwSDUWGIx9EfNxzM6KzVSsSQ.jpg', '2027-01-22', 'ネットで未成年者を狙う大人たちをあぶり出す「おとり捜査」の様子を流すリアリティTV。 未成年者になりすました「おとり」で大人たちを誘い出し、隠しカメラでその姿を撮影、クリス・ハンセンが犯罪者になりえる人間を直接追及する。しかし視聴率を上げ、番組をさらに人気番組へと押し上げるため、ハンセンの行動は次第にエスカレート。大スクープを追い求めるその姿勢に、やがて周囲からはジャーナリズムやモラルのあり方を疑', 6.8, 49.008, '[53, 18, 80]'::jsonb, 'theatrical', false, false, 456, 'en', false, NULL),
  (1538497, 'ビリーと魔法のはじまり', '/5PiV9NozyoHQEfedlic1qIeXiMH.jpg', '/wZ9Me7OndzgBOEAa8nSBNPu3Sl4.jpg', '2026-12-04', 'ディズニー長編アニメーション作品としては初となる、ディズニーヒロイン史上初の“現代の女子高校生”が主人公の＜ビリー＞による全く新しい魔法の物語。 型破りな性格で学校でも周囲になじめない高校生の少女・ビリーが魔法の力に目覚め、新たな世界での大冒険へと導かれていく―。', 0.0, 42.869, '[12, 16, 10751, 14, 35]'::jsonb, 'theatrical', false, false, 0, 'en', false, NULL),
  (1400336, 'ミート・ザ・ペアレンツ フィアンセの襲来', '/iHJhSfqFpDMOyeMc6h6BOeHxse2.jpg', '/6IfsmHoVWwgJwzxA9DLim2XZbSn.jpg', '2027-01-08', '', 4.0, 39.583, '[35, 10749]'::jsonb, 'theatrical', false, false, 1, 'en', false, NULL),
  (1170608, 'デューン 砂の惑星PART3', '/1MQA1Wg2dK7KmvsM5UOXXdMqrDd.jpg', '/i5E9H7Ik0u61ylDDTbmUpTL3Yw.jpg', '2026-12-18', '帝国を掌握してから20年近くが経過した今、ポール・アトレイデスは冷酷な皇帝となっていた。かつての同盟者たちが姿を現し、恐るべき新たな脅威が台頭する中、彼は自らの統治がもたらした結果と向き合わねばならない。至る所に裏切りの影が潜む中、帝国崩壊の幻影と、長年行方不明だった最愛の女性の再来に苦しめられるポールは、壮大な陰謀の渦中へと引きずり込まれていく。その謎の中心にいるのは、チャニであった。敵が迫り来', 0.0, 36.541, '[878, 12]'::jsonb, 'theatrical', false, false, 0, 'en', false, NULL),
  (1302904, 'プラティカル・マジック／魔女たちの秘密', '/ogwQOLbCfncjvBhFb5l0OmQH8KC.jpg', '/oIglj0Jy9duG4LnrRUpH8n001Pk.jpg', '2026-11-27', '', 7.2, 35.155, '[10749, 14, 35]'::jsonb, 'theatrical', false, false, 400, 'en', false, NULL),
  (1280738, 'フュリアス 怒りの頂上決戦', '/aZfUsZjBRa9WSXeIlxaH6jO1Srj.jpg', '/i0eR9O1FnCgBm1cH8WwqxGbAXMS.jpg', '2027-01-29', 'ある日、東南アジアのある都市で暮らすワン・ウェイ（ミャオ）の娘が、児童人身売買組織に誘拐されてしまう。ワンは決死の追跡をはじめ、立ちはだかる敵を凄まじい戦闘能力でなぎ倒し、ジャーナリストのナヴィン（タスリム）と出会う。彼もまた、同じ組織を追う中で行方不明となった妻（ヤーニン）を探していた。二人は協力して組織との戦いに向かうが、その先にはトリッキーな蹴り技を得意とする組織のリーダー・パクルン（岩永）', 8.2, 25.328, '[28, 80, 53]'::jsonb, 'theatrical', false, false, 906, 'zh', false, NULL),
  (1368166, 'ハウスメイド', '/1bhR7OMdCvBYiEmqvwesfcN5qKT.jpg', '/zTnAnYIn0Iv3cn0ZHlzLhou3ybm.jpg', '2026-11-27', '', 7.2, 24.832, '[9648, 53]'::jsonb, 'theatrical', false, false, 3377, 'en', false, NULL),
  (840464, 'グリーンランド ー地球最後の希望ー', '/z2tqCJLsw6uEJ8nJV8BsQXGa3dr.jpg', '/cLFbDVfhllIMybpo2fkGNzehiQG.jpg', '2027-01-01', '', 6.4, 19.911, '[12, 53, 878]'::jsonb, 'theatrical', false, false, 1665, 'en', false, NULL),
  (1284465, 'ロビン・フッドの死', '/13MmRwmG5NmaMfU8qNrtgGXisiD.jpg', '/lh3BDkmWJh998n4fQcHYcVi7dpm.jpg', '2027-01-08', '', 6.7, 19.754, '[12, 18, 28]'::jsonb, 'theatrical', false, false, 629, 'en', false, NULL),
  (1457866, 'ザ・ファーザー・ミスアドベンチャー・オブ・クリフ・ブース', '/gEqfmochcRmyDQFThatTKQfH9GT.jpg', '/qqPspJFy0XrEoVTKZdp0Em7kej6.jpg', '2026-11-25', '舞台は1977年のロサンゼルス。『ワンス・アポン・ア・タイム・イン・ハリウッド』から約8年後、クリフ・ブースはスタントマンを引退し、映画館のスタッフやバーテンダーとして働きながら、ハリウッドの裏問題を処理する“スタジオ・フィクサー”として暗躍している。ある日、タレントエージェントのカレン・クロスビーから依頼を受け、人気TVスターのチャーリー・ピーターズをめぐるトラブルに巻き込まれていく。さらに、チ', 0.0, 13.150, '[35, 18, 53]'::jsonb, 'theatrical', false, true, 0, 'en', false, NULL),
  (1214931, 'ニュルンベルグ裁判', '/xthXNYltOOm80vW5Kxjzxx5gvQ6.jpg', '/mxKVTRDApGP2vtsruji4cNGXioD.jpg', '2027-01-15', '', 7.6, 12.387, '[36, 18]'::jsonb, 'theatrical', false, false, 1571, 'en', false, NULL),
  (1260649, 'ジュマンジ／オープンワールド', '/ntjF2gemedf3ZcWzARGt6cuZlnJ.jpg', '/vaYfhMuwFwsMqyMnu9amtS9hUHE.jpg', '2026-12-25', '', 0.0, 12.015, '[12, 35, 14]'::jsonb, 'theatrical', false, false, 0, 'en', false, NULL),
  (1242332, 'NORMAL／ノーマル', '/bIwQxcZl2CdyhVRNDtQl36YCZVr.jpg', '/1YU6Hy3x7fUh7dfOzSfjifTp20g.jpg', '2026-12-11', '', 7.2, 9.715, '[28, 80, 53]'::jsonb, 'theatrical', false, false, 801, 'en', false, NULL),
  (1078446, 'バイオレント・ナイト2', '/bew9Mt8o1jgijcG5TptQOWMfz0g.jpg', '/78dChJs7doULSEhIiOvGUcXQRGU.jpg', '2026-12-11', '', 0.0, 9.115, '[28, 35, 14]'::jsonb, 'theatrical', false, false, 0, 'en', false, NULL),
  (1300926, 'アングリーバード／大奮闘！ファミリー・ミッション', '/tCu74x8KMTJ9UZreG7wQkm68Qs5.jpg', '/ieAytQ8YcWEZGQpbBy7vHVddwd.jpg', '2027-01-22', '飛べない鳥たちが平和に暮らす島、バードアイランド。太いまゆ毛がトレードマークの怒りんぼうのレッドは、愛するシルヴァーと結婚し、３児のパパに！しかし、好奇心旺盛な高校生の息子・グライダーや反抗期真っただ中のティーンエイジャーの娘・ジューンとの関係には頭を悩ませる日々。そんな中、妻シルヴァーの仕事復帰が決まり、まだ赤んぼうの末っ子・オリーのお世話を一人で引き受けることに。慣れない子育てに大奮闘するレッ', 0.0, 9.106, '[12, 16, 35, 10751]'::jsonb, 'theatrical', false, false, 0, 'en', false, NULL),
-- 配信（streaming）
  (1148365, 'Matchbox ザ・ムービー', '/4bY4EvWpIoi8Q9F51l9OyeuDd5X.jpg', '/jdJsnhHfkIi3J7jwfiCFT4gXNx5.jpg', '2026-10-09', '子供の頃の友人グループが再結成する。すると、彼らは危険な国際的陰謀に遭遇することに。そして、その仲間たちの再会は意外な展開を見せる。世界を救うという使命が、彼らに託されるのであった。', 7.5, 59.215, '[28, 35, 12]'::jsonb, 'streaming', false, false, 648, 'en', true, '2026-10-09'),
  (1218925, '劇場版 チェンソーマン レゼ篇', '/dUbacBfy6M0EBLPssQhJFhtHxIU.jpg', '/gqTz24ZRsCP6AKjARmEivY7m0cK.jpg', '2026-09-19', '悪魔の心臓を持つ「チェンソーマン」となり、公安対魔特異4課のデビルハンターに所属する少年・デンジ。憧れのマキマとのデートでうかれる帰り道、雨宿りをしていると、カフェで働く少女レゼと出会いー!?', 8.5, 34.881, '[16, 28, 10749, 14]'::jsonb, 'streaming', false, false, 1296, 'ja', true, '2026-09-19'),
  (1084242, 'ズートピア2', '/sp8eWmg3HwNKdqdgGhoE2XACfO6.jpg', '/lgotja3xMoJZbynwHfcQcJAEMWH.jpg', '2026-04-15', '警察学校を無事卒業し警察官となったニックと、ウサギ初の警官として以前にもまして熱心に任務に挑むジュディが再びバディを組むことに！ある日、ズートピアに突如現れたヘビ・ゲイリーをきっかけに、ジュディとニックはズートピアの過去の歴史にまつわる巨大な謎に挑むことになる。そこでジュディとニックふたりの絆もこれまで以上に試されることになるのだが…。', 7.7, 33.645, '[16, 12, 35, 9648, 10751]'::jsonb, 'streaming', false, false, 3702, 'en', false, NULL),
  (1236045, 'アニマルズ', '/KqcfuaMk5XP72JOaFGLqzcbaob.jpg', '/5yzM78Tp8nYwSCQtyRcmnHmCn5C.jpg', '2026-10-09', '息子を誘拐されたロサンゼルス市長候補とその妻。自分たちの世界を引き裂きかねない選択に直面しながら、我が子のために必死で身代金をかき集めようとするが...。', 6.9, 33.504, '[53, 18, 28, 80]'::jsonb, 'streaming', false, false, 760, 'en', true, '2026-10-09'),
  (1780407, 'スヌーピー プレゼンツ：クリスマスの12日間', '/2iDlKo8xthKS0IGqbqNklVLC1Hm.jpg', '/3gIGgmK27lt3YK9EUnZ6iXMHg7Q.jpg', '2026-11-13', 'サンタの悪い子リストから、どうしても外れたいスヌーピー。町一番のいい子なビーグル犬になろうとがんばるのだが...。', 7.6, 33.000, '[16, 10751]'::jsonb, 'streaming', false, false, 19, 'en', true, '2026-11-13'),
  (1050981, 'わたしが人間であるために Being Heumann', '/u5s1bVU376C27SPx6oij1eA7Cp4.jpg', '/25aB8RXP4mfQLFRSuEEhk0d0sTC.jpg', '2026-11-13', '闘志と反骨心に満ちたジュディ・ヒューマンは、社会からお荷物扱いされる現状に嫌気がさし、その怒りを革命へと向ける。1977年、障害者の権利を求める100人以上の同志と共に、彼女は抗議の声を上げ、強く訴えた。“壊れているのは社会であって、我々ではない”。', 7.1, 30.889, '[18, 36]'::jsonb, 'streaming', false, false, 28, 'en', true, '2026-11-13'),
  (1359916, '秒速5センチメートル', '/nhvPn4TsUQk5ZBk9T9RBW7v7z1J.jpg', '/dh9PD257KPFSQ2FQfZ7yXWr2N0l.jpg', '2026-04-15', '1991年、春。東京の小学校で出会った遠野貴樹と篠原明里は、互いの孤独に手を差し伸べるように心を通わせるが、卒業と同時に明里は引っ越してしまう。中学1年の冬。吹雪の夜に栃木・岩舟で再会を果たした2人は、雪の中に立つ桜の木の下で、2009年3月26日に同じ場所で再会することを約束する。時は流れ、2008年。東京でシステムエンジニアとして働く貴樹は30歳を前にして、自分の一部が遠い時間に取り残されたま', 7.9, 30.215, '[18, 10749]'::jsonb, 'streaming', false, false, 24, 'ja', false, NULL),
  (1007757, 'プークーと魔法の植物', '/tHhxWxge06goXU6ZQH1hj7vK8Hd.jpg', '/zMwhWailP1WY7sb6AoE6b8ugoy.jpg', '2026-05-01', '森に住む小さな生き物と、美しい羽を持つ大きな鳥。ある日突然体が入れ替わってしまったでこぼこコンビは、仲良く力を合わせて未知なるドキドキの大冒険を乗り越えられるのか!?', 8.8, 29.329, '[12, 16, 10751, 14]'::jsonb, 'streaming', false, false, 2304, 'en', false, NULL),
  (1483525, 'もしもの愛', '/hGUnENS15d3Ve5W9TQY5ZdP2O18.jpg', '/k0BY5D4Ya6NHhsvNYMmaabpvUtS.jpg', '2026-11-06', 'まったく異なる人生を歩む2 組の夫婦の交錯する日常を捉え、平穏に見えた日々に少しずつ亀裂が生まれていく様子を描き出す。', 7.2, 28.133, '[18]'::jsonb, 'streaming', false, false, 88, 'ko', true, '2026-11-06'),
  (911430, 'F1／エフワン', '/mtgRgRG4k8ULNbqUrm9fHAOs1KW.jpg', '/lkDYN0whyE82mcM20rwtwjbniKF.jpg', '2025-08-22', '引退していたレース界のレジェンド、ソニー・ヘイズが現役に呼び戻され、低迷するＦ１チームを率いて、若き天才ドライバーを指導しながら、再び栄光をつかむチャンスを追い求める。', 7.8, 25.504, '[28, 18]'::jsonb, 'streaming', false, false, 5017, 'en', false, NULL),
  (1654940, '余命一年、男をかう', '/lkEQXQ1YpMCzCrLOBxHLGdCHLVb.jpg', '/6vGH7JZFLzFawpwCcnNweF8j3KD.jpg', '2026-11-05', '柴咲コウ×赤楚衛二 W主演のNetflix映画『余命一年、男をかう』2026年世界独占配信', 7.1, 25.374, '[10749, 18, 35]'::jsonb, 'streaming', false, false, 28, 'ja', true, '2026-11-05'),
  (1228710, 'スター・ウォーズ／マンダロリアン・アンド・グローグー', '/6JC12YUAIKHr8vYiA8XroIsjv1Z.jpg', '/ysLlsAxwgNSxBWHCgTKJrmjxpRQ.jpg', '2026-07-21', '帝国が崩壊し、無法地帯と化した銀河に生きる、どんな仕事も完璧に遂行する孤高の賞金稼ぎマンダロリアンと、強大なフォースを秘めた存在グローグー。帝国の復活を狙う新たな戦争を阻止する最後の希望は、父子を超えた絆で結ばれたこの二人に託された…。', 7.5, 23.953, '[28, 12, 878]'::jsonb, 'streaming', false, false, 2005, 'en', false, '2026-07-21'),
  (1297842, 'GOAT／ゴート 史上最高をめざせ！', '/5GPyCgKMk2psL3oHVNV8xZ3JJDt.jpg', '/vcM0CWnMGdOo6ty1iyt7zE1jtd6.jpg', '2026-06-03', '大きな夢を抱く小さなヤギのウィルは一生に一度のチャンスをつかみ、プロの世界に入り、“ロアーボール”という競技でプレーすることになる。それは世界で最も速く、最も獰猛な動物たちが支配する、男女混合のハイテンションでフルコンタクトのスポーツ。新しいチームメートたちは、小さなヤギが加わったことをあまり歓迎していない。しかしウィルは、このスポーツに革命を起こし、「小さくてもプレーできる！」ことを証明しようと', 8.0, 20.194, '[16, 35, 10751]'::jsonb, 'streaming', false, false, 1167, 'en', false, NULL),
  (939243, 'ソニック × シャドウ TOKYO MISSION', '/u7MkhOKrp0ngssms7pSOJ5EDz4g.jpg', '/zOpe0eHsq0A2NvNyBbtT6sj53qV.jpg', '2025-02-26', 'ついに舞台はセガとソニックの母国である日本。闇のダークヒーロー＜シャドウ＞が東京・渋谷に降臨！ソニック、テイルス、ナックルズが最強ダークヒーローに立ち向かうハイスピードバトルが開幕！', 7.6, 17.293, '[28, 878, 35, 10751]'::jsonb, 'streaming', false, false, 3553, 'en', false, NULL),
  (1288069, 'テンジン', '/hKZXo3UE8igRZcSuFNTvCiPo0If.jpg', '/tKvVgMfM6GS4AGZn2KhP8bX1mJm.jpg', '2026-10-16', '驚異の強い決意を抱いた男が、エベレスト山頂に人類で初めて到達するという夢を実現するため、命懸けの挑戦に乗り出し、不可能と思われる困難に立ち向かっていく。', 8.2, 17.291, '[18, 36, 12]'::jsonb, 'streaming', false, false, 292, 'en', true, '2026-10-16'),
  (541671, 'バレリーナ：The World of John Wick', '/jlbtSMoltyWY6pnaRrCdV5XyRcW.jpg', '/1yktYsxkmUtUFTUnCAUaqG6FEiz.jpg', '2026-01-16', '孤児を集めて暗殺者とバレリーナを養成するロシア系犯罪組織：ルスカ・ロマ。裏社会に轟く伝説の殺し屋：ジョン・ウィックを生み出した組織で殺しのテクニックを磨いたイヴは、幼い頃に殺された父親の復讐に立ち上がる。しかし、裏社会の掟を破った彼女の前に、あの伝説の殺し屋が現れる…', 7.3, 13.819, '[28, 53, 80]'::jsonb, 'streaming', false, false, 3142, 'en', false, NULL),
-- 配信の公開予定（/movies/upcoming の ストリーミングタブ）
  (1280115, 'ウォリアー・キッド', '/swXcBAyeKxDbx9EZNzpIWdFMXcH.jpg', '/1JL6mDxYRauwv81bLupSZczC39M.jpg', '2026-11-25', '負傷した海軍特殊部隊シールズのジェイクは、自分に自信がなくいじめに悩む甥のマークの指導者になる。軍隊で培った訓練の原則を活かし、ジェイクはハイスクールの入学を控えるマークに「小さな戦士」になる方法を伝授していく。', 0.0, 5.194, '[18, 10751]'::jsonb, 'streaming', false, false, 0, 'en', false, '2026-11-25'),
  (1379537, 'ギャラリスト', '/mEi0c3wUrjnekhv02RM1kEAC3Qc.jpg', '/9124LLkc5VzlzseShFTOIn983Xd.jpg', '2026-12-04', '', 0.0, 3.554, '[35, 18]'::jsonb, 'streaming', false, false, 0, 'en', false, '2026-12-04'),
  (1124619, 'ブライド・ハード', '/3mExdWLSxAiUCb4NMcYmxSkO7n4.jpg', '/2DcD4Hh80SW7YVpwckkiEFRZX06.jpg', '2027-01-08', 'シークレット・エージェントのサムは、幼馴染ベッツィの結婚式で花嫁介添人を任される。しかし準備期間中も極秘ミッションに呼び出されて姿を消すなど失態を重ね、介添人を解任されてしまう。他のブライズメイドとの間の距離を埋めることなく、挙式当日を迎えることに。しかし、挙式当日、結婚式会場である屋敷を武装傭兵集団が襲撃。新郎新婦や参列者たちが人質に取られてしまう。ブライズメイズとしての役割を果たせずに、自分に', 5.4, 2.650, '[28, 35]'::jsonb, 'streaming', false, false, 216, 'en', false, '2027-01-08'),
  (1591961, '僕の狂ったフェミ彼女', '/skIMvDKu43EQ6NcV6KXCClPllG7.jpg', '/7k3bwArupn0jdEpWETdJexxs21H.jpg', '2026-12-03', 'とあることをきっかけにフェミニストになった、狂おしくも愛おしい"彼女"。愛も権利もゆずれない、彼女と"僕"の戦争のような恋愛を描くロマンスコメディ。大ヒット韓国小説の映画化。', 0.0, 0.946, '[10749, 35]'::jsonb, 'streaming', false, false, 0, 'ja', false, '2026-12-03'),
  (1801852, 'フラグルロック：冬のおくりもの', '/vMipJHLKS435qWJu3YtOrfEUqpN.jpg', '/72GEYmf40psyPIQIRkjQKkv3900.jpg', '2026-12-04', 'フラグル・ロックはホリデーの季節。ホリデー気分のキャプテンであるウェンブリーは、喜びを広げるのを待ちきれない。しかしお祭り気分が下がってきたため、ウェンブリーはこの季節を本当に特別にしているものを探しに出かける。', 0.0, 0.865, '[35, 10751, 10402]'::jsonb, 'streaming', false, false, 0, 'en', false, '2026-12-04'),
  (1761050, '5 - 嵐という時間 -', '/eEXFBWG5F6fOwQjekuCZTNMKVOG.jpg', '/hXXZCC2tdjmf6ikrmoBaj0cIdJ8.jpg', '2026-12-15', '相葉雅紀、松本潤、二宮和也、大野智、櫻井翔が長年支えてくれた嵐ファンへの感謝をどう伝えようと考えたか、ファイナルに向けて嵐にどう向き合ったか、そして彼らが再びステージに立ち、活動を終えるまでの軌跡が描かれる。', 0.0, 0.359, '[99, 10402]'::jsonb, 'streaming', false, false, 0, 'ja', false, '2026-12-15'),
  (1731458, '恐怖中毒', '/5dwDXoFPFV2FiUNHiyqCykUsniX.jpg', '/cI6FLSDkWc8lRGWIbZZDyxNJh1V.jpg', '2026-11-30', '', 0.0, 0.306, '[27]'::jsonb, 'streaming', false, false, 0, 'ja', false, '2026-11-30'),
  (1788638, 'よろしくアミーゴ', '/nJjsisKIw4hSHAPO8T8CoCL5S8Q.jpg', '/mP8gWkbXJmLWKEwbqa9K2zzEz9D.jpg', '2026-11-22', '', 0.0, 0.224, '[35, 878]'::jsonb, 'streaming', false, false, 0, 'ja', false, '2026-11-22')
ON CONFLICT (id, release_type) DO NOTHING;
