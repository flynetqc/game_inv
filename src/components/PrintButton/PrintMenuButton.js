'use client';

export default function PrintMenuButton({ className }) {
  return (
    <button className={className} onClick={() => window.print()}>
      🖨️ Imprimer Menu
    </button>
  );
}
