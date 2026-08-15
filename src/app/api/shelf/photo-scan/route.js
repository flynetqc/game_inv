import { NextResponse } from 'next/server';
import { getGames, updateGameLocation } from '@/lib/db';
import { findBestGameMatch } from '@/lib/fuzzyMatch';

export const dynamic = 'force-dynamic';

async function detectGamesWithGeminiVision(base64Image) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || !base64Image) return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Examine this photo of a shelf containing board games. List ALL board game titles and expansion titles visible on the boxes (both horizontal and vertical boxes, including stylized fonts like 3 Ring Circus, boop, Mini Express, Splendor, etc.). Return ONLY a valid JSON array of strings containing the game titles, with no extra text or markdown formatting. Example: [\"Boop\", \"3 Ring Circus\", \"Mini Express\"]" },
            { inline_data: { mime_type: "image/jpeg", data: base64Image } }
          ]
        }]
      })
    });

    if (!response.ok) {
      console.warn("Gemini Vision API status:", response.status);
      return null;
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) return null;

    const cleanJson = textContent.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    console.error("Erreur Gemini Vision:", e);
  }
  return null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { targetLocation, text, lines = [], imageBase64 } = body;

    if (!targetLocation) {
      return NextResponse.json({ error: "Veuillez spécifier l'emplacement de la tablette." }, { status: 400 });
    }

    const allGames = getGames() || [];
    const detectedGamesMap = new Map();

    // 1. Tenter d'abord la reconnaissance Vision IA (Gemini) si une clé API est configurée
    let aiDetectedTitles = [];
    if (imageBase64) {
      aiDetectedTitles = (await detectGamesWithGeminiVision(imageBase64)) || [];
    }

    if (aiDetectedTitles.length > 0) {
      for (const title of aiDetectedTitles) {
        const match = findBestGameMatch(title, allGames, 0.40);
        if (match && match.game) {
          const gameId = match.game.id;
          const confidencePct = Math.round(match.similarity * 100);

          if (!detectedGamesMap.has(gameId) || detectedGamesMap.get(gameId).confidence < confidencePct) {
            detectedGamesMap.set(gameId, {
              game: match.game,
              detectedText: title,
              confidence: Math.max(90, confidencePct),
              alreadyOnShelf: match.game.location === targetLocation.trim(),
              previousLocation: match.game.location || null
            });
          }
        }
      }
    }

    // 2. Si l'IA n'est pas configurée ou pour compléter, utiliser les lignes OCR
    let allLines = Array.isArray(lines) ? lines.map(l => typeof l === 'string' ? l.trim() : '').filter(Boolean) : [];
    if (text && typeof text === 'string') {
      const splitLines = text.split('\n').map(l => l.trim()).filter(l => l.length >= 2);
      allLines = Array.from(new Set([...allLines, ...splitLines]));
    }

    // 2a. Analyse ligne par ligne
    for (const line of allLines) {
      const cleanLine = line.replace(/^[|!/\\_.,;:~*#@°^`'"]+|[|!/\\_.,;:~*#@°^`'"]+$/g, '').trim();
      if (cleanLine.length < 2) continue;

      const match = findBestGameMatch(cleanLine, allGames, 0.40);
      if (match && match.game) {
        const gameId = match.game.id;
        const confidencePct = Math.round(match.similarity * 100);

        if (!detectedGamesMap.has(gameId) || detectedGamesMap.get(gameId).confidence < confidencePct) {
          detectedGamesMap.set(gameId, {
            game: match.game,
            detectedText: cleanLine,
            confidence: confidencePct,
            alreadyOnShelf: match.game.location === targetLocation.trim(),
            previousLocation: match.game.location || null
          });
        }
      }
    }

    // 2b. Analyse sur des blocs combinés (2 lignes)
    for (let i = 0; i < allLines.length - 1; i++) {
      const combined = `${allLines[i]} ${allLines[i + 1]}`.trim();
      const match = findBestGameMatch(combined, allGames, 0.45);
      if (match && match.game) {
        const gameId = match.game.id;
        const confidencePct = Math.round(match.similarity * 100);

        if (!detectedGamesMap.has(gameId) || detectedGamesMap.get(gameId).confidence < confidencePct) {
          detectedGamesMap.set(gameId, {
            game: match.game,
            detectedText: combined,
            confidence: confidencePct,
            alreadyOnShelf: match.game.location === targetLocation.trim(),
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
      targetLocation: targetLocation.trim(),
      totalDetected: uniqueDetectedGames.length,
      games: uniqueDetectedGames,
      usedAiVision: aiDetectedTitles.length > 0
    });

  } catch (error) {
    console.error("Erreur lors de l'analyse des textes de la tablette:", error);
    return NextResponse.json({
      error: "Erreur lors du traitement des données.",
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
