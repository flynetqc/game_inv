'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import styles from './MenuForm.module.css';

export default function MenuForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipes, setSelectedRecipes] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    start_date: ''
  });

  useEffect(() => {
    async function fetchRecipes() {
      const { data } = await supabase
        .from('recipes')
        .select('id, title, dish_type')
        .order('title');
      
      if (data) {
        setRecipes(data);
      }
    }
    fetchRecipes();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleRecipe = (recipe) => {
    const isSelected = selectedRecipes.find(r => r.id === recipe.id);
    if (isSelected) {
      setSelectedRecipes(selectedRecipes.filter(r => r.id !== recipe.id));
    } else {
      setSelectedRecipes([...selectedRecipes, recipe]);
    }
  };

  const removeSelected = (id) => {
    setSelectedRecipes(selectedRecipes.filter(r => r.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedRecipes.length === 0) {
      alert('Veuillez sélectionner au moins une recette.');
      return;
    }
    
    setLoading(true);

    try {
      // 1. Create Menu
      const { data: menu, error: menuError } = await supabase
        .from('weekly_menus')
        .insert({
          name: formData.name,
          start_date: formData.start_date || null
        })
        .select()
        .single();

      if (menuError) throw menuError;

      // 2. Link recipes to menu
      const menuRecipesToInsert = selectedRecipes.map((recipe, index) => ({
        menu_id: menu.id,
        recipe_id: recipe.id,
        day_of_week: index + 1 // Simply assign 1 to N for now
      }));

      const { error: linkError } = await supabase
        .from('weekly_menu_recipes')
        .insert(menuRecipesToInsert);

      if (linkError) throw linkError;

      router.push('/menus');
      router.refresh();
    } catch (error) {
      console.error('Error saving menu:', error);
      alert('Une erreur est survenue lors de la sauvegarde du menu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Nouveau Menu Hebdomadaire</h1>
      
      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="name">Nom du menu * (ex: Semaine du 12 Mai)</label>
          <input
            type="text"
            id="name"
            name="name"
            required
            className={styles.input}
            value={formData.name}
            onChange={handleChange}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="start_date">Date de début (optionnel)</label>
          <input
            type="date"
            id="start_date"
            name="start_date"
            className={styles.input}
            value={formData.start_date}
            onChange={handleChange}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Sélectionnez des recettes</label>
          <div className={styles.recipeList}>
            {recipes.map(recipe => {
              const isSelected = selectedRecipes.some(r => r.id === recipe.id);
              return (
                <div 
                  key={recipe.id} 
                  className={`${styles.recipeItem} ${isSelected ? styles.recipeItemSelected : ''}`}
                  onClick={() => toggleRecipe(recipe)}
                >
                  <span className={styles.recipeTitle}>{recipe.title}</span>
                  <span className={styles.recipeType}>{recipe.dish_type}</span>
                </div>
              );
            })}
          </div>
        </div>

        {selectedRecipes.length > 0 && (
          <div className={styles.selectedRecipes}>
            <h3 className={styles.label}>Recettes sélectionnées ({selectedRecipes.length})</h3>
            <ul className={styles.selectedList}>
              {selectedRecipes.map(recipe => (
                <li key={recipe.id} className={styles.selectedItem}>
                  <span>{recipe.title}</span>
                  <button 
                    type="button" 
                    onClick={() => removeSelected(recipe.id)}
                    className={styles.removeButton}
                  >
                    X
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" onClick={() => router.back()} className={styles.buttonOutline}>
            Annuler
          </button>
          <button type="submit" className={styles.button} disabled={loading || selectedRecipes.length === 0}>
            {loading ? 'Enregistrement...' : 'Sauvegarder le menu'}
          </button>
        </div>
      </form>
    </div>
  );
}
