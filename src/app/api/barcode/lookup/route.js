import { NextResponse } from 'next/server';
import { getGames, getGameById, getGameByBarcode, updateGameLocation, updateGameBarcode } from '@/lib/db';
import { findBestGameMatch, calculateTitleSimilarity } from '@/lib/fuzzyMatch';

export const dynamic = 'force-dynamic';

async function fetchExternalProductName(barcode) {
  const cleanCode = barcode.trim();
  
  // 1. Essai UPCitemdb (très complet pour les jeux de société nord-américains)
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${cleanCode}`, {
      headers: { 'User-Agent': 'GeekShelf/1.0' },
      next: { revalidate: 3600 }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length > 0 && data.items[0].title) {
        return data.items[0].title;
      }
    }
  } catch (e) {
    // Ignorer
  }

  // 2. Essai Open Products Facts (européen et international)
  try {
    const res = await fetch(`https://world.openproductsfacts.org/api/v0/product/${cleanCode}.json`, {
      headers: { 'User-Agent': 'GeekShelf/1.0' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.product && (data.product.product_name || data.product.generic_name)) {
        return data.product.product_name || data.product.generic_name;
      }
    }
  } catch (e) {
    // Ignorer
  }

  return null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code')?.trim();

    if (!code) {
      return NextResponse.json({ error: "Code-barres manquant." }, { status: 400 });
    }

    const allGames = getGames() || [];

    // 1. Vérifier si ce code-barres a déjà été associé à un jeu dans notre base
    const directGame = getGameByBarcode(code);
    if (directGame) {
      return NextResponse.json({
        found: true,
        directMatch: true,
        barcode: code,
        game: directGame,
        confidence: 100,
      });
    }

    // 2. Interroger les annuaires de code-barres pour trouver le titre du produit
    const productName = await fetchExternalProductName(code);

    let matchedGame = null;
    let confidence = 0;
    let candidateGames = [];

    if (productName) {
      const matchResult = findBestGameMatch(productName, allGames, 0.40);
      if (matchResult && matchResult.game) {
        matchedGame = matchResult.game;
        confidence = Math.round(matchResult.similarity * 100);
      }

      // Proposer aussi les 3 meilleures alternatives proches
      candidateGames = allGames
        .map(g => ({ game: g, score: calculateTitleSimilarity(productName, g.title) }))
        .filter(item => item.score >= 0.35 && (!matchedGame || item.game.id !== matchedGame.id))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(item => ({
          ...item.game,
          confidence: Math.round(item.score * 100)
        }));
    }

    return NextResponse.json({
      found: !!matchedGame,
      directMatch: false,
      barcode: code,
      productName: productName || null,
      game: matchedGame,
      confidence,
      candidates: candidateGames,
    });

  } catch (error) {
    console.error("Erreur lors de la recherche de code-barres:", error);
    return NextResponse.json({
      error: "Erreur lors de la recherche du code-barres.",
      details: error.message
    }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { gameId, barcode, location } = await request.json();

    if (!gameId) {
      return NextResponse.json({ error: "ID du jeu requis." }, { status: 400 });
    }

    const id = parseInt(gameId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "ID de jeu invalide." }, { status: 400 });
    }

    if (location !== undefined) {
      updateGameLocation(id, location ? location.trim() : null);
    }

    if (barcode) {
      updateGameBarcode(id, barcode.trim());
    }

    const updatedGame = getGameById(id);

    return NextResponse.json({
      success: true,
      message: "Jeu mis à jour et rangé avec succès !",
      game: updatedGame
    });

  } catch (error) {
    console.error("Erreur lors de l'association du code-barres:", error);
    return NextResponse.json({
      error: "Erreur lors de l'enregistrement.",
      details: error.message
    }, { status: 500 });
  }
}
