import { NextResponse } from 'next/server';
import { 
  getCustomTags, 
  addCustomTagToGame, 
  removeCustomTagFromGame, 
  searchGamesByKeywords,
  bulkAddTagToGames 
} from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const keywordsStr = searchParams.get('keywords');
    
    if (keywordsStr) {
      const keywords = keywordsStr.split(',').map(k => k.trim()).filter(Boolean);
      const games = searchGamesByKeywords(keywords);
      return NextResponse.json({ games });
    }
    
    const tags = getCustomTags();
    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Erreur dans GET /api/tags:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { gameId, gameIds, tagName } = body;
    
    if (!tagName || !tagName.trim()) {
      return NextResponse.json({ error: 'Le nom du tag est requis.' }, { status: 400 });
    }
    
    const cleanTagName = tagName.trim();
    
    if (gameIds && Array.isArray(gameIds)) {
      bulkAddTagToGames(gameIds, cleanTagName);
      return NextResponse.json({ 
        success: true, 
        message: `Mot-clé "${cleanTagName}" appliqué avec succès à ${gameIds.length} jeux.` 
      });
    }
    
    if (gameId) {
      addCustomTagToGame(parseInt(gameId, 10), cleanTagName);
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Identifiant de jeu requis.' }, { status: 400 });
  } catch (error) {
    console.error('Erreur dans POST /api/tags:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const gameIdStr = searchParams.get('gameId');
    const tagName = searchParams.get('tagName');
    
    if (!gameIdStr || !tagName) {
      return NextResponse.json({ error: 'Identifiant (gameId) et nom de tag (tagName) requis.' }, { status: 400 });
    }
    
    removeCustomTagFromGame(parseInt(gameIdStr, 10), tagName.trim());
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur dans DELETE /api/tags:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
