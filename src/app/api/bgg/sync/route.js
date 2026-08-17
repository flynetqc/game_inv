import { NextResponse } from 'next/server';
import { fetchBggUserCollection } from '@/lib/bgg';
import { 
  insertOrUpdateGame, 
  setSetting,
  getSetting,
  getGames
} from '@/lib/db';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = (body.username || process.env.BGG_USERNAME || 'flynetqc').trim();
    let token = (body.bgg_api_token || process.env.BGG_API_KEY || getSetting('bgg_api_token') || '').trim();

    if (body.bgg_api_token && body.bgg_api_token.trim()) {
      setSetting('bgg_api_token', body.bgg_api_token.trim());
      token = body.bgg_api_token.trim();
    }

    if (!token) {
      return NextResponse.json({
        error: "Clé API BGG manquante. Veuillez renseigner votre clé API BoardGameGeek."
      }, { status: 400 });
    }

    console.log(`Démarrage de la synchronisation BGG pour ${username}...`);
    const bggGames = await fetchBggUserCollection(username, token);

    if (!bggGames || bggGames.length === 0) {
      return NextResponse.json({
        error: `Aucun jeu trouvé pour l'utilisateur "${username}" ou la collection est vide.`
      }, { status: 404 });
    }

    // Récupérer les jeux déjà en base pour compter les nouveaux vs mis à jour
    const existingGames = getGames() || [];
    const existingIds = new Set(existingGames.map(g => g.id));

    let newCount = 0;
    let updatedCount = 0;

    for (const game of bggGames) {
      if (existingIds.has(game.id)) {
        updatedCount++;
      } else {
        newCount++;
      }
      insertOrUpdateGame(game);
    }

    // Récupérer la collection fraîche
    const refreshedGames = getGames();

    return NextResponse.json({
      success: true,
      message: `Synchronisation BGG réussie ! ${bggGames.length} jeux récupérés (${newCount} nouveau(x), ${updatedCount} mis à jour).`,
      total: bggGames.length,
      newCount,
      updatedCount,
      games: refreshedGames
    });

  } catch (error) {
    console.error("Erreur sync BGG API:", error);
    return NextResponse.json({
      error: error.message || "Erreur lors de la synchronisation avec BoardGameGeek."
    }, { status: 500 });
  }
}
