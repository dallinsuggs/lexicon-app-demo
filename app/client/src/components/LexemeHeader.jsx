import { Link } from "react-router";

function LexemeHeader({
  onNewLexeme,
  onRestoreDemo,
  isRestoringDemo,
}) {
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

        {onRestoreDemo && (
          <button
            type="button"
            className="secondary-button"
            onClick={onRestoreDemo}
            disabled={isRestoringDemo}
          >
            {isRestoringDemo
              ? "Restoring..."
              : "Restore Demo Data"}
          </button>
        )}

        {onNewLexeme && (
          <button
            type="button"
            onClick={onNewLexeme}
            disabled={isRestoringDemo}
          >
            New Lexeme
          </button>
        )}
      </div>
    </header>
  );
}

export default LexemeHeader;