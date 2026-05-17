import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Mes Recettes</h1>
        <p>Gérez vos recettes, planifiez vos menus et générez vos listes d'épicerie.</p>
      </header>
      <main className={styles.main}>
        {/* La galerie de recettes viendra ici */}
        <p>Le projet est initialisé et prêt pour le développement.</p>
      </main>
    </div>
  );
}
