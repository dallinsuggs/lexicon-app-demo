import { Route, Routes } from "react-router";

import LexemeListPage from "./pages/LexemeListPage";
import LexemeDetailPage from "./pages/LexemeDetailPage";
import AdminPage from "./pages/AdminPage";
import LanguageStagePage from "./pages/LanguageStagePage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LexemeListPage />} />

      <Route
        path="/lexemes/:id"
        element={<LexemeDetailPage />}
      />

      <Route
        path="/stages/:id"
        element={<LanguageStagePage />}
      />

      <Route
        path="/admin"
        element={<AdminPage />}
      />
    </Routes>
  );
}

export default App;