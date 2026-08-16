import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import fallbackGames from './games_fallback.json';

let db;

function findSourceDbPath() {
  const candidatePaths = [
    path.join(process.cwd(), 'boardgames.db'),
    path.join(process.cwd(), '.next', 'server', 'boardgames.db'),
    path.join(__dirname, '..', '..', '..', 'boardgames.db'),
    path.join(__dirname, '..', '..', 'boardgames.db'),
    path.join(__dirname, '..', 'boardgames.db'),
    path.join(__dirname, 'boardgames.db'),
  ];

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {}
  }
  return path.join(process.cwd(), 'boardgames.db');
}

function getDbInstance() {
  if (global._sqliteDb) {
    return global._sqliteDb;
  }

  let dbPath = findSourceDbPath();

  // En environnement Vercel / AWS Lambda, on copie la base vers /tmp (inscriptible)
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
    try {
      database = new DatabaseSync(':memory:');
    } catch (e) {
      return null;
    }
  }

  if (database) {
    try {
      database.exec('PRAGMA busy_timeout = 10000;');
      database.exec('PRAGMA journal_mode = WAL;');
      database.exec('PRAGMA foreign_keys = ON;');
    } catch (e) {}

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
          last_imported_at TEXT,
          barcode TEXT
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
    } catch (e) {}

    try {
      database.exec('ALTER TABLE games ADD COLUMN item_type TEXT;');
    } catch (e) {}

    try {
      database.exec('ALTER TABLE games ADD COLUMN barcode TEXT;');
    } catch (e) {}

    global._sqliteDb = database;
  }

  return database;
}

export function getDb() {
  try {
    if (!db) {
      db = getDbInstance();
    }
    return db;
  } catch (e) {
    console.warn("getDb fallback warning:", e);
    return null;
  }
}

/**
 * Récupère une valeur de configuration
 */
export function getSetting(key) {
  try {
    const database = getDb();
    if (!database) return null;
    const stmt = database.prepare(`SELECT value FROM settings WHERE key = ?`);
    const row = stmt.get(key);
    return row ? row.value : null;
  } catch (e) {
    return null;
  }
}

/**
 * Enregistre ou met à jour une valeur de configuration
 */
