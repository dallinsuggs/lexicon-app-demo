import { Link } from "react-router";

function LexemeHeader({ onNewLexeme }) {
  return (
    <header className="page-header">
      <div>
        <h1>World Lexicon DEMO VERSION</h1>

        <p>
          Diachronic lexicon and language-history database.
        </p>
      </div>

      <div className="header-actions">
        <Link to="/admin">
          Language Administration
        </Link>

        {onNewLexeme && (
          <button
            type="button"
            onClick={onNewLexeme}
          >
            New Lexeme
          </button>
        )}
      </div>
    </header>
  );
}

export default LexemeHeader;