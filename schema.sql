-- Table pour les recettes
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  dish_type TEXT CHECK (dish_type IN ('Entrée', 'Plat principal', 'Salade repas', 'Dessert')),
  main_protein TEXT,
  instructions TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table pour les ingrédients d'une recette
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table pour les tags/étiquettes
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL
);

-- Table de liaison entre recettes et tags
CREATE TABLE recipe_tags (
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, tag_id)
);

-- Table pour les menus hebdomadaires
CREATE TABLE weekly_menus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  start_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table de liaison pour les recettes dans un menu hebdomadaire
CREATE TABLE weekly_menu_recipes (
  menu_id UUID REFERENCES weekly_menus(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  day_of_week INT, -- 1 = Lundi, 7 = Dimanche
  PRIMARY KEY (menu_id, recipe_id)
);

-- Setup Storage for recipe images
insert into storage.buckets (id, name, public) values ('recipe-images', 'recipe-images', true);

create policy "Images publiques"
  on storage.objects for select
  using ( bucket_id = 'recipe-images' );

create policy "Insertion d'images"
  on storage.objects for insert
  with check ( bucket_id = 'recipe-images' );

create policy "Modification d'images"
  on storage.objects for update
  using ( bucket_id = 'recipe-images' );

create policy "Suppression d'images"
  on storage.objects for delete
  using ( bucket_id = 'recipe-images' );
