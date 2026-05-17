import Link from 'next/link';
import Image from 'next/image';
import styles from './RecipeCard.module.css';

export default function RecipeCard({ recipe }) {
  return (
    <Link href={`/recipes/${recipe.id}`} className={styles.card}>
      <div className={styles.imageContainer}>
        {recipe.image_url ? (
          <Image 
            src={recipe.image_url} 
            alt={recipe.title} 
            fill
            className={styles.image}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
            Aucune image
          </div>
        )}
      </div>
      <div className={styles.content}>
        <h3 className={styles.title}>{recipe.title}</h3>
        <div className={styles.meta}>
          {recipe.dish_type && (
            <span className={styles.badge}>{recipe.dish_type}</span>
          )}
          {recipe.main_protein && (
            <span className={styles.proteinBadge}>{recipe.main_protein}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
