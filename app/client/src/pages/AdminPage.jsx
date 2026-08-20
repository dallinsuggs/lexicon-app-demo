import { Link } from "react-router";
import { useEffect } from "react";

import AgeAdminSection from "../components/AgeAdminSection";
import LineageAdminSection from "../components/LineageAdminSection";
import StageAdminSection from "../components/StageAdminSection";
import StageRelationAdminSection from "../components/StageRelationAdminSection";

function AdminPage() {
  useEffect(() => {
    document.title = "Lexicon - Admin";
  }, []);

  return (
    <main className="app">
      <nav className="breadcrumb">
        <Link to="/">← Back to lexicon</Link>
      </nav>

      <header className="page-header">
        <div>
          <h1>Language Administration</h1>

          <p>
            Manage the global chronology, language lineages,
            historical stages, and their relationships.
          </p>
        </div>
      </header>

      <AgeAdminSection />
      <LineageAdminSection />
      <StageAdminSection />
      <StageRelationAdminSection />
      
    </main>
  );
}

export default AdminPage;