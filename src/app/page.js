import { getGames, getAllMechanics, getAllThemes } from '@/lib/db';
import CollectionManager from '@/components/CollectionManager';

// Désactiver la mise en cache statique pour que la page affiche toujours les données les plus récentes de SQLite
export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function Home() {
  let initialGames = [];
  let allMechanics = [];
  let allThemes = [];

  try {
    initialGames = getGames() || [];
    allMechanics = getAllMechanics() || [];
    allThemes = getAllThemes() || [];
  } catch (error) {
    console.error("Erreur serveur lors de la récupération des jeux:", error);
  }

  return (
    <CollectionManager
      initialGames={initialGames}
      allMechanics={allMechanics}
      allThemes={allThemes}
    />
  );
}
