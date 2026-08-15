import { getGames, getAllMechanics, getAllThemes } from '@/lib/db';
import CollectionManager from '@/components/CollectionManager';

// Désactiver la mise en cache statique pour que la page affiche toujours les données les plus récentes de SQLite
export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function Home() {
  // Récupérer la collection initiale depuis SQLite (s'exécute côté serveur)
  const initialGames = getGames();
  const allMechanics = getAllMechanics();
  const allThemes = getAllThemes();

  return (
    <CollectionManager
      initialGames={initialGames}
      allMechanics={allMechanics}
      allThemes={allThemes}
    />
  );
}
