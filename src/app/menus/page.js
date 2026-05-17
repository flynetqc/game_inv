import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import styles from './page.module.css';

export default async function MenusPage() {
  // Fetch menus and count of recipes for each
  const { data: menus, error } = await supabase
    .from('weekly_menus')
    .select(`
      *,
      weekly_menu_recipes (count)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching menus:', error);
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Menus Hebdomadaires</h1>
        <Link href="/menus/new" className={styles.button}>
          + Créer un Menu
        </Link>
      </header>

      {menus && menus.length > 0 ? (
        <div className={styles.grid}>
          {menus.map((menu) => (
            <Link key={menu.id} href={`/menus/${menu.id}`} className={styles.menuCard}>
              <h2 className={styles.menuName}>{menu.name}</h2>
              {menu.start_date && (
                <div className={styles.menuDate}>
                  Semaine du {new Date(menu.start_date).toLocaleDateString('fr-FR')}
                </div>
              )}
              <div className={styles.recipeCount}>
                {menu.weekly_menu_recipes[0]?.count || 0} recettes
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <h2>Aucun menu trouvé</h2>
          <p>Commencez à planifier vos semaines en créant votre premier menu.</p>
          <Link href="/menus/new" className={styles.button}>
            Créer mon premier menu
          </Link>
        </div>
      )}
    </div>
  );
}
