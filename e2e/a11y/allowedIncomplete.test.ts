/**
 * incomplete（needs review）の絞り込みロジックのテスト
 *
 * axe の実行は E2E 側で行う。ここで担保するのは「どれを許容し、
 * どれを落とすか」という純粋な判定だけ。
 */

import { filterUnexpectedIncomplete } from './allowedIncomplete';

/** axe の incomplete 1件を組み立てる */
function makeResult({
  id,
  nodes,
}: {
  id: string;
  nodes: Array<{ target: string[]; messageKey?: string }>;
}) {
  return {
    id,
    impact: 'serious' as const,
    tags: [],
    description: '',
    help: '',
    helpUrl: '',
    nodes: nodes.map((n) => ({
      html: '<button></button>',
      target: n.target,
      any:
        n.messageKey === undefined
          ? []
          : [
              {
                id,
                data: { messageKey: n.messageKey },
                relatedNodes: [],
                impact: 'serious',
                message: '',
              },
            ],
      all: [],
      none: [],
    })),
  };
}

const CLIPPED_CARD = makeResult({
  id: 'color-contrast',
  nodes: [
    {
      target: [
        '.c_now_showing_movie_list__item:nth-child(6) > .c_title_button',
      ],
      messageKey: 'elmPartiallyObscuring',
    },
  ],
});

describe('filterUnexpectedIncomplete', () => {
  it('許容指定が無ければそのまま返す', () => {
    expect(filterUnexpectedIncomplete([CLIPPED_CARD], [])).toEqual([
      CLIPPED_CARD,
    ]);
  });

  it('ルールIDだけの指定はそのルールを丸ごと許容する', () => {
    expect(
      filterUnexpectedIncomplete([CLIPPED_CARD], ['color-contrast']),
    ).toEqual([]);
  });

  it('別のルールIDを指定しても落とさない', () => {
    expect(
      filterUnexpectedIncomplete([CLIPPED_CARD], ['heading-order']),
    ).toEqual([CLIPPED_CARD]);
  });

  it('messageKey と対象セレクタの両方が合えば許容する', () => {
    expect(
      filterUnexpectedIncomplete(
        [CLIPPED_CARD],
        [
          {
            id: 'color-contrast',
            messageKey: 'elmPartiallyObscuring',
            targetIncludes: 'movie_list__item',
          },
        ],
      ),
    ).toEqual([]);
  });

  it('messageKey が違えば許容しない', () => {
    expect(
      filterUnexpectedIncomplete(
        [CLIPPED_CARD],
        [
          {
            id: 'color-contrast',
            messageKey: 'bgImage',
            targetIncludes: 'movie_list__item',
          },
        ],
      ),
    ).toEqual([CLIPPED_CARD]);
  });

  it('対象セレクタが違えば許容しない（カルーセル外の同種の指摘は落ちる）', () => {
    const heroText = makeResult({
      id: 'color-contrast',
      nodes: [
        { target: ['.c_hero__caption'], messageKey: 'elmPartiallyObscuring' },
      ],
    });

    expect(
      filterUnexpectedIncomplete(
        [heroText],
        [
          {
            id: 'color-contrast',
            messageKey: 'elmPartiallyObscuring',
            targetIncludes: 'movie_list__item',
          },
        ],
      ),
    ).toEqual([heroText]);
  });

  it('同じルールで許容対象と非対象が混ざるとき、非対象だけを残す', () => {
    const mixed = makeResult({
      id: 'color-contrast',
      nodes: [
        {
          target: ['.c_now_showing_movie_list__item:nth-child(6) > .c_title'],
          messageKey: 'elmPartiallyObscuring',
        },
        { target: ['.c_hero__caption'], messageKey: 'elmPartiallyObscuring' },
      ],
    });

    const result = filterUnexpectedIncomplete(
      [mixed],
      [
        {
          id: 'color-contrast',
          messageKey: 'elmPartiallyObscuring',
          targetIncludes: 'movie_list__item',
        },
      ],
    );

    expect(result).toHaveLength(1);
    expect(result[0].nodes).toHaveLength(1);
    expect(result[0].nodes[0].target).toEqual(['.c_hero__caption']);
  });

  it('入れ子の target（iframe 内）も文字列として判定できる', () => {
    const inFrame = makeResult({
      id: 'color-contrast',
      nodes: [{ target: ['#frame'], messageKey: 'elmPartiallyObscuring' }],
    });
    // axe は iframe 内を [['#frame', '.inner']] のような入れ子で返す
    inFrame.nodes[0].target = [
      ['#frame', '.c_now_showing_movie_list__item'],
    ] as unknown as string[];

    expect(
      filterUnexpectedIncomplete(
        [inFrame],
        [
          {
            id: 'color-contrast',
            messageKey: 'elmPartiallyObscuring',
            targetIncludes: 'movie_list__item',
          },
        ],
      ),
    ).toEqual([]);
  });

  it('messageKey を持たないノードは messageKey 指定に合致しない', () => {
    const noKey = makeResult({
      id: 'color-contrast',
      nodes: [{ target: ['.c_now_showing_movie_list__item'] }],
    });

    expect(
      filterUnexpectedIncomplete(
        [noKey],
        [{ id: 'color-contrast', messageKey: 'elmPartiallyObscuring' }],
      ),
    ).toEqual([noKey]);
  });
});
