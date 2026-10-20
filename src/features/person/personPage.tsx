/**
 * 人物ページ メインコンポーネント
 */

'use client';

import { memo, useCallback } from 'react';

import { Button } from '@/components/ui/button/button';
import { Loading } from '@/components/ui/loading/loading';
import { PERSON_ERROR_MESSAGES, PERSON_MESSAGES } from '@/constants';
import { PersonFilmography } from '@/features/person/component/personFilmography/personFilmography';
import { PersonProfile } from '@/features/person/component/personProfile/personProfile';
import { usePerson } from '@/features/person/hooks/usePerson';

import styles from './personPage.module.scss';

/**
 * PersonPageコンポーネントのプロパティ
 */
export interface PersonPageProps {
  /** 人物ID（ページ側で検証済み） */
  personId: number;
}

/**
 * PersonPageコンポーネント
 */
export const PersonPage = memo<PersonPageProps>(function PersonPage({
  personId,
}) {
  const { person, isLoading, isError, refetch } = usePerson(personId);

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <div className={styles.c_person_page}>
        <div className={styles.c_person_page__status}>
          <Loading size='md' />
        </div>
      </div>
    );
  }

  if (isError || !person) {
    return (
      <div className={styles.c_person_page}>
        <div className={styles.c_person_page__status} role='alert'>
          <p className={styles.c_person_page__message}>
            {PERSON_ERROR_MESSAGES.FETCH_FAILED}
          </p>
          <Button variant='secondary' onClick={handleRetry}>
            {PERSON_MESSAGES.RETRY}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.c_person_page}>
      <PersonProfile person={person} />
      {/*
        人物ページ間をクライアント遷移すると同じ位置のコンポーネントが
        再利用され、ページング位置が前の人物のまま残る。key で作り直す
      */}
      <PersonFilmography key={personId} credits={person.cast} />
    </div>
  );
});

PersonPage.displayName = 'PersonPage';
