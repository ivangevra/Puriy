'use client';
export default function AdminAccess({
  onEnter,
  adminUser = false,
  email = '',
}: {
  onEnter: () => void | Promise<void>;
  adminUser?: boolean;
  email?: string;
}) {
  return (
    <main className="workspace admin-access">
      <h1>Administración</h1>
      <p>
        Gestiona recorridos, frecuencias, vehículos y semáforos desde un solo
        lugar.
      </p>
      {adminUser ? (
        <section className="surface">
          <h2>Cuenta administradora</h2>
          <p>Sesión iniciada como {email}. Tienes permisos de administración.</p>
          <button className="primary" onClick={onEnter}>
            Entrar al panel
          </button>
        </section>
      ) : (
        <p>Este espacio está disponible solo para la cuenta de Google administradora.</p>
      )}
    </main>
  );
}
