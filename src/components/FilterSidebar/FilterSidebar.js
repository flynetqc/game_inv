'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import styles from './FilterSidebar.module.css';

export default function FilterSidebar({ tags }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentType = searchParams.get('type');
  const currentProtein = searchParams.get('protein');
  const currentTag = searchParams.get('tag');

  const createQueryString = (name, value) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(name, value);
    } else {
      params.delete(name);
    }
    return params.toString();
  };

  const handleFilter = (name, value) => {
    router.push(pathname + '?' + createQueryString(name, value));
  };

  const clearFilters = () => {
    router.push(pathname);
  };

  const dishTypes = ['Entrée', 'Plat principal', 'Salade repas', 'Dessert'];
  const proteins = ['Poulet', 'Bœuf', 'Porc', 'Poisson', 'Végétarien', 'Tofu'];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.section}>
        <h3 className={styles.title}>Type de plat</h3>
        <div className={styles.list}>
          {dishTypes.map((type) => (
            <button
              key={type}
              onClick={() => handleFilter('type', currentType === type ? null : type)}
              className={`${styles.filterLink} ${currentType === type ? styles.filterLinkActive : ''}`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.title}>Protéine</h3>
        <div className={styles.list}>
          {proteins.map((protein) => (
            <button
              key={protein}
              onClick={() => handleFilter('protein', currentProtein === protein ? null : protein)}
              className={`${styles.filterLink} ${currentProtein === protein ? styles.filterLinkActive : ''}`}
            >
              {protein}
            </button>
          ))}
        </div>
      </div>

      {tags && tags.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.title}>Thèmes</h3>
          <div className={styles.list}>
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleFilter('tag', currentTag === tag.name ? null : tag.name)}
                className={`${styles.filterLink} ${currentTag === tag.name ? styles.filterLinkActive : ''}`}
              >
                #{tag.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {(currentType || currentProtein || currentTag) && (
        <button onClick={clearFilters} className={styles.clearButton}>
          Effacer les filtres
        </button>
      )}
    </aside>
  );
}
