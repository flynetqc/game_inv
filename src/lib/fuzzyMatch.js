/**
 * Utilitaire de rapprochement flou (fuzzy matching) pour les titres de jeux de société.
 * Permet d'associer un fichier d'inventaire physique (ex: Google Sheet)
 * à la base de données BoardGameGeek locale.
 */

/**
 * Normalise un titre de jeu :
 * 1. Extrait et retire les parenthèses (ex: "Ra (Pharaoh Edition)" -> "Ra")
 * 2. Normalise les caractères Unicode et retire les accents ("À" -> "A")
 * 3. Traduit les termes ultra-courants Fr -> En pour favoriser le rapprochement BGG
 * 4. Enlève la ponctuation et les espaces superflus
 * 5. Met en minuscules
 */
export function normalizeTitle(str) {
  if (!str) return '';
  
  let clean = str
    // Retirer le texte entre parenthèses
    .replace(/\([^)]*\)/g, ' ')
    // Retirer les crochets
    .replace(/\[[^\]]*\]/g, ' ')
    // Décomposer la chaîne Unicode (supprime les accents)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // Retirer les codes SKU / références produit alphanumériques en début (ex: "MBGTB001EN")
  clean = clean.replace(/^[a-z0-9]{6,16}\b/g, ' ');

  // Équivalences Fr <-> En courantes dans les titres BGG
  clean = clean
    .replace(/le seigneur des anneaux/g, 'the lord of the rings')
    .replace(/terre du milieu/g, 'middle earth')
    .replace(/le roi est mort/g, 'the king is dead')
    .replace(/a la recherche de la planete x/g, 'the search for planet x')
    .replace(/gardiens de la galaxie/g, 'guardians of the galaxy')
    .replace(/terre et l'eau/g, 'earth water')
    .replace(/terre et eau/g, 'earth water')
    .replace(/fantastiques fabriques/g, 'fantastic factories')
    .replace(/les cites perdues/g, 'lost cities');

  // Retirer les termes génériques fréquents sur les fiches de code-barres
  clean = clean
    .replace(/\bboard\s*game\b/g, ' ')
    .replace(/\bcard\s*game\b/g, ' ')
    .replace(/\btabletop\s*game\b/g, ' ')
    .replace(/\bjeu\s*de\s*societe\b/g, ' ')
    .replace(/\bjeu\s*de\s*cartes\b/g, ' ')
    .replace(/\bjeu\s*de\s*plateau\b/g, ' ');

  return clean
    // Remplacer les caractères de ponctuation par des espaces
    .replace(/[:\-,\.'!\?&/]/g, ' ')
    // Réduire les espaces consécutifs
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcule la distance de Levenshtein entre deux chaînes.
 */
export function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // suppression
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calcule la similarité de Jaccard entre les mots-clés de deux titres.
 */
export function tokenSimilarity(strA, strB) {
  const tokensA = new Set(strA.split(/\s+/).filter(t => t.length >= 2));
  const tokensB = new Set(strB.split(/\s+/).filter(t => t.length >= 2));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

/**
 * Calcule le score global de similarité entre deux titres (de 0 à 1).
 */
export function calculateTitleSimilarity(titleA, titleB) {
  const normA = normalizeTitle(titleA);
  const normB = normalizeTitle(titleB);

  // 1. Égalité exacte après normalisation
  if (normA === normB) return 1.0;
  if (normA.length === 0 || normB.length === 0) return 0;

  // 2. Vérification avec frontières de mots complètes (évite que "ten" matche "tenby")
  const escapedA = normA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedB = normB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patternA = new RegExp(`\\b${escapedA}\\b`);
  const patternB = new RegExp(`\\b${escapedB}\\b`);

  if (patternA.test(normB) || patternB.test(normA)) {
    const minLen = Math.min(normA.length, normB.length);
    const maxLen = Math.max(normA.length, normB.length);
    const ratio = minLen / maxLen;
    return Math.max(0.85, 0.75 + (ratio * 0.25));
  }

  // 3. Score fondé sur Levenshtein
  const maxLen = Math.max(normA.length, normB.length);
  const levDistance = levenshteinDistance(normA, normB);
  const levScore = 1 - (levDistance / maxLen);

  // 4. Score des mots-clés (tokens)
  const tokScore = tokenSimilarity(normA, normB);

  // Score combiné pondéré
  const combinedScore = (levScore * 0.5) + (tokScore * 0.5);
  return Math.max(0, Math.min(1, combinedScore));
}

/**
 * Analyse une liste de lignes d'inventaire contre la collection de jeux enregistrés.
 * 
 * @param {Array<{ rawTitle: string, location: string }>} inventoryRows 
 * @param {Array<{ id: number, title: string, location: string, image_url: string }>} catalogGames 
 * @returns Object comportant matchedGames, unmatchedInventory, missingCatalogGames
 */
export function matchInventoryToCatalog(inventoryRows, catalogGames) {
  const matched = [];
  const unmatchedInventory = [];
  const matchedCatalogGameIds = new Set();

  for (const row of inventoryRows) {
    const rawTitle = row.rawTitle ? row.rawTitle.trim() : '';
    const newLocation = row.location ? row.location.trim() : '';
    
    if (!rawTitle) continue;

    let bestMatch = null;
    let highestScore = 0;

    for (const game of catalogGames) {
      const score = calculateTitleSimilarity(rawTitle, game.title);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = game;
      }
    }

    // Seuil de tolérance minimal de 0.55 (55%)
    if (bestMatch && highestScore >= 0.55) {
      matchedCatalogGameIds.add(bestMatch.id);
      matched.push({
        inventoryTitle: rawTitle,
        newLocation: newLocation,
        matchedGame: bestMatch,
        confidence: Math.round(highestScore * 100),
        status: newLocation === (bestMatch.location || '') ? 'unchanged' : 'updated'
      });
    } else {
      unmatchedInventory.push({
        rawTitle: rawTitle,
        location: newLocation
      });
    }
  }

  // Identifier les jeux du catalogue non présents dans la feuille d'inventaire
  const missingCatalogGames = catalogGames.filter(g => !matchedCatalogGameIds.has(g.id));

  return {
    matched,
    unmatchedInventory,
    missingCatalogGames
  };
}

/**
 * Trouve le meilleur jeu correspondant pour une chaîne de texte donnée.
 * @param {string} text 
 * @param {Array} catalogGames 
 * @param {number} minThreshold 
 * @returns {{ game: Object, similarity: number } | null}
 */
export function findBestGameMatch(text, catalogGames, minThreshold = 0.5) {
  if (!text || !catalogGames || catalogGames.length === 0) return null;

  let bestMatch = null;
  let highestScore = 0;

  for (const game of catalogGames) {
    const score = calculateTitleSimilarity(text, game.title);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = game;
    }
  }

  if (bestMatch && highestScore >= minThreshold) {
    return {
      game: bestMatch,
      similarity: highestScore
    };
  }

  return null;
}