export function setSetting(key, value) {
  try {
    const database = getDb();
    if (!database) return null;
    const stmt = database.prepare(`
      INSERT INTO settings (key, value) 
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    return stmt.run(key, value);
  } catch (e) {
    return null;
  }
}

/**
 * Récupère les jeux avec des filtres optionnels
 */
export function getGames(filters = {}) {
  try {
    const database = getDb();
    if (!database) return fallbackGames;

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
    
    const stmt = database.prepare(query);
    const games = stmt.all(...params);
    
    if (!games || games.length === 0) return fallbackGames;

    return games.map(game => {
      return {
        ...game,
        mechanics: getGameMechanics(game.id),
        themes: getGameThemes(game.id),
        customTags: getGameCustomTags(game.id)
      };
    });
  } catch (err) {
    console.warn("getGames returning fallbackGames due to:", err);
    return fallbackGames;
  }
}

/**
 * Récupère un jeu par son ID avec ses relations
 */
export function getGameById(id) {
  try {
    const database = getDb();
    if (!database) {
      return fallbackGames.find(g => g.id === id) || null;
    }
    const stmt = database.prepare(`SELECT * FROM games WHERE id = ?`);
    const game = stmt.get(id);
    if (!game) {
      return fallbackGames.find(g => g.id === id) || null;
    }
    
    return {
      ...game,
      mechanics: getGameMechanics(id),
      themes: getGameThemes(id),
      customTags: getGameCustomTags(id)
    };
  } catch (e) {
    return fallbackGames.find(g => g.id === id) || null;
  }
}

/**
 * Récupère les mécaniques d'un jeu
 */
export function getGameMechanics(gameId) {
  try {
    const database = getDb();
    if (!database) {
      const g = fallbackGames.find(x => x.id === gameId);
      return g?.mechanics || [];
    }
    const stmt = database.prepare(`
      SELECT m.name 
      FROM mechanics m
      JOIN game_mechanics gm ON m.id = gm.mechanic_id
      WHERE gm.game_id = ?
    `);
    return stmt.all(gameId).map(row => row.name);
  } catch (e) {
    const g = fallbackGames.find(x => x.id === gameId);
    return g?.mechanics || [];
  }
}

/**
 * Récupère les thèmes d'un jeu
 */
export function getGameThemes(gameId) {
  try {
    const database = getDb();
    if (!database) {
      const g = fallbackGames.find(x => x.id === gameId);
      return g?.themes || [];
    }
    const stmt = database.prepare(`
      SELECT t.name 
      FROM themes t
      JOIN game_themes gt ON t.id = gt.theme_id
      WHERE gt.game_id = ?
    `);
    return stmt.all(gameId).map(row => row.name);
  } catch (e) {
    const g = fallbackGames.find(x => x.id === gameId);
    return g?.themes || [];
  }
}

/**
 * Met à jour la localisation physique d'un jeu
 */
export function updateGameLocation(id, location) {
  try {
    const database = getDb();
    if (!database) return null;
    const stmt = database.prepare(`UPDATE games SET location = ? WHERE id = ?`);
    return stmt.run(location, id);
  } catch (e) {
    return null;
  }
}

/**
 * Renomme un emplacement de rangement sur tous les jeux associés
 */
export function renameLocation(oldName, newName) {
  try {
    const database = getDb();
    if (!database) return null;
    const cleanOld = oldName.trim();
    const cleanNew = newName.trim();
    const stmt = database.prepare(`UPDATE games SET location = ? WHERE location = ?`);
    return stmt.run(cleanNew, cleanOld);
  } catch (e) {
    return null;
  }
}

/**
 * Supprime un emplacement de rangement (dissocie tous les jeux)
 */
export function deleteLocation(locationName) {
  try {
    const database = getDb();
    if (!database) return null;
    const stmt = database.prepare(`UPDATE games SET location = NULL WHERE location = ?`);
    return stmt.run(locationName.trim());
  } catch (e) {
    return null;
  }
}

/**
 * Associe ou met à jour le code-barres (UPC/EAN) d'un jeu
 */
export function updateGameBarcode(id, barcode) {
  try {
    const database = getDb();
    if (!database) return null;
    const stmt = database.prepare(`UPDATE games SET barcode = ? WHERE id = ?`);
    return stmt.run(barcode ? barcode.trim() : null, id);
  } catch (e) {
    return null;
  }
}

/**
 * Recherche un jeu par son code-barres
 */
export function getGameByBarcode(barcode) {
  if (!barcode) return null;
  try {
    const database = getDb();
    if (!database) {
      return fallbackGames.find(g => g.barcode === barcode.trim()) || null;
    }
    const stmt = database.prepare(`SELECT * FROM games WHERE barcode = ?`);
    const row = stmt.get(barcode.trim());
    if (!row) {
      return fallbackGames.find(g => g.barcode === barcode.trim()) || null;
    }
    return getGameById(row.id);
  } catch (e) {
    return fallbackGames.find(g => g.barcode === barcode.trim()) || null;
  }
}

/**
 * Insère ou met à jour un jeu
 */
export function insertOrUpdateGame(game) {
  try {
    const database = getDb();
    if (!database) return null;
    const location = game.location || (game.custom_properties ? game.custom_properties.location : null);
    const item_type = game.item_type || null;

    const stmt = database.prepare(`
      INSERT INTO games (
        id, title, image_url, thumbnail_url, min_players, max_players, 
        playing_time, year_published, description, location, rating, num_plays, item_type, last_imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        image_url = coalesce(excluded.image_url, games.image_url),
        thumbnail_url = coalesce(excluded.thumbnail_url, games.thumbnail_url),
        min_players = excluded.min_players,
        max_players = excluded.max_players,
        playing_time = excluded.playing_time,
        year_published = excluded.year_published,
        description = excluded.description,
        location = coalesce(games.location, excluded.location),
        rating = excluded.rating,
        num_plays = excluded.num_plays,
        item_type = coalesce(excluded.item_type, games.item_type),
        last_imported_at = excluded.last_imported_at
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
  } catch (e) {
    return null;
  }
}

/**
 * Insère une mécanique (si elle n'existe pas) et retourne son ID
 */
export function insertMechanic(name) {
  try {
    const database = getDb();
    if (!database) return null;
    const selectStmt = database.prepare(`SELECT id FROM mechanics WHERE name = ?`);
    const row = selectStmt.get(name);
    if (row) return row.id;
    
    const insertStmt = database.prepare(`INSERT INTO mechanics (name) VALUES (?)`);
    const result = insertStmt.run(name);
    const newRow = selectStmt.get(name);
    return newRow ? newRow.id : (result.lastInsertRowid || result.lastInsertRowId);
  } catch (e) {
    return null;
  }
}

/**
 * Lie un jeu à une mécanique
 */
export function linkGameMechanic(gameId, mechanicId) {
  try {
    const database = getDb();
    if (!database) return null;
    const stmt = database.prepare(`
      INSERT OR IGNORE INTO game_mechanics (game_id, mechanic_id) 
      VALUES (?, ?)
    `);
    return stmt.run(gameId, mechanicId);
  } catch (e) {
    return null;
  }
}

/**
 * Insère un thème (si il n'existe pas) et retourne son ID
 */
export function insertTheme(name) {
  try {
    const database = getDb();
    if (!database) return null;
    const selectStmt = database.prepare(`SELECT id FROM themes WHERE name = ?`);
    const row = selectStmt.get(name);
    if (row) return row.id;
    
    const insertStmt = database.prepare(`INSERT INTO themes (name) VALUES (?)`);
    const result = insertStmt.run(name);
    const newRow = selectStmt.get(name);
    return newRow ? newRow.id : (result.lastInsertRowid || result.lastInsertRowId);
  } catch (e) {
    return null;
  }
}

/**
 * Lie un jeu à un thème
 */
export function linkGameTheme(gameId, themeId) {
  try {
    const database = getDb();
    if (!database) return null;
    const stmt = database.prepare(`
      INSERT OR IGNORE INTO game_themes (game_id, theme_id) 
      VALUES (?, ?)
    `);
    return stmt.run(gameId, themeId);
  } catch (e) {
    return null;
  }
}

/**
 * Efface les liaisons existantes d'un jeu
 */
export function clearGameRelations(gameId) {
  try {
    const database = getDb();
    if (!database) return;
    database.prepare(`DELETE FROM game_mechanics WHERE game_id = ?`).run(gameId);
    database.prepare(`DELETE FROM game_themes WHERE game_id = ?`).run(gameId);
  } catch (e) {}
}

/**
 * Récupère toutes les mécaniques distinctes triées par ordre alphabétique
 */
export function getAllMechanics() {
  try {
    const database = getDb();
    if (database) {
      const stmt = database.prepare(`
        SELECT DISTINCT m.name 
        FROM mechanics m
        JOIN game_mechanics gm ON m.id = gm.mechanic_id
        ORDER BY m.name ASC
      `);
      const rows = stmt.all();
      if (rows && rows.length > 0) return rows.map(row => row.name);
    }
  } catch (e) {}

  const mechs = new Set(fallbackGames.flatMap(g => g.mechanics || []));
  return Array.from(mechs).sort();
}

/**
 * Récupère tous les thèmes (catégories) distincts triés par ordre alphabétique
 */
export function getAllThemes() {
  try {
    const database = getDb();
    if (database) {
      const stmt = database.prepare(`
        SELECT DISTINCT t.name 
        FROM themes t
        JOIN game_themes gt ON t.id = gt.theme_id
        ORDER BY t.name ASC
      `);
      const rows = stmt.all();
      if (rows && rows.length > 0) return rows.map(row => row.name);
    }
  } catch (e) {}

  const th = new Set(fallbackGames.flatMap(g => g.themes || []));
  return Array.from(th).sort();
}

/**
 * Récupère tous les mots-clés (tags) personnalisés triés par ordre alphabétique
 */
export function getCustomTags() {
  try {
    const database = getDb();
    if (database) {
      const stmt = database.prepare(`
        SELECT DISTINCT name FROM custom_tags ORDER BY name ASC
      `);
      const rows = stmt.all();
      if (rows && rows.length > 0) return rows.map(row => row.name);
    }
  } catch (e) {}

  return [];
}

/**
 * Récupère les mots-clés (tags) personnalisés associés à un jeu spécifique
 */
export function getGameCustomTags(gameId) {
  try {
    const database = getDb();
    if (database) {
      const stmt = database.prepare(`
        SELECT t.name 
        FROM custom_tags t
        JOIN game_custom_tags gt ON t.id = gt.tag_id
        WHERE gt.game_id = ?
        ORDER BY t.name ASC
      `);
      return stmt.all(gameId).map(row => row.name);
    }
  } catch (e) {}

  return [];
}

/**
 * Ajoute un mot-clé (tag) personnalisé à un jeu de société
 */
export function addCustomTagToGame(gameId, tagName) {
  try {
    const database = getDb();
    if (!database) return null;
    const cleanName = tagName.trim();
    if (!cleanName) return null;
    
    let tagId;
    const selectStmt = database.prepare(`SELECT id FROM custom_tags WHERE name = ?`);
    const row = selectStmt.get(cleanName);
    if (row) {
      tagId = row.id;
    } else {
      const insertStmt = database.prepare(`INSERT INTO custom_tags (name) VALUES (?)`);
      const result = insertStmt.run(cleanName);
      const newRow = selectStmt.get(cleanName);
      tagId = newRow ? newRow.id : (result.lastInsertRowid || result.lastInsertRowId);
    }
    
    const linkStmt = database.prepare(`
      INSERT OR IGNORE INTO game_custom_tags (game_id, tag_id) 
      VALUES (?, ?)
    `);
    return linkStmt.run(gameId, tagId);
  } catch (e) {
    return null;
  }
}

/**
 * Supprime un mot-clé (tag) personnalisé d'un jeu
 */
export function removeCustomTagFromGame(gameId, tagName) {
  try {
    const database = getDb();
    if (!database) return null;
    const selectStmt = database.prepare(`SELECT id FROM custom_tags WHERE name = ?`);
    const row = selectStmt.get(tagName);
    if (!row) return;
    
    const deleteStmt = database.prepare(`
      DELETE FROM game_custom_tags 
      WHERE game_id = ? AND tag_id = ?
    `);
    return deleteStmt.run(gameId, row.id);
  } catch (e) {
    return null;
  }
}

/**
 * Crée un nouveau mot-clé personnalisé s'il n'existe pas
 */
export function createCustomTag(tagName) {
  try {
    const database = getDb();
    if (!database) return null;
    const cleanName = tagName.trim();
    if (!cleanName) return null;
    const stmt = database.prepare(`INSERT OR IGNORE INTO custom_tags (name) VALUES (?)`);
    return stmt.run(cleanName);
  } catch (e) {
    return null;
  }
}

/**
 * Renomme un mot-clé personnalisé globalement
 */
export function renameCustomTag(oldName, newName) {
  try {
    const database = getDb();
    if (!database) return null;
    const cleanOld = oldName.trim();
    const cleanNew = newName.trim();
    if (!cleanOld || !cleanNew) return null;
    const stmt = database.prepare(`UPDATE custom_tags SET name = ? WHERE name = ?`);
    return stmt.run(cleanNew, cleanOld);
  } catch (e) {
    return null;
  }
}

/**
 * Supprime un mot-clé personnalisé de la base et de tous les jeux
 */
export function deleteCustomTag(tagName) {
  try {
    const database = getDb();
    if (!database) return null;
    const cleanName = tagName.trim();
    if (!cleanName) return null;
    const selectStmt = database.prepare(`SELECT id FROM custom_tags WHERE name = ?`);
    const row = selectStmt.get(cleanName);
    if (!row) return null;

    database.prepare(`DELETE FROM game_custom_tags WHERE tag_id = ?`).run(row.id);
    return database.prepare(`DELETE FROM custom_tags WHERE id = ?`).run(row.id);
  } catch (e) {
    return null;
  }
}

/**
 * Associe en lot un mot-clé à plusieurs jeux
 */
export function bulkAddTagToGames(gameIds, tagName) {
  if (!Array.isArray(gameIds) || gameIds.length === 0) return;
  gameIds.forEach(id => {
    addCustomTagToGame(id, tagName);
  });
}

/**
 * Recherche des jeux dont le titre, la description ou les thèmes contiennent certains mots-clés
 */
export function searchGamesByKeywords(keywords = []) {
  try {
    const database = getDb();
    if (!database) {
      return fallbackGames.filter(g => {
        return keywords.some(k => 
          g.title?.toLowerCase().includes(k.toLowerCase()) || 
          g.description?.toLowerCase().includes(k.toLowerCase())
        );
      });
    }

    if (!Array.isArray(keywords) || keywords.length === 0) return [];
    
    const conditions = [];
    const params = [];
    
    keywords.forEach(kw => {
      conditions.push(`(g.title LIKE ? OR g.description LIKE ? OR t.name LIKE ?)`);
      params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
    });
    
    const query = `
      SELECT DISTINCT g.id, g.title, g.year_published, g.image_url, g.thumbnail_url, g.location, g.description
      FROM games g
      LEFT JOIN game_themes gt ON g.id = gt.game_id
      LEFT JOIN themes t ON gt.theme_id = t.id
      WHERE ${conditions.join(' OR ')}
      ORDER BY g.title ASC
    `;
    
    const stmt = database.prepare(query);
    return stmt.all(...params);
  } catch (e) {
    return [];
  }
}
