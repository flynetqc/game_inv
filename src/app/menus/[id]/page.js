import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import RecipeCard from '../../../components/RecipeCard/RecipeCard';
import PrintMenuButton from '../../../components/PrintButton/PrintMenuButton';
import styles from './page.module.css';

export default async function MenuDetail(props) {
  const { id } = await props.params;

  // Fetch menu and its recipes
  const { data: menu, error } = await supabase
    .from('weekly_menus')
    .select(`
      *,
      weekly_menu_recipes (
        recipes (
          id, title, image_url, dish_type, main_protein,
          recipe_tags (
            tags (name)
          )
        )
      )
    `)
    .eq('id', id)
    .single();

  if (error || !menu) {
    console.error('Error fetching menu:', error);
    notFound();
  }

  const recipes = menu.weekly_menu_recipes.map(wmr => wmr.recipes).filter(Boolean);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{menu.name}</h1>
          {menu.start_date && (
            <div className={styles.date}>
              Semaine du {new Date(menu.start_date).toLocaleDateString('fr-FR')}
            </div>
          )}
        </div>
        <div className={styles.actions}>
          <Link href={`/menus/${menu.id}/grocery`} className={styles.button}>
            🛒 Liste d'épicerie
          </Link>
          <PrintMenuButton className={styles.buttonOutline} />
        </div>
      </header>

      <div className={styles.grid}>
        {recipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
    </div>
  );
}
