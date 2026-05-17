import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import PrintMenuButton from '../../../../components/PrintButton/PrintMenuButton';
import styles from './page.module.css';

export default async function GroceryListPage(props) {
  const { id } = await props.params;

  // Fetch menu and ingredients of its recipes
  const { data: menu, error } = await supabase
    .from('weekly_menus')
    .select(`
      *,
      weekly_menu_recipes (
        recipes (
          ingredients (name, quantity, unit)
        )
      )
    `)
    .eq('id', id)
    .single();

  if (error || !menu) {
    console.error('Error fetching menu for grocery list:', error);
    notFound();
  }

  // Aggregate ingredients
  const ingredientMap = new Map();

  menu.weekly_menu_recipes.forEach(wmr => {
    if (!wmr.recipes || !wmr.recipes.ingredients) return;
    
    wmr.recipes.ingredients.forEach(ing => {
      const name = ing.name.toLowerCase().trim();
      const unit = (ing.unit || '').toLowerCase().trim();
      const key = `${name}-${unit}`; // Group by name and unit

      if (ingredientMap.has(key)) {
        const existing = ingredientMap.get(key);
        existing.quantity += (ing.quantity || 0);
      } else {
        ingredientMap.set(key, {
          name: ing.name.charAt(0).toUpperCase() + ing.name.slice(1).trim(),
          quantity: ing.quantity || 0,
          unit: ing.unit || ''
        });
      }
    });
  });

  // Convert map to sorted array
  const groceryList = Array.from(ingredientMap.values()).sort((a, b) => 
    a.name.localeCompare(b.name)
  );

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Liste d'épicerie</h1>
            <p className={styles.subtitle}>Pour : {menu.name}</p>
          </div>
          <div className={styles.actions}>
            <Link href={`/menus/${menu.id}`} className={styles.buttonOutline}>
              Retour au menu
            </Link>
            <PrintMenuButton className={styles.button} />
          </div>
        </header>

        {groceryList.length > 0 ? (
          <ul className={styles.list}>
            {groceryList.map((item, index) => (
              <li key={index} className={styles.item}>
                <input type="checkbox" className={styles.checkbox} />
                <span className={styles.name}>{item.name}</span>
                {(item.quantity > 0 || item.unit) && (
                  <span className={styles.quantity}>
                    {item.quantity > 0 ? Math.round(item.quantity * 100) / 100 : ''} {item.unit}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>Aucun ingrédient trouvé pour ce menu.</p>
        )}
      </div>
    </div>
  );
}
