/**
 * PersonProfileコンポーネント
 * 人物ページのプロフィール（写真・氏名・活動分野・生没年月日・出生地・略歴）
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import Image from 'next/image';

import {
  IMAGE_SIZES,
  PERSON_BIOGRAPHY_CLAMP_CHARS,
  PERSON_DEPARTMENT_LABELS,
  PERSON_MESSAGES,
} from '@/constants';
import { formatDate } from '@/utils/date';
import { getTMDbProfileUrl } from '@/utils/image';
import { cn } from '@/utils/cn';
import type { PersonDetail } from '@/lib/types';

import styles from './personProfile.module.scss';

/**
 * PersonProfileコンポーネントのプロパティ
 */
export interface PersonProfileProps {
  /** 人物詳細 */
  person: PersonDetail;
}

/**
 * 生年月日の表示文字列を作る（没年月日があれば併記）
 */
function formatLifespan(
  birthday: string | null,
  deathday: string | null,
): string | null {
  const birth = formatDate(birthday);
  const death = formatDate(deathday);

  if (!birth && !death) return null;
  if (!death) return birth;
  // 生年が不明でも没年だけは出す（TMDbでは生年未登録の人物がいる）
  return `${birth ?? '不明'}${PERSON_MESSAGES.LIFESPAN_SEPARATOR}${death}`;
}

/**
 * PersonProfileコンポーネント
 */
export const PersonProfile = memo<PersonProfileProps>(function PersonProfile({
  person,
}) {
  const [isBiographyExpanded, setIsBiographyExpanded] = useState(false);

  const handleBiographyToggle = useCallback(() => {
    setIsBiographyExpanded((expanded) => !expanded);
  }, []);

  const profileUrl = useMemo(
    () => getTMDbProfileUrl(person.profile_path),
    [person.profile_path],
  );

  const lifespan = useMemo(
    () => formatLifespan(person.birthday, person.deathday),
    [person.birthday, person.deathday],
  );

  const departmentLabel =
    PERSON_DEPARTMENT_LABELS[person.known_for_department] ??
    person.known_for_department;

  const isBiographyClampable =
    person.biography.length > PERSON_BIOGRAPHY_CLAMP_CHARS;

  return (
    <section className={styles.c_person_profile}>
      <div className={styles.c_person_profile__visual}>
        {profileUrl ? (
          <Image
            src={profileUrl}
            alt={person.name}
            width={IMAGE_SIZES.PERSON_PROFILE.WIDTH}
            height={IMAGE_SIZES.PERSON_PROFILE.HEIGHT}
            className={styles.c_person_profile__image}
            priority
          />
        ) : (
          <div className={styles.c_person_profile__placeholder} aria-hidden>
            {person.name.charAt(0)}
          </div>
        )}
      </div>

      <div className={styles.c_person_profile__body}>
        <h1 className={styles.c_person_profile__name}>{person.name}</h1>

        {departmentLabel && (
          <p className={styles.c_person_profile__department}>
            {departmentLabel}
          </p>
        )}

        {(lifespan || person.place_of_birth) && (
          <dl className={styles.c_person_profile__meta}>
            {lifespan && (
              <>
                <dt className={styles.c_person_profile__meta_label}>
                  {PERSON_MESSAGES.BIRTHDAY_LABEL}
                </dt>
                <dd className={styles.c_person_profile__meta_value}>
                  {lifespan}
                </dd>
              </>
            )}
            {person.place_of_birth && (
              <>
                <dt className={styles.c_person_profile__meta_label}>
                  {PERSON_MESSAGES.PLACE_OF_BIRTH_LABEL}
                </dt>
                <dd className={styles.c_person_profile__meta_value}>
                  {person.place_of_birth}
                </dd>
              </>
            )}
          </dl>
        )}

        <div className={styles.c_person_profile__biography}>
          <h2 className={styles.c_person_profile__biography_heading}>
            {PERSON_MESSAGES.BIOGRAPHY_HEADING}
          </h2>

          {person.biography ? (
            <>
              {person.is_biography_fallback && (
                <p className={styles.c_person_profile__biography_note}>
                  {PERSON_MESSAGES.BIOGRAPHY_FALLBACK_NOTE}
                </p>
              )}
              <p
                className={cn(
                  styles.c_person_profile__biography_text,
                  isBiographyClampable &&
                    !isBiographyExpanded &&
                    styles.c_person_profile__biography_text_clamped,
                )}
              >
                {person.biography}
              </p>
              {isBiographyClampable && (
                <button
                  type='button'
                  className={styles.c_person_profile__biography_toggle}
                  onClick={handleBiographyToggle}
                  aria-expanded={isBiographyExpanded}
                >
                  {isBiographyExpanded
                    ? PERSON_MESSAGES.BIOGRAPHY_COLLAPSE
                    : PERSON_MESSAGES.BIOGRAPHY_EXPAND}
                </button>
              )}
            </>
          ) : (
            <p className={styles.c_person_profile__biography_empty}>
              {PERSON_MESSAGES.BIOGRAPHY_EMPTY}
            </p>
          )}
        </div>
      </div>
    </section>
  );
});

PersonProfile.displayName = 'PersonProfile';
