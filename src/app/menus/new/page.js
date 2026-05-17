import MenuForm from '../../../components/MenuForm/MenuForm';

export const metadata = {
  title: 'Nouveau Menu | Mes Recettes',
};

export default function NewMenuPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <MenuForm />
    </div>
  );
}
