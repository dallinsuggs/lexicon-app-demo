import { Link } from "react-router";

function LexemeTable({ lexemes }) {
  if (lexemes.length === 0) {
    return (
      <div className="empty-state">
        <h2>No lexemes found</h2>

        <p>
          The database is empty, or no entries match the
          current filters.
        </p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Lemma</th>
            <th>Glosses</th>
            <th>Stage</th>
            <th>Lineage</th>
            <th>Age</th>
            <th>Part of speech</th>
            <th>Class</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {lexemes.map((lexeme) => (
            <tr
              key={lexeme.id}
              className={
                lexeme.is_archived === 1
                  ? "archived-table-row"
                  : ""
              }
            >
              <td className="lemma-cell">
                <Link to={`/lexemes/${lexeme.id}`}>
                  {lexeme.lemma}
                </Link>

                {lexeme.is_archived === 1 && (
                  <span className="archive-badge table-archive-badge">
                    Archived
                  </span>
                )}

                {lexeme.needs_review === 1 && (
                  <span className="review-badge needs-review-badge table-review-badge">
                    Needs review
                  </span>
                )}
              </td>

              <td>{lexeme.glosses || "—"}</td>

              <td>
                <Link to={`/stages/${lexeme.language_stage_id}`}>
                  {lexeme.stage_code}
                </Link>
              </td>

              <td>{lexeme.lineage_code}</td>

              <td>{lexeme.age_code}</td>

              <td>
                {lexeme.part_of_speech || "—"}
              </td>

              <td>
                {lexeme.lexeme_class_name || "—"}
              </td>

              <td>
                <Link
                  to={`/lexemes/${lexeme.id}?edit=true&from=list`}
                  className="secondary-button compact-button"
                >
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default LexemeTable;