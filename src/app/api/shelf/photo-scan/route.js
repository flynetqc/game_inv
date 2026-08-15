import { NextResponse } from 'next/server';
import { createWorker } from 'tesseract.js';
import { getGames, updateGameLocation } from '@/lib/db';
import { findBestGameMatch } from '@/lib/fuzzyMatch';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('image');
    const targetLocation = formData.get('targetLocation')?.toString().trim() || '';

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier image fourni." }, { status: 400 });
    }

    if (!targetLocation) {
      return NextResponse.json({ error: "Veuillez spécifier l'emplacement de la tablette." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Initialiser le worker OCR Tesseract (français + anglais)
    const worker = await createWorker(['fra', 'eng']);
    const ocrResult = await worker.recognize(buffer);
    await worker.terminate();

    const fullText = ocrResult.data.text || '';
    const lines = fullText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length >= 2);

    // Récupérer tous les jeux de la collection
    const allGames = getGames() || [];

    // Déduplication stricte par ID de jeu : Map<gameId, ResultObject>
    const detectedGamesMap = new Map();

    // 1. Analyse ligne par ligne
    for (const line of lines) {
      const cleanLine = line.replace(/^[|!/\\_.,;:~*#@°^`'"]+|[|!/\\_.,;:~*#@°^`'"]+$/g, '').trim();
      if (cleanLine.length < 2) continue;

      const match = findBestGameMatch(cleanLine, allGames, 0.45);
      if (match && match.game) {
        const gameId = match.game.id;
        const confidencePct = Math.round(match.similarity * 100);

        if (!detectedGamesMap.has(gameId) || detectedGamesMap.get(gameId).confidence < confidencePct) {
          detectedGamesMap.set(gameId, {
            game: match.game,
            detectedText: cleanLine,
            confidence: confidencePct,
            alreadyOnShelf: match.game.location === targetLocation,
            previousLocation: match.game.location || null
          });
        }
      }
    }

    // 2. Analyse sur des blocs combinés (pour les titres multi-lignes sur les boîtes)
    for (let i = 0; i < lines.length - 1; i++) {
      const combined = `${lines[i]} ${lines[i + 1]}`.trim();
      const match = findBestGameMatch(combined, allGames, 0.5);
      if (match && match.game) {
        const gameId = match.game.id;
        const confidencePct = Math.round(match.similarity * 100);

        if (!detectedGamesMap.has(gameId) || detectedGamesMap.get(gameId).confidence < confidencePct) {
          detectedGamesMap.set(gameId, {
            game: match.game,
            detectedText: combined,
            confidence: confidencePct,
            alreadyOnShelf: match.game.location === targetLocation,
            previousLocation: match.game.location || null
          });
        }
      }
    }

    // Convertir la Map dédupliquée en tableau ordonné par confiance décroissante
    const uniqueDetectedGames = Array.from(detectedGamesMap.values())
      .sort((a, b) => b.confidence - a.confidence);

    return NextResponse.json({
      success: true,
      targetLocation,
      totalDetected: uniqueDetectedGames.length,
      games: uniqueDetectedGames,
      rawOcrText: fullText
    });

  } catch (error) {
    console.error("Erreur lors de l'analyse OCR de la tablette:", error);
    return NextResponse.json({
      error: "Erreur lors du traitement de l'image de la tablette.",
      details: error.message
    }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { targetLocation, gameIds } = await request.json();

    if (!targetLocation) {
      return NextResponse.json({ error: "Emplacement cible manquant." }, { status: 400 });
    }

    if (!Array.isArray(gameIds) || gameIds.length === 0) {
      return NextResponse.json({ error: "Aucun jeu sélectionné à enregistrer." }, { status: 400 });
    }

    // Dédupliquer les IDs reçus pour garantir qu'aucun doublon n'est inséré
    const uniqueGameIds = Array.from(new Set(gameIds));

    let updatedCount = 0;
    for (const id of uniqueGameIds) {
      updateGameLocation(id, targetLocation.trim());
      updatedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `${updatedCount} jeu${updatedCount > 1 ? 'x ont été rangés' : ' a été rangé'} sur la tablette "${targetLocation}".`,
      updatedCount
    });

  } catch (error) {
    console.error("Erreur lors de la mise à jour des emplacements:", error);
    return NextResponse.json({
      error: "Erreur lors de l'enregistrement des emplacements.",
      details: error.message
    }, { status: 500 });
  }
}
