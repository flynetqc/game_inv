import { getGames, getAllMechanics, getAllThemes } from '@/lib/db';
import CollectionManager from '@/components/CollectionManager';
import fallbackGames from '@/lib/games_fallback.json';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function Home() {
  let initialGames = fallbackGames || [];
  let allMechanics = [];
  let allThemes = [];

  try {
    const gamesFromDb = getGames();
    if (gamesFromDb && gamesFromDb.length > 0) {
      initialGames = gamesFromDb;
    }
  } catch (error) {
    console.warn("Chargement depuis fallbackGames suite à:", error.message);
  }

  try {
    allMechanics = getAllMechanics();
    allThemes = getAllThemes();
  } catch (error) {
    console.warn("Erreur chargement thèmes/mécaniques:", error.message);
  }

  if (!allMechanics || allMechanics.length === 0) {
    const mechs = new Set(initialGames.flatMap(g => g.mechanics || []));
    allMechanics = Array.from(mechs).sort();
  }

  if (!allThemes || allThemes.length === 0) {
    const th = new Set(initialGames.flatMap(g => g.themes || []));
    allThemes = Array.from(th).sort();
  }

  return (
    <CollectionManager
      initialGames={initialGames}
      allMechanics={allMechanics}
      allThemes={allThemes}
    />
  );
}
