/**
 * Service pour interagir avec l'API officielle de BoardGameGeek (XML API2).
 * Permet de récupérer les détails (descriptions, images, catégories, mécaniques)
 * des jeux de société à partir de leurs identifiants.
 */

/**
 * Décode les entités HTML standard et numériques courantes dans l'XML.
 */
function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
}

/**
 * Parse la réponse XML brute de BGG XML API2.
 * @param {string} xmlText 
 * @returns {Array} Liste des jeux parsés
 */
export function parseBggXml(xmlText) {
  const items = [];
  const itemRegex = /<item[^>]*?>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemContent = match[0];
    const innerContent = match[1];
    
    // Extraction de l'ID BGG
    const idMatch = itemContent.match(/<item[^>]*?id="(\d+)"/);
    if (!idMatch) continue;
    const id = parseInt(idMatch[1], 10);
    
    // Extraction du titre principal
    let title = '';
    const nameMatches = innerContent.match(/<name[^>]*?type="primary"[^>]*?value="([^"]*)"/) 
      || innerContent.match(/<name[^>]*?value="([^"]*)"[^>]*?type="primary"/);
    if (nameMatches) {
      title = nameMatches[1];
    } else {
      const anyNameMatch = innerContent.match(/<name[^>]*?value="([^"]*)"/);
      title = anyNameMatch ? anyNameMatch[1] : 'Unknown Game';
    }
    title = decodeEntities(title);
    
    // URL de l'image (haute résolution) et de la miniature
    const imageMatch = innerContent.match(/<image>(.*?)<\/image>/);
    const image_url = imageMatch ? imageMatch[1] : '';
    
    const thumbnailMatch = innerContent.match(/<thumbnail>(.*?)<\/thumbnail>/);
    const thumbnail_url = thumbnailMatch ? thumbnailMatch[1] : '';
    
    // Description
    const descMatch = innerContent.match(/<description>([\s\S]*?)<\/description>/);
    let description = descMatch ? descMatch[1] : '';
    description = decodeEntities(description);
    
    // Année de publication
    const yearMatch = innerContent.match(/<yearpublished[^>]*?value="(-?\d+)"/);
    const year_published = yearMatch ? parseInt(yearMatch[1], 10) : null;
    
    // Joueurs min/max
    const minPlayersMatch = innerContent.match(/<minplayers[^>]*?value="(\d+)"/);
    const min_players = minPlayersMatch ? parseInt(minPlayersMatch[1], 10) : null;
    
    const maxPlayersMatch = innerContent.match(/<maxplayers[^>]*?value="(\d+)"/);
    const max_players = maxPlayersMatch ? parseInt(maxPlayersMatch[1], 10) : null;
    
    // Durée de jeu
    const playingTimeMatch = innerContent.match(/<playingtime[^>]*?value="(\d+)"/);
    const playing_time = playingTimeMatch ? parseInt(playingTimeMatch[1], 10) : null;
    
    // Extraction des mécaniques (boardgamemechanic)
    const mechanics = [];
    const mechRegex = /<link[^>]*?type="boardgamemechanic"[^>]*?value="([^"]*)"/g;
    let mechMatch;
    while ((mechMatch = mechRegex.exec(innerContent)) !== null) {
      mechanics.push(decodeEntities(mechMatch[1]));
    }
    
    // Extraction des catégories (utilisées comme thématiques)
    const themes = [];
    const catRegex = /<link[^>]*?type="boardgamecategory"[^>]*?value="([^"]*)"/g;
    let catMatch;
    while ((catMatch = catRegex.exec(innerContent)) !== null) {
      themes.push(decodeEntities(catMatch[1]));
    }
    
    items.push({
      id,
      title,
      image_url,
      thumbnail_url,
      description,
      year_published,
      min_players,
      max_players,
      playing_time,
      mechanics,
      themes
    });
  }
  
  return items;
}

/**
 * Récupère les détails de plusieurs jeux de société depuis l'API BGG par leurs IDs.
 * Gère automatiquement le code 202 (BGG met la requête en file d'attente) avec des tentatives différées.
import { getSetting } from './db.js';

/**
 * Récupère les détails de plusieurs jeux de société depuis l'API BGG par leurs IDs.
 * Gère automatiquement le code 202 (BGG met la requête en file d'attente) avec des tentatives différées.
 * @param {Array<number>} ids Liste d'identifiants de jeux BGG
 * @param {string} token Jeton d'accès de l'API BGG
 * @returns {Promise<Array>} Liste des détails des jeux
 */
export async function fetchBggDetails(ids, token = '') {
  if (!ids || ids.length === 0) return [];

  const activeToken = token || getSetting('bgg_api_token') || '4acd22b0-77b1-4c3c-81be-8878a5c9dc2b';
  
  const url = `https://boardgamegeek.com/xmlapi2/thing?id=${ids.join(',')}`;
  let attempts = 0;
  const maxAttempts = 5;
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  const headers = {
    'User-Agent': 'GeekShelf/1.0.0 (Local board game collection manager; client-side/self-hosted)'
  };
  if (activeToken) {
    headers['Authorization'] = `Bearer ${activeToken}`;
  }
  
  while (attempts < maxAttempts) {
    try {
      const response = await fetch(url, { headers });
      
      // BGG renvoie parfois 202 (Accepted) lorsque la requête doit être générée côté serveur.
      // Dans ce cas, il faut attendre et réessayer.
      if (response.status === 202) {
        attempts++;
        console.log(`BGG API a renvoyé 202 (En attente). Tentative de reconnexion ${attempts}/${maxAttempts}...`);
        await delay(1500 * attempts); // Délai progressif
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`L'API BGG a répondu avec le statut ${response.status}`);
      }
      
      const xmlText = await response.text();
      return parseBggXml(xmlText);
    } catch (error) {
      console.error(`Erreur d'accès à l'API BGG (tentative ${attempts + 1}):`, error);
      attempts++;
      if (attempts >= maxAttempts) throw error;
      await delay(2000);
    }
  }
  
  throw new Error("Impossible de récupérer les détails BGG après plusieurs tentatives.");
}
