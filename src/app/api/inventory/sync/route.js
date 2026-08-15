import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { getGames, updateGameLocation } from '@/lib/db';
import { matchInventoryToCatalog } from '@/lib/fuzzyMatch';

/**
 * POST /api/inventory/sync
 * Analyse un fichier CSV/TSV ou un texte copié de Google Sheet
 * et renvoie un rapport d'aperçu d'appariement flou (fuzzy match) avec SQLite.
 */
export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let rowsData = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      const rawText = formData.get('rawText');

      if (file && typeof file.text === 'function') {
        const text = await file.text();
        const parseResult = Papa.parse(text, { header: true, skipEmptyLines: true });
        rowsData = parseResult.data || [];
      } else if (rawText) {
        const parseResult = Papa.parse(rawText, { header: true, skipEmptyLines: true });
        rowsData = parseResult.data || [];
      }
    } else if (contentType.includes('application/json')) {
      const body = await request.json();
      const { rawText, rows } = body;

      if (Array.isArray(rows)) {
        rowsData = rows;
      } else if (rawText) {
        const parseResult = Papa.parse(rawText, { header: true, skipEmptyLines: true });
        rowsData = parseResult.data || [];
      }
    }

    if (!rowsData || rowsData.length === 0) {
      return NextResponse.json({ 
        error: "Aucune donnée valide trouvée. Assurez-vous d'importer un fichier CSV/TSV ou de coller des lignes comportant des en-têtes (ex: 'Nom du jeu', 'Tablette')." 
      }, { status: 400 });
    }

    // Détecter dynamiquement les colonnes de Titre et de Localisation
    const firstRow = rowsData[0];
    const keys = Object.keys(firstRow);

    const nameKey = keys.find(k => {
      const norm = k.toLowerCase().replace(/[\s_-]/g, '');
      return norm.includes('nom') || norm.includes('jeu') || norm.includes('title') || norm.includes('name');
    });

    const locationKey = keys.find(k => {
      const norm = k.toLowerCase().replace(/[\s_-]/g, '');
      return norm.includes('tablette') || norm.includes('location') || norm.includes('emplacement') || norm.includes('etagere') || norm.includes('shelf');
    });

    if (!nameKey) {
      return NextResponse.json({
        error: "Impossible d'identifier la colonne du nom du jeu dans votre fichier. Assurez-vous qu'elle s'appelle 'Nom du jeu' ou 'Titre'.",
        availableHeaders: keys
      }, { status: 400 });
    }

    // Extraire les paires (titre brut, localisation)
    const inventoryRows = [];
    for (const row of rowsData) {
      const rawTitle = row[nameKey]?.trim();
      const location = locationKey ? (row[locationKey]?.trim() || '') : '';
      if (rawTitle) {
        inventoryRows.push({ rawTitle, location });
      }
    }

    // Charger tous les jeux actuels de la base SQLite
    const catalogGames = getGames();

    // Effectuer le rapprochement intelligent
    const matchReport = matchInventoryToCatalog(inventoryRows, catalogGames);

    return NextResponse.json({
      success: true,
      totalParsedRows: inventoryRows.length,
      matched: matchReport.matched,
      unmatchedInventory: matchReport.unmatchedInventory,
      missingCatalogGames: matchReport.missingCatalogGames
    });

  } catch (error) {
    console.error("Erreur dans POST /api/inventory/sync:", error);
    return NextResponse.json({ 
      error: "Une erreur est survenue lors de l'analyse de l'inventaire.",
      details: error.message 
    }, { status: 500 });
  }
}

/**
 * PATCH /api/inventory/sync
 * Applique la synchronisation validée par l'utilisateur :
 * - Mettre à jour les emplacements physiques
 * - Optionnellement vider les emplacements des jeux absents du Sheet
 */
export async function PATCH(request) {
  try {
    const { updates, gameIdsToClear } = await request.json();

    let updatedCount = 0;
    let clearedCount = 0;

    // 1. Appliquer les mises à jour d'emplacements
    if (Array.isArray(updates)) {
      for (const update of updates) {
        if (update.gameId && typeof update.location === 'string') {
          updateGameLocation(parseInt(update.gameId, 10), update.location.trim());
          updatedCount++;
        }
      }
    }

    // 2. Vider la localisation des jeux absents (si demandé par l'utilisateur)
    if (Array.isArray(gameIdsToClear)) {
      for (const id of gameIdsToClear) {
        updateGameLocation(parseInt(id, 10), null);
        clearedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `${updatedCount} localisations mises à jour en base de données.`,
      updatedCount,
      clearedCount
    });

  } catch (error) {
    console.error("Erreur dans PATCH /api/inventory/sync:", error);
    return NextResponse.json({
      error: "Une erreur est survenue lors de l'enregistrement en base de données.",
      details: error.message
    }, { status: 500 });
  }
}
