import Link from 'next/link';
import styles from './Header.module.css';

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          <span className={styles.icon}>🎲</span>
          <span className={styles.title}>Geek<span className={styles.highlight}>Shelf</span></span>
        </Link>
        
        <div className={styles.tagline}>
          Votre collection BoardGameGeek locale
        </div>
      </div>
    </header>
  );
}
