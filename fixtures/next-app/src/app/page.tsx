import { ProjectDemo } from "../components/project-demo";

export default function Page() {
  return (
    <main className="shell">
      <header>
        <p className="eyebrow">Fixture d’intégration</p>
        <h1>Projet partagé, décisions serveur</h1>
        <p className="lede">
          Next.js ne rend que les données et les actions autorisées par le
          kernel.
        </p>
      </header>
      <ProjectDemo />
    </main>
  );
}
