import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { APP_NAME, PERSON_DEPARTMENT_LABELS } from '@/constants';
import { getCachedPersonDetail } from '@/lib/api/person/person.server';
import { parsePersonId } from '@/lib/person/personId';
import type { PersonDetail } from '@/lib/types';

import { PersonPageLoader } from './loader';

type PersonPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * 表示してよい人物を取得する
 *
 * ID書式・TMDbの404・アダルト作品出演者を全て「存在しない」として扱う。
 * `getCachedPersonDetail` は generateMetadata とページ本体で共有しており、
 * 同じ人物への TMDb リクエストは1回で済む。
 *
 * @returns 人物詳細。表示対象でなければ null
 */
async function findVisiblePerson(id: string): Promise<PersonDetail | null> {
  const personId = parsePersonId(id);
  if (personId === null) return null;

  try {
    const person = await getCachedPersonDetail(personId);
    // TMDb の include_adult は /search と /discover にしか効かないため自前で弾く
    return person.adult ? null : person;
  } catch {
    // TMDbの404も一時障害も、ページとしては出せないので同じ扱いにする
    return null;
  }
}

export async function generateMetadata({
  params,
}: PersonPageProps): Promise<Metadata> {
  const { id } = await params;
  const person = await findVisiblePerson(id);

  if (!person) {
    return { title: `人物が見つかりません | ${APP_NAME}` };
  }

  const department =
    PERSON_DEPARTMENT_LABELS[person.known_for_department] ??
    person.known_for_department;
  const representativeTitles = person.cast
    .slice(0, 3)
    .map((credit) => credit.title)
    .join('、');

  const description = representativeTitles
    ? `${person.name}（${department}）のプロフィールと出演作品。代表作: ${representativeTitles}`
    : `${person.name}（${department}）のプロフィールと出演作品`;

  return {
    title: `${person.name} | ${APP_NAME}`,
    description,
    openGraph: {
      title: `${person.name} | ${APP_NAME}`,
      description,
      type: 'profile',
    },
  };
}

export default async function Person({ params }: PersonPageProps) {
  const { id } = await params;
  const person = await findVisiblePerson(id);

  if (!person) {
    notFound();
  }

  return <PersonPageLoader personId={person.id} />;
}
