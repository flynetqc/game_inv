import Link from 'next/link';
import styles from './Header.module.css';

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          <span>🍲 Mes Recettes</span>
        </Link>
        
        <nav className={styles.nav}>
          <Link href="/" className={styles.link}>
            Galerie
          </Link>
          <Link href="/menus" className={styles.link}>
            Menus
          </Link>
          <Link href="/grocery" className={styles.link}>
            Liste d'épicerie
          </Link>
          <Link href="/recipes/new" className={styles.button}>
            + Nouvelle Recette
          </Link>
        </nav>
      </div>
    </header>
  );
}
