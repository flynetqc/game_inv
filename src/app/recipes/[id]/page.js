import Image from 'next/image';
import { notFound } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import styles from './page.module.css';

export default async function RecipeDetail(props) {
  const { id } = await props.params;

  // Fetch recipe with its ingredients and tags
  const { data: recipe, error } = await supabase
    .from('recipes')
    .select(`
      *,
      ingredients (*),
      recipe_tags (
        tags (name)
      )
    `)
    .eq('id', id)
    .single();

  if (error || !recipe) {
    console.error('Error fetching recipe:', error);
    notFound();
  }

  // Extract tags from junction table
  const tags = recipe.recipe_tags.map(rt => rt.tags.name);

  return (
    <div className={styles.container}>
      <article className={styles.card}>
        {recipe.image_url && (
          <div className={styles.heroImage}>
            <Image 
              src={recipe.image_url} 
              alt={recipe.title} 
              fill
              priority
              className={styles.image}
            />
          </div>
        )}
        
        <div className={styles.content}>
          <header className={styles.header}>
            <h1 className={styles.title}>{recipe.title}</h1>
            <div className={styles.meta}>
              {recipe.dish_type && (
                <span className={styles.badge}>{recipe.dish_type}</span>
              )}
              {recipe.main_protein && (
                <span className={styles.proteinBadge}>{recipe.main_protein}</span>
              )}
              {tags.map(tag => (
                <span key={tag} className={styles.tagBadge}>#{tag}</span>
              ))}
            </div>
          </header>

          <div className={styles.body}>
            <div>
              <h2 className={styles.sectionTitle}>Ingrédients</h2>
              <ul className={styles.ingredientsList}>
                {recipe.ingredients.map(ingredient => (
                  <li key={ingredient.id} className={styles.ingredientItem}>
                    <span className={styles.ingredientName}>{ingredient.name}</span>
                    <span className={styles.ingredientQty}>
                      {ingredient.quantity} {ingredient.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className={styles.sectionTitle}>Instructions</h2>
              <div className={styles.instructions}>
                {recipe.instructions || "Aucune instruction fournie."}
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
