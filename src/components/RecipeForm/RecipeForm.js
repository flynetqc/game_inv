'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import styles from './RecipeForm.module.css';

export default function RecipeForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    dish_type: 'Plat principal',
    main_protein: '',
    instructions: '',
    tags: ''
  });

  const [ingredients, setIngredients] = useState([
    { name: '', quantity: '', unit: '' }
  ]);

  const dishTypes = ['Entrée', 'Plat principal', 'Salade repas', 'Dessert'];
  const proteins = ['Poulet', 'Bœuf', 'Porc', 'Poisson', 'Végétarien', 'Tofu', 'Œufs', 'Légumineuses'];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleIngredientChange = (index, field, value) => {
    const newIngredients = [...ingredients];
    newIngredients[index][field] = value;
    setIngredients(newIngredients);
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { name: '', quantity: '', unit: '' }]);
  };

  const removeIngredient = (index) => {
    if (ingredients.length > 1) {
      const newIngredients = [...ingredients];
      newIngredients.splice(index, 1);
      setIngredients(newIngredients);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let imageUrl = null;

      // 1. Upload Image
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `public/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('recipe-images')
          .upload(filePath, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('recipe-images')
          .getPublicUrl(filePath);
        
        imageUrl = publicUrl;
      }

      // 2. Insert Recipe
      const { data: recipe, error: recipeError } = await supabase
        .from('recipes')
        .insert({
          title: formData.title,
          description: formData.description,
          dish_type: formData.dish_type,
          main_protein: formData.main_protein,
          instructions: formData.instructions,
          image_url: imageUrl
        })
        .select()
        .single();

      if (recipeError) throw recipeError;

      // 3. Insert Ingredients
      const validIngredients = ingredients.filter(i => i.name.trim() !== '');
      if (validIngredients.length > 0) {
        const ingredientsToInsert = validIngredients.map(i => ({
          recipe_id: recipe.id,
          name: i.name,
          quantity: i.quantity ? parseFloat(i.quantity) : null,
          unit: i.unit
        }));

        const { error: ingredientsError } = await supabase
          .from('ingredients')
          .insert(ingredientsToInsert);

        if (ingredientsError) throw ingredientsError;
      }

      // 4. Handle Tags
      if (formData.tags.trim()) {
        const tagNames = formData.tags.split(',').map(t => t.trim()).filter(t => t);
        
        for (const tagName of tagNames) {
          // Upsert tag (insert if not exists)
          // Since Supabase doesn't have a simple upsert returning id without onConflict, 
          // we do a select first, then insert if not found.
          let { data: tag } = await supabase
            .from('tags')
            .select('id')
            .eq('name', tagName)
            .single();
            
          if (!tag) {
            const { data: newTag, error: tagError } = await supabase
              .from('tags')
              .insert({ name: tagName })
              .select()
              .single();
              
            if (tagError) throw tagError;
            tag = newTag;
          }

          // Link tag to recipe
          await supabase
            .from('recipe_tags')
            .insert({ recipe_id: recipe.id, tag_id: tag.id });
        }
      }

      router.push(`/recipes/${recipe.id}`);
      router.refresh(); // Refresh server components to show new data
    } catch (error) {
      console.error('Error saving recipe:', error);
      alert('Une erreur est survenue lors de la sauvegarde.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Nouvelle Recette</h1>
      
      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="title">Titre du plat *</label>
          <input
            type="text"
            id="title"
            name="title"
            required
            className={styles.input}
            value={formData.title}
            onChange={handleChange}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Photo</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className={styles.input}
          />
          {imagePreview && (
            <div className={styles.imagePreview}>
              <img src={imagePreview} alt="Aperçu" />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ flex: 1 }}>
            <label className={styles.label} htmlFor="dish_type">Type de plat</label>
            <select
              id="dish_type"
              name="dish_type"
              className={styles.select}
              value={formData.dish_type}
              onChange={handleChange}
            >
              {dishTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          
          <div style={{ flex: 1 }}>
            <label className={styles.label} htmlFor="main_protein">Protéine principale</label>
            <select
              id="main_protein"
              name="main_protein"
              className={styles.select}
              value={formData.main_protein}
              onChange={handleChange}
            >
              <option value="">Aucune / Autre</option>
              {proteins.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.formGroup}>
          <div className={styles.ingredientsHeader}>
            <label className={styles.label}>Ingrédients</label>
            <button 
              type="button" 
              onClick={addIngredient}
              className={styles.buttonOutline}
            >
              + Ajouter un ingrédient
            </button>
          </div>
          
          {ingredients.map((ingredient, index) => (
            <div key={index} className={styles.ingredientRow}>
              <input
                type="text"
                placeholder="Nom (ex: Farine)"
                className={`${styles.input} ${styles.ingredientInput}`}
                value={ingredient.name}
                onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
                required={index === 0}
              />
              <input
                type="number"
                step="any"
                placeholder="Qté"
                className={`${styles.input} ${styles.quantityInput}`}
                value={ingredient.quantity}
                onChange={(e) => handleIngredientChange(index, 'quantity', e.target.value)}
              />
              <input
                type="text"
                placeholder="Unité (g, ml, tasse...)"
                className={`${styles.input} ${styles.unitInput}`}
                value={ingredient.unit}
                onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
              />
              <button 
                type="button" 
                onClick={() => removeIngredient(index)}
                className={styles.buttonDanger}
                disabled={ingredients.length === 1}
              >
                X
              </button>
            </div>
          ))}
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="instructions">Instructions</label>
          <textarea
            id="instructions"
            name="instructions"
            className={styles.textarea}
            value={formData.instructions}
            onChange={handleChange}
            placeholder="Étape 1: ..."
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="tags">Tags (séparés par des virgules)</label>
          <input
            type="text"
            id="tags"
            name="tags"
            placeholder="Noël, Pâques, Été..."
            className={styles.input}
            value={formData.tags}
            onChange={handleChange}
          />
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={() => router.back()} className={styles.buttonOutline}>
            Annuler
          </button>
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? 'Enregistrement...' : 'Sauvegarder la recette'}
          </button>
        </div>
      </form>
    </div>
  );
}
