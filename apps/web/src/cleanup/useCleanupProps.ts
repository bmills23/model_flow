import { useEffect, useState } from 'react';
import { loadCleanupProps, type CleanupProps } from './ssg';

/** The partition and solubility values of the database, loaded on first use; null until they arrive. */
export function useCleanupProps(): CleanupProps | null {
  const [props, setProps] = useState<CleanupProps | null>(null);
  useEffect(() => {
    let live = true;
    loadCleanupProps().then(
      (p) => live && setProps(p),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return props;
}
