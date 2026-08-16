import { NextResponse } from 'next/server';
import { 
  getCustomTags, 
  addCustomTagToGame, 
  removeCustomTagFromGame, 
  searchGamesByKeywords,
  bulkAddTagToGames,
  createCustomTag,
  renameCustomTag,
  deleteCustomTag
} from '@/lib/db';

export const dynamic = 'force-dynamic';

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
    
    // Application en lot
    if (gameIds && Array.isArray(gameIds)) {
      bulkAddTagToGames(gameIds, cleanTagName);
      return NextResponse.json({ 
        success: true, 
        message: `Mot-clé "${cleanTagName}" appliqué avec succès à ${gameIds.length} jeux.` 
      });
    }
    
    // Application à un seul jeu
    if (gameId) {
      addCustomTagToGame(parseInt(gameId, 10), cleanTagName);
      return NextResponse.json({ success: true });
    }
    
    // Création simple d'un nouveau tag global
    createCustomTag(cleanTagName);
    return NextResponse.json({ 
      success: true, 
      message: `Mot-clé "${cleanTagName}" créé avec succès.` 
    });
  } catch (error) {
    console.error('Erreur dans POST /api/tags:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { action, oldName, newName } = body;

    if (action === 'rename') {
      if (!oldName || !newName) {
        return NextResponse.json({ error: "Ancien et nouveau nom de mot-clé requis." }, { status: 400 });
      }

      renameCustomTag(oldName, newName);
      return NextResponse.json({ 
        success: true, 
        message: `Le mot-clé "${oldName}" a été renommé en "${newName}".` 
      });
    }

    return NextResponse.json({ error: "Action non supportée." }, { status: 400 });
  } catch (error) {
    console.error('Erreur dans PATCH /api/tags:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const gameIdStr = searchParams.get('gameId');
    const tagName = searchParams.get('tagName');
    
    if (!tagName) {
      return NextResponse.json({ error: 'Nom du mot-clé requis.' }, { status: 400 });
    }

    // Suppression d'un tag sur un seul jeu
    if (gameIdStr) {
      removeCustomTagFromGame(parseInt(gameIdStr, 10), tagName.trim());
      return NextResponse.json({ success: true });
    }

    // Suppression globale du tag
    deleteCustomTag(tagName.trim());
    return NextResponse.json({ 
      success: true, 
      message: `Le mot-clé "${tagName}" a été supprimé de la base et de tous les jeux.` 
    });
  } catch (error) {
    console.error('Erreur dans DELETE /api/tags:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
