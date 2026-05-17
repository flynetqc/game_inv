import { supabase } from '../lib/supabaseClient';
import styles from './page.module.css';
import RecipeCard from '../components/RecipeCard/RecipeCard';
import FilterSidebar from '../components/FilterSidebar/FilterSidebar';

export default async function Home(props) {
  const searchParams = await props.searchParams;
  
  const type = searchParams?.type;
  const protein = searchParams?.protein;
  const tag = searchParams?.tag;

  // Fetch tags for sidebar
  const { data: tags } = await supabase.from('tags').select('*').order('name');

  // Fetch recipes with filters
  let query = supabase.from('recipes').select(`
    *,
    recipe_tags!inner (
      tags!inner (name)
    )
  `).order('created_at', { ascending: false });

  if (type) {
    query = query.eq('dish_type', type);
  }
  
  if (protein) {
    query = query.eq('main_protein', protein);
  }
  
  // Note: Tag filtering might require a different approach depending on PostgREST 
  // capabilities. For a simple inner join, it works if we filter the related table.
  if (tag) {
    query = query.eq('recipe_tags.tags.name', tag);
  }

  const { data: recipes, error } = await query;

  if (error) {
    console.error('Error fetching recipes:', error);
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Vos Recettes</h1>
        <p>Gérez vos recettes, planifiez vos menus et générez vos listes d'épicerie.</p>
      </header>
      
      <div className={styles.mainLayout}>
        <FilterSidebar tags={tags || []} />
        
        <main className={styles.gallery}>
          {recipes && recipes.length > 0 ? (
            <div className={styles.grid}>
              {recipes.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <h2>Aucune recette trouvée</h2>
              <p>Essayez de modifier vos filtres ou ajoutez une nouvelle recette.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
