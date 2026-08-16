import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

let db;

function getDbInstance() {
  if (global._sqliteDb) {
    return global._sqliteDb;
  }

  let dbPath = path.join(process.cwd(), 'boardgames.db');

  // En environnement Vercel / AWS Lambda, le dossier source (/var/task) est en lecture seule.
  // On copie la base SQLite vers /tmp (répertoire inscriptible) si elle n'existe pas encore dans /tmp.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmpDbPath = path.join('/tmp', 'boardgames.db');
    if (!fs.existsSync(tmpDbPath)) {
      if (fs.existsSync(dbPath)) {
        try {
          fs.copyFileSync(dbPath, tmpDbPath);
        } catch (err) {
          console.error("Erreur copie DB vers /tmp:", err);
        }
      }
    }
    dbPath = tmpDbPath;
  }

  let database;
  try {
    database = new DatabaseSync(dbPath);
  } catch (err) {
    console.error("Erreur ouverture DB path, essai mémoire:", err);
    database = new DatabaseSync(':memory:');
  }

  // Configurer immédiatement le timeout d'attente pour éviter les verrous concurrents (multi-workers)
  try {
    database.exec('PRAGMA busy_timeout = 10000;');
    database.exec('PRAGMA journal_mode = WAL;');
    database.exec('PRAGMA foreign_keys = ON;');
  } catch (e) {
    // Ignorer si déjà configuré
  }

  // Initialisation des tables (protégée contre les accès simultanés)
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        image_url TEXT,
        thumbnail_url TEXT,
        min_players INTEGER,
        max_players INTEGER,
        playing_time INTEGER,
        year_published INTEGER,
        description TEXT,
        location TEXT,
        rating REAL,
        num_plays INTEGER DEFAULT 0,
        item_type TEXT,
        last_imported_at TEXT
      );

      CREATE TABLE IF NOT EXISTS mechanics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS game_mechanics (
        game_id INTEGER,
        mechanic_id INTEGER,
        PRIMARY KEY (game_id, mechanic_id),
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
        FOREIGN KEY (mechanic_id) REFERENCES mechanics(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS themes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS game_themes (
        game_id INTEGER,
        theme_id INTEGER,
        PRIMARY KEY (game_id, theme_id),
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
        FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS custom_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS game_custom_tags (
        game_id INTEGER,
        tag_id INTEGER,
        PRIMARY KEY (game_id, tag_id),
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES custom_tags(id) ON DELETE CASCADE
      );
    `);
  } catch (e) {
    // Si un autre worker est déjà en train d'initialiser les tables
  }

  // Migration pour ajouter item_type si la table existe déjà sans cette colonne
  try {
    database.exec('ALTER TABLE games ADD COLUMN item_type TEXT;');
  } catch (e) {
    // Déjà présent
  }

  // Migration pour ajouter barcode si la table existe déjà sans cette colonne
  try {
    database.exec('ALTER TABLE games ADD COLUMN barcode TEXT;');
  } catch (e) {
    // Déjà présent
  }

  global._sqliteDb = database;
  return database;
}

db = getDbInstance();

/**
 * Récupère une valeur de configuration
 */
export function getSetting(key) {
  const stmt = db.prepare(`SELECT value FROM settings WHERE key = ?`);
  const row = stmt.get(key);
  return row ? row.value : null;
}

/**
 * Enregistre ou met à jour une valeur de configuration
 */
export function setSetting(key, value) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value) 
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  return stmt.run(key, value);
}

/**
 * Récupère les jeux avec des filtres optionnels
 */
export function getGames(filters = {}) {
  const { mechanic, theme, search, players, locationStatus } = filters;
  
  let query = `
    SELECT DISTINCT g.* 
    FROM games g
    LEFT JOIN game_mechanics gm ON g.id = gm.game_id
    LEFT JOIN mechanics m ON gm.mechanic_id = m.id
    LEFT JOIN game_themes gt ON g.id = gt.game_id
    LEFT JOIN themes t ON gt.theme_id = t.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (search) {
    query += ` AND (g.title LIKE ? OR g.description LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  
  if (mechanic) {
    query += ` AND m.name = ?`;
    params.push(mechanic);
  }
  
  if (theme) {
    query += ` AND t.name = ?`;
    params.push(theme);
  }
  
  if (players) {
    const numPlayers = parseInt(players, 10);
    if (!isNaN(numPlayers)) {
      query += ` AND g.min_players <= ? AND g.max_players >= ?`;
      params.push(numPlayers, numPlayers);
    }
  }
  
  if (locationStatus) {
    if (locationStatus === 'placed') {
      query += ` AND g.location IS NOT NULL AND g.location != ''`;
    } else if (locationStatus === 'unplaced') {
      query += ` AND (g.location IS NULL OR g.location = '')`;
    }
  }
  
  query += ` ORDER BY g.title ASC`;
  
  const stmt = db.prepare(query);
  const games = stmt.all(...params);
  
  // Pour chaque jeu, récupérer ses mécaniques, thèmes et tags associés
  return games.map(game => {
    return {
      ...game,
      mechanics: getGameMechanics(game.id),
      themes: getGameThemes(game.id),
      customTags: getGameCustomTags(game.id)
    };
  });
}

/**
 * Récupère un jeu par son ID avec ses relations
 */
export function getGameById(id) {
  const stmt = db.prepare(`SELECT * FROM games WHERE id = ?`);
  const game = stmt.get(id);
  if (!game) return null;
  
  return {
    ...game,
    mechanics: getGameMechanics(id),
    themes: getGameThemes(id),
    customTags: getGameCustomTags(id)
  };
}

/**
 * Récupère les mécaniques d'un jeu
 */
export function getGameMechanics(gameId) {
  const stmt = db.prepare(`
    SELECT m.name 
    FROM mechanics m
    JOIN game_mechanics gm ON m.id = gm.mechanic_id
    WHERE gm.game_id = ?
  `);
  return stmt.all(gameId).map(row => row.name);
}

/**
 * Récupère les thèmes d'un jeu
 */
export function getGameThemes(gameId) {
  const stmt = db.prepare(`
    SELECT t.name 
    FROM themes t
    JOIN game_themes gt ON t.id = gt.theme_id
    WHERE gt.game_id = ?
  `);
  return stmt.all(gameId).map(row => row.name);
}

/**
 * Met à jour la localisation physique d'un jeu
 */
export function updateGameLocation(id, location) {
  const stmt = db.prepare(`UPDATE games SET location = ? WHERE id = ?`);
  return stmt.run(location, id);
}

/**
 * Renomme un emplacement de rangement sur tous les jeux associés
 */
export function renameLocation(oldName, newName) {
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  const stmt = db.prepare(`UPDATE games SET location = ? WHERE location = ?`);
  return stmt.run(cleanNew, cleanOld);
}

/**
 * Supprime un emplacement de rangement (dissocie tous les jeux)
 */
export function deleteLocation(locationName) {
  const stmt = db.prepare(`UPDATE games SET location = NULL WHERE location = ?`);
  return stmt.run(locationName.trim());
}

/**
 * Associe ou met à jour le code-barres (UPC/EAN) d'un jeu
 */
export function updateGameBarcode(id, barcode) {
  const stmt = db.prepare(`UPDATE games SET barcode = ? WHERE id = ?`);
  return stmt.run(barcode ? barcode.trim() : null, id);
}

/**
 * Recherche un jeu par son code-barres
 */
export function getGameByBarcode(barcode) {
  if (!barcode) return null;
  const stmt = db.prepare(`SELECT * FROM games WHERE barcode = ?`);
  const row = stmt.get(barcode.trim());
  if (!row) return null;
  return getGameById(row.id);
}

/**
 * Insère ou met à jour un jeu
 */
export function insertOrUpdateGame(game) {
  // Conserver l'ancienne localisation si elle existe déjà lors de la ré-importation
  const existing = getGameById(game.id);
  const location = existing ? existing.location : (game.location || null);
  const item_type = game.item_type || (existing ? existing.item_type : null);

  const stmt = db.prepare(`
    INSERT INTO games (
      id, title, image_url, thumbnail_url, min_players, max_players, 
      playing_time, year_published, description, location, rating, num_plays, item_type, last_imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      image_url = COALESCE(excluded.image_url, games.image_url),
      thumbnail_url = COALESCE(excluded.thumbnail_url, games.thumbnail_url),
      min_players = COALESCE(excluded.min_players, games.min_players),
      max_players = COALESCE(excluded.max_players, games.max_players),
      playing_time = COALESCE(excluded.playing_time, games.playing_time),
      year_published = COALESCE(excluded.year_published, games.year_published),
      description = COALESCE(excluded.description, games.description),
      location = COALESCE(games.location, excluded.location),
      rating = excluded.rating,
      num_plays = excluded.num_plays,
      item_type = COALESCE(excluded.item_type, games.item_type),
      last_imported_at = datetime('now')
  `);
  
  return stmt.run(
    game.id,
    game.title || 'Jeu Inconnu',
    game.image_url || null,
    game.thumbnail_url || null,
    game.min_players ?? null,
    game.max_players ?? null,
    game.playing_time ?? null,
    game.year_published ?? null,
    game.description || null,
    location || null,
    game.rating ?? null,
    game.num_plays ?? 0,
    item_type || null
  );
}

/**
 * Insère une mécanique (si elle n'existe pas) et retourne son ID
 */
export function insertMechanic(name) {
  const selectStmt = db.prepare(`SELECT id FROM mechanics WHERE name = ?`);
  const row = selectStmt.get(name);
  if (row) return row.id;
  
  const insertStmt = db.prepare(`INSERT INTO mechanics (name) VALUES (?)`);
  const result = insertStmt.run(name);
  const newRow = selectStmt.get(name);
  return newRow ? newRow.id : (result.lastInsertRowid || result.lastInsertRowId);
}

/**
 * Lie un jeu à une mécanique
 */
export function linkGameMechanic(gameId, mechanicId) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO game_mechanics (game_id, mechanic_id) 
    VALUES (?, ?)
  `);
  return stmt.run(gameId, mechanicId);
}

/**
 * Insère un thème (si il n'existe pas) et retourne son ID
 */
export function insertTheme(name) {
  const selectStmt = db.prepare(`SELECT id FROM themes WHERE name = ?`);
  const row = selectStmt.get(name);
  if (row) return row.id;
  
  const insertStmt = db.prepare(`INSERT INTO themes (name) VALUES (?)`);
  const result = insertStmt.run(name);
  const newRow = selectStmt.get(name);
  return newRow ? newRow.id : (result.lastInsertRowid || result.lastInsertRowId);
}

/**
 * Lie un jeu à un thème
 */
export function linkGameTheme(gameId, themeId) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO game_themes (game_id, theme_id) 
    VALUES (?, ?)
  `);
  return stmt.run(gameId, themeId);
}

/**
 * Efface les liaisons existantes d'un jeu
 */
export function clearGameRelations(gameId) {
  db.prepare(`DELETE FROM game_mechanics WHERE game_id = ?`).run(gameId);
  db.prepare(`DELETE FROM game_themes WHERE game_id = ?`).run(gameId);
}

/**
 * Récupère toutes les mécaniques distinctes triées par ordre alphabétique
 */
export function getAllMechanics() {
  const stmt = db.prepare(`
    SELECT DISTINCT m.name 
    FROM mechanics m
    JOIN game_mechanics gm ON m.id = gm.mechanic_id
    ORDER BY m.name ASC
  `);
  return stmt.all().map(row => row.name);
}

/**
 * Récupère tous les thèmes (catégories) distincts triés par ordre alphabétique
 */
export function getAllThemes() {
  const stmt = db.prepare(`
    SELECT DISTINCT t.name 
    FROM themes t
    JOIN game_themes gt ON t.id = gt.theme_id
    ORDER BY t.name ASC
  `);
  return stmt.all().map(row => row.name);
}

/**
 * Récupère tous les mots-clés (tags) personnalisés triés par ordre alphabétique
 */
export function getCustomTags() {
  const stmt = db.prepare(`
    SELECT DISTINCT name FROM custom_tags ORDER BY name ASC
  `);
  return stmt.all().map(row => row.name);
}

/**
 * Récupère les mots-clés (tags) personnalisés associés à un jeu spécifique
 */
export function getGameCustomTags(gameId) {
  const stmt = db.prepare(`
    SELECT t.name 
    FROM custom_tags t
    JOIN game_custom_tags gt ON t.id = gt.tag_id
    WHERE gt.game_id = ?
    ORDER BY t.name ASC
  `);
  return stmt.all(gameId).map(row => row.name);
}

/**
 * Ajoute un mot-clé (tag) personnalisé à un jeu de société
 */
export function addCustomTagToGame(gameId, tagName) {
  const cleanName = tagName.trim();
  if (!cleanName) return null;
  
  let tagId;
  const selectStmt = db.prepare(`SELECT id FROM custom_tags WHERE name = ?`);
  const row = selectStmt.get(cleanName);
  if (row) {
    tagId = row.id;
  } else {
    const insertStmt = db.prepare(`INSERT INTO custom_tags (name) VALUES (?)`);
    const result = insertStmt.run(cleanName);
    const newRow = selectStmt.get(cleanName);
    tagId = newRow ? newRow.id : (result.lastInsertRowid || result.lastInsertRowId);
  }
  
  const linkStmt = db.prepare(`
    INSERT OR IGNORE INTO game_custom_tags (game_id, tag_id) 
    VALUES (?, ?)
  `);
  return linkStmt.run(gameId, tagId);
}

/**
 * Supprime un mot-clé (tag) personnalisé d'un jeu
 */
export function removeCustomTagFromGame(gameId, tagName) {
  const selectStmt = db.prepare(`SELECT id FROM custom_tags WHERE name = ?`);
  const row = selectStmt.get(tagName);
  if (!row) return;
  
  const deleteStmt = db.prepare(`
    DELETE FROM game_custom_tags 
    WHERE game_id = ? AND tag_id = ?
  `);
  return deleteStmt.run(gameId, row.id);
}

/**
 * Crée un nouveau mot-clé personnalisé s'il n'existe pas
 */
export function createCustomTag(tagName) {
  const cleanName = tagName.trim();
  if (!cleanName) return null;
  const stmt = db.prepare(`INSERT OR IGNORE INTO custom_tags (name) VALUES (?)`);
  return stmt.run(cleanName);
}

/**
 * Renomme un mot-clé personnalisé globalement
 */
export function renameCustomTag(oldName, newName) {
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  if (!cleanOld || !cleanNew) return null;
  const stmt = db.prepare(`UPDATE custom_tags SET name = ? WHERE name = ?`);
  return stmt.run(cleanNew, cleanOld);
}

/**
 * Supprime un mot-clé personnalisé de la base et de tous les jeux
 */
export function deleteCustomTag(tagName) {
  const cleanName = tagName.trim();
  if (!cleanName) return null;
  const selectStmt = db.prepare(`SELECT id FROM custom_tags WHERE name = ?`);
  const row = selectStmt.get(cleanName);
  if (!row) return null;

  db.prepare(`DELETE FROM game_custom_tags WHERE tag_id = ?`).run(row.id);
  return db.prepare(`DELETE FROM custom_tags WHERE id = ?`).run(row.id);
}

/**
 * Associe en lot un mot-clé à plusieurs jeux
 */
export function bulkAddTagToGames(gameIds, tagName) {
  const cleanName = tagName.trim();
  if (!cleanName || !gameIds || gameIds.length === 0) return;
  
  let tagId;
  const selectStmt = db.prepare(`SELECT id FROM custom_tags WHERE name = ?`);
  const row = selectStmt.get(cleanName);
  if (row) {
    tagId = row.id;
  } else {
    const insertStmt = db.prepare(`INSERT INTO custom_tags (name) VALUES (?)`);
    const result = insertStmt.run(cleanName);
    const newRow = selectStmt.get(cleanName);
    tagId = newRow ? newRow.id : (result.lastInsertRowid || result.lastInsertRowId);
  }
  
  const linkStmt = db.prepare(`
    INSERT OR IGNORE INTO game_custom_tags (game_id, tag_id) 
    VALUES (?, ?)
  `);
  
  for (const gameId of gameIds) {
    linkStmt.run(gameId, tagId);
  }
}

/**
 * Recherche des jeux selon des mots-clés présents dans leur titre ou description
 */
export function searchGamesByKeywords(keywordsArray) {
  if (!keywordsArray || keywordsArray.length === 0) return [];
  
  const cleanKws = keywordsArray.map(k => k.trim()).filter(Boolean);
  if (cleanKws.length === 0) return [];
  
  let query = `
    SELECT id, title, year_published, thumbnail_url 
    FROM games 
    WHERE 1=0
  `;
  const params = [];
  
  cleanKws.forEach(kw => {
    query += ` OR title LIKE ? OR description LIKE ?`;
    params.push(`%${kw}%`, `%${kw}%`);
  });
  
  query += ` ORDER BY title ASC`;
  const stmt = db.prepare(query);
  return stmt.all(...params);
}
