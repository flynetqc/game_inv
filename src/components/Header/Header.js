import Link from 'next/link';
import styles from './Header.module.css';

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link href="/" className={styles.logoLink} title="Accueil GeekShelf">
          <img 
            src="/geekshelf-logo.jpg" 
            alt="GeekShelf - Gestionnaire d'inventaire jeux de société" 
            className={styles.logoImg} 
          />
        </Link>
        
        <div className={styles.tagline}>
          Votre collection BoardGameGeek locale
        </div>
      </div>
    </header>
  );
}
