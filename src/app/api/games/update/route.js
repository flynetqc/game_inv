import { NextResponse } from 'next/server';
import { updateGameLocation } from '@/lib/db';

export async function PATCH(request) {
  try {
    const { id, location } = await request.json();
    
    if (!id) {
      return NextResponse.json({ error: "L'identifiant du jeu (id) est requis." }, { status: 400 });
    }
    
    const gameId = parseInt(id, 10);
    if (isNaN(gameId)) {
      return NextResponse.json({ error: "L'identifiant du jeu doit être un nombre valide." }, { status: 400 });
    }
    
    // Mettre à jour dans SQLite
    updateGameLocation(gameId, location ? location.trim() : null);
    
    return NextResponse.json({ 
      success: true, 
      message: "La localisation du jeu dans votre bibliothèque a été mise à jour." 
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la localisation:", error);
    return NextResponse.json({ 
      error: "Une erreur est survenue lors de la mise à jour.",
      details: error.message 
    }, { status: 500 });
  }
}
