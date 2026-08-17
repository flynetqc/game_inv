import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { fetchBggDetails } from '@/lib/bgg';
import { 
  insertOrUpdateGame, 
  clearGameRelations, 
  insertMechanic, 
  linkGameMechanic, 
  insertTheme, 
  linkGameTheme,
  getSetting,
  setSetting
} from '@/lib/db';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    
    let token = formData.get('bgg_api_token')?.trim() || '';
    if (token) {
      setSetting('bgg_api_token', token);
    } else {
      token = getSetting('bgg_api_token') || '';
    }
    
    // Jeton optionnel pour l'import de base. Si absent, on ignore l'API BGG et importe uniquement via le CSV.

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier CSV fourni' }, { status: 400 });
    }
    
    const csvText = await file.text();
    
    // Parser le CSV avec PapaParse
    const parseResult = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    });
    
    if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
      return NextResponse.json({ 
        error: 'Le fichier CSV est invalide ou corrompu', 
        details: parseResult.errors 
      }, { status: 400 });
    }
    
    const rows = parseResult.data;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Le fichier CSV est vide' }, { status: 400 });
    }
    
    // Détection dynamique des en-têtes de colonne
    const firstRow = rows[0];
    const keys = Object.keys(firstRow);
    
    // Trouver les clés correspondantes
    const idKey = keys.find(k => {
      const normalized = k.toLowerCase().replace(/[\s_-]/g, '');
      return normalized === 'objectid' || normalized === 'id' || normalized === 'gameid' || normalized === 'bggid';
    });
               
    const nameKey = keys.find(k => {
      const normalized = k.toLowerCase().replace(/[\s_-]/g, '');
      return normalized === 'objectname' || normalized === 'name' || normalized === 'title' || normalized === 'gamename';
    });
                 
    const ratingKey = keys.find(k => {
      const normalized = k.toLowerCase().replace(/[\s_-]/g, '');
      return normalized === 'myrating' || normalized === 'rating' || normalized === 'userrating';
    });
                   
    const numPlaysKey = keys.find(k => {
      const normalized = k.toLowerCase().replace(/[\s_-]/g, '');
      return normalized === 'numplays' || normalized === 'plays' || normalized === 'playcount';
    });
                   
    const yearKey = keys.find(k => {
      const normalized = k.toLowerCase().replace(/[\s_-]/g, '');
      return normalized === 'versionyearpublished' || normalized === 'yearpublished' || normalized === 'year';
    });
                   
    const minPlayersKey = keys.find(k => {
      const normalized = k.toLowerCase().replace(/[\s_-]/g, '');
      return normalized === 'minplayers' || normalized === 'minplayer';
    });
    
    const maxPlayersKey = keys.find(k => {
      const normalized = k.toLowerCase().replace(/[\s_-]/g, '');
      return normalized === 'maxplayers' || normalized === 'maxplayer';
    });
    
    const playingTimeKey = keys.find(k => {
      const normalized = k.toLowerCase().replace(/[\s_-]/g, '');
      return normalized === 'playingtime' || normalized === 'playtime' || normalized === 'duration';
    });
    
    const invLocationKey = keys.find(k => {
      const normalized = k.toLowerCase().replace(/[\s_-]/g, '');
      return normalized === 'invlocation' || normalized === 'location' || normalized === 'inv_location';
    });

    const itemTypeKey = keys.find(k => k.toLowerCase().replace(/[\s_-]/g, '') === 'itemtype') ||
                        keys.find(k => k.toLowerCase().replace(/[\s_-]/g, '') === 'item_type') ||
                        keys.find(k => k.toLowerCase().replace(/[\s_-]/g, '') === 'type') ||
                        keys.find(k => k.toLowerCase().replace(/[\s_-]/g, '') === 'objecttype');

    if (!idKey) {
      return NextResponse.json({ 
        error: "Impossible de trouver la colonne d'identifiant du jeu BGG (par exemple: 'objectid' ou 'id') dans le CSV.",
        availableHeaders: keys
      }, { status: 400 });
    }
    
    // Traitement initial et dédoublonnage des jeux
    const gamesToProcess = [];
    for (const row of rows) {
      const bggIdStr = row[idKey];
      if (!bggIdStr) continue;
      const bggId = parseInt(bggIdStr.trim(), 10);
      if (isNaN(bggId)) continue;
      
      const ratingStr = ratingKey ? row[ratingKey] : null;
      let rating = null;
      if (ratingStr !== null && ratingStr !== undefined && ratingStr.trim() !== '') {
        rating = parseFloat(ratingStr);
        if (isNaN(rating) || rating === 0) rating = null; // BGG utilise souvent 0 ou vide pour non noté
      }
      
      const numPlaysStr = numPlaysKey ? row[numPlaysKey] : '0';
      const num_plays = parseInt(numPlaysStr.trim(), 10) || 0;
      
      const yearStr = yearKey ? row[yearKey] : null;
      let year_published = null;
      if (yearStr !== null && yearStr !== undefined && yearStr.trim() !== '') {
        year_published = parseInt(yearStr.trim(), 10);
        if (isNaN(year_published)) year_published = null;
      }

      const minPlayersStr = minPlayersKey ? row[minPlayersKey] : null;
      let min_players = null;
      if (minPlayersStr !== null && minPlayersStr !== undefined && minPlayersStr.trim() !== '') {
        min_players = parseInt(minPlayersStr.trim(), 10);
        if (isNaN(min_players)) min_players = null;
      }

      const maxPlayersStr = maxPlayersKey ? row[maxPlayersKey] : null;
      let max_players = null;
      if (maxPlayersStr !== null && maxPlayersStr !== undefined && maxPlayersStr.trim() !== '') {
        max_players = parseInt(maxPlayersStr.trim(), 10);
        if (isNaN(max_players)) max_players = null;
      }

      const playingTimeStr = playingTimeKey ? row[playingTimeKey] : null;
      let playing_time = null;
      if (playingTimeStr !== null && playingTimeStr !== undefined && playingTimeStr.trim() !== '') {
        playing_time = parseInt(playingTimeStr.trim(), 10);
        if (isNaN(playing_time)) playing_time = null;
      }

      const location = invLocationKey ? row[invLocationKey]?.trim() : null;
      
      const title = nameKey ? row[nameKey]?.trim() : `Jeu #${bggId}`;

      const rawItemType = itemTypeKey ? row[itemTypeKey]?.trim()?.toLowerCase() : '';
      let item_type = 'standalone';
      if (rawItemType === 'expansion' || rawItemType === 'boardgameexpansion') {
        item_type = 'expansion';
      }
      
      gamesToProcess.push({
        id: bggId,
        title,
        rating,
        num_plays,
        year_published,
        min_players,
        max_players,
        playing_time,
        location,
        item_type
      });
    }
    
    if (gamesToProcess.length === 0) {
      return NextResponse.json({ error: 'Aucun jeu valide trouvé dans le fichier CSV' }, { status: 400 });
    }
    
    // Récupérer la liste des IDs uniques
    const uniqueIds = Array.from(new Set(gamesToProcess.map(g => g.id)));
    
    // Récupérer les détails depuis l'API BGG en paquets de 20 (limite recommandée)
    const batchSize = 20;
    const bggDetailsMap = new Map();
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    if (token) {
      for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const batchIds = uniqueIds.slice(i, i + batchSize);
        console.log(`Récupération BGG API lot ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniqueIds.length / batchSize)}...`);
        
        // Respecter la politique de rate limiting (délai de 1.5s entre chaque appel)
        if (i > 0) {
          await delay(1500);
        }
        
        try {
          const details = await fetchBggDetails(batchIds, token);
          for (const detail of details) {
            bggDetailsMap.set(detail.id, detail);
          }
        } catch (err) {
          console.error(`Erreur sur le lot d'IDs [${batchIds.join(', ')}]:`, err);
          // On continue pour ne pas bloquer tout l'import si un lot échoue
        }
      }
    } else {
      console.log("Aucun jeton BGG fourni. Importation des jeux uniquement à partir du CSV.");
    }
    
    // Insertion dans SQLite
    let successCount = 0;
    
    for (const gameData of gamesToProcess) {
      const bggDetail = bggDetailsMap.get(gameData.id);
      
      // Assembler l'objet jeu final
      const finalGame = {
        id: gameData.id,
        title: bggDetail?.title || gameData.title,
        image_url: bggDetail?.image_url || null,
        thumbnail_url: bggDetail?.thumbnail_url || null,
        min_players: bggDetail?.min_players || gameData.min_players,
        max_players: bggDetail?.max_players || gameData.max_players,
        playing_time: bggDetail?.playing_time || gameData.playing_time,
        year_published: bggDetail?.year_published || gameData.year_published,
        description: bggDetail?.description || null,
        location: gameData.location || null,
        rating: gameData.rating || null,
        num_plays: gameData.num_plays || 0,
        item_type: gameData.item_type || null
      };
      
      try {
        // Enregistrer/mettre à jour dans la base
        insertOrUpdateGame(finalGame);
        
        // Effacer les anciennes relations de ce jeu pour ré-importation propre
        clearGameRelations(gameData.id);
        
        // Associer les mécaniques
        if (bggDetail?.mechanics) {
          for (const mechName of bggDetail.mechanics) {
            const mechId = insertMechanic(mechName);
            linkGameMechanic(gameData.id, mechId);
          }
        }
        
        // Associer les thèmes/catégories
        if (bggDetail?.themes) {
          for (const themeName of bggDetail.themes) {
            const themeId = insertTheme(themeName);
            linkGameTheme(gameData.id, themeId);
          }
        }
        
        successCount++;
      } catch (dbErr) {
        console.error(`Erreur d'écriture SQLite pour le jeu #${gameData.id} (${gameData.title}):`, dbErr);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `${successCount} jeux importés et enrichis avec succès depuis BoardGameGeek.`,
      totalFound: gamesToProcess.length,
      totalImported: successCount
    });
    
  } catch (error) {
    console.error('Erreur globale dans POST /api/import:', error);
    return NextResponse.json({ 
      error: "Une erreur est survenue lors de l'importation de votre collection.",
      details: error.message 
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const token = process.env.BGG_API_KEY || getSetting('bgg_api_token') || '4acd22b0-77b1-4c3c-81be-8878a5c9dc2b';
    const username = process.env.BGG_USERNAME || 'flynetqc';
    return NextResponse.json({ token, username });
  } catch (err) {
    console.error("Erreur lors de la récupération du token sauvegardé:", err);
    return NextResponse.json({ token: '4acd22b0-77b1-4c3c-81be-8878a5c9dc2b', username: 'flynetqc' });
  }
}
