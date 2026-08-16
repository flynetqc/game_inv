import { NextResponse } from 'next/server';
import { renameLocation, deleteLocation } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(request) {
  try {
    const { action, oldName, newName } = await request.json();

    if (action === 'rename') {
      if (!oldName || !newName) {
        return NextResponse.json({ error: "Ancien et nouveau nom d'emplacement requis." }, { status: 400 });
      }

      renameLocation(oldName, newName);

      return NextResponse.json({
        success: true,
        message: `L'emplacement "${oldName}" a été renommé en "${newName}".`
      });
    }

    return NextResponse.json({ error: "Action non supportée." }, { status: 400 });
  } catch (error) {
    console.error("Erreur admin locations:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const locationName = searchParams.get('name');

    if (!locationName) {
      return NextResponse.json({ error: "Nom de l'emplacement manquant." }, { status: 400 });
    }

    deleteLocation(locationName);

    return NextResponse.json({
      success: true,
      message: `L'emplacement "${locationName}" a été supprimé et ses jeux dissociés.`
    });
  } catch (error) {
    console.error("Erreur suppression location:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
