import { useState } from "react";
import { Link } from "react-router";
import SearchableLexemeSelect from "./SearchableLexemeSelect";

function RelationshipEditor({
  currentLexemeId,
  lexemes,
  parents,
  daughters,
  onAddRelationship,
  onDeleteRelationship,
  isSaving,
  error,
}) {
  const [parentIds, setParentIds] = useState([]);
  const [daughterIds, setDaughterIds] = useState([]);
  const [parentNotes, setParentNotes] = useState("");
  const [daughterNotes, setDaughterNotes] = useState("");

  const availableLexemes = lexemes.filter(
    (lexeme) => lexeme.id !== Number(currentLexemeId)
  );

  async function handleAddParent() {

    if (parentIds.length === 0) {
      return;
    }

    let allSucceeded = true;

    for (const parentLexemeId of parentIds) {
      const succeeded = await onAddRelationship({
        parentLexemeId,
        daughterLexemeId: Number(currentLexemeId),
        notes: parentNotes,
      });

      if (!succeeded) {
        allSucceeded = false;
        break;
      }
    }

    if (allSucceeded) {
      setParentIds([]);
      setParentNotes("");
    }
  }

  async function handleAddDaughter() {

    if (daughterIds.length === 0) {
      return;
    }

    let allSucceeded = true;

    for (const daughterLexemeId of daughterIds) {
      const succeeded = await onAddRelationship({
        parentLexemeId: Number(currentLexemeId),
        daughterLexemeId,
        notes: daughterNotes,
      });

      if (!succeeded) {
        allSucceeded = false;
        break;
      }
    }

    if (allSucceeded) {
      setDaughterIds([]);
      setDaughterNotes("");
    }
  }

  return (
    <section className="relationship-editor">
      <h2>Relationships</h2>

      <p className="muted-text">
        Link this lexeme to existing parent or daughter lexemes.
      </p>

      {error && (
        <p className="error-message form-error">
          {error}
        </p>
      )}

      <div className="relationship-editor-grid">
        <section className="relationship-form">
          <h3>Add Parent</h3>
          
          <SearchableLexemeSelect
            label="Parent lexeme"
            lexemes={lexemes}
            selectedIds={parentIds}
            onChange={setParentIds}
            excludedIds={[
              Number(currentLexemeId),
              ...daughters.map((daughter) =>
                Number(daughter.id)
              ),
            ]}
            placeholder="Search for parents..."
          />

          <label>
            Relationship notes
            <textarea
              value={parentNotes}
              onChange={(event) =>
                setParentNotes(event.target.value)
              }
              rows="3"
              placeholder="Inherited with medial vowel loss."
            />
          </label>

          <button
            type="button"
            onClick={handleAddParent}
            disabled={isSaving || parentIds.length === 0}
          >
            {isSaving ? "Saving..." : "Add Parent"}
          </button>
        </section>

        <section className="relationship-form">
          <h3>Add Daughter</h3>

          <SearchableLexemeSelect
            label="Daughter lexeme"
            lexemes={lexemes}
            selectedIds={daughterIds}
            onChange={setDaughterIds}
            excludedIds={[
              Number(currentLexemeId),
              ...parents.map((parent) =>
                Number(parent.id)
              ),
            ]}
            placeholder="Search for daughters..."
          />

          <label>
            Relationship notes
            <textarea
              value={daughterNotes}
              onChange={(event) =>
                setDaughterNotes(event.target.value)
              }
              rows="3"
              placeholder="Developed through regular sound change."
            />
          </label>

          <button
            type="button"
            onClick={handleAddDaughter}
            disabled={isSaving || daughterIds.length === 0}
          >
            {isSaving ? "Saving..." : "Add Daughter"}
          </button>
        </section>
      </div>

      <div className="current-relationships">
        <div>
          <h3>Current Parents</h3>

          {parents.length === 0 ? (
            <p className="muted-text">None recorded.</p>
          ) : (
            <ul>
              {parents.map((parent) => (
                <li key={parent.relation_id}>
                  <div className="relationship-list-row">
                    <div>
                      <Link
                        className="relationship-edit-link"
                        to={`/lexemes/${parent.id}`}
                      >
                        {parent.lemma}
                      </Link>{" "}

                      <span className="muted-text">
                        {parent.language_code} · {parent.age_code}
                      </span>

                      {parent.relationship_notes && (
                        <div className="relationship-note">
                          {parent.relationship_notes}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="danger-button compact-button"
                      onClick={() =>
                        onDeleteRelationship(
                          parent.relation_id,
                          `parent ${parent.lemma}`
                        )
                      }
                      disabled={isSaving}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3>Current Daughters</h3>

          {daughters.length === 0 ? (
            <p className="muted-text">None recorded.</p>
          ) : (
            <ul>
              {daughters.map((daughter) => (
                <li key={daughter.relation_id}>
                  <div className="relationship-list-row">
                    <div>
                      <Link
                        className="relationship-edit-link"
                        to={`/lexemes/${daughter.id}`}
                      >
                        {daughter.lemma}
                      </Link>{" "}

                      <span className="muted-text">
                        {daughter.language_code} · {daughter.age_code}
                      </span>

                      {daughter.relationship_notes && (
                        <div className="relationship-note">
                          {daughter.relationship_notes}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="danger-button compact-button"
                      onClick={() =>
                        onDeleteRelationship(
                          daughter.relation_id,
                          `daughter ${daughter.lemma}`
                        )
                      }
                      disabled={isSaving}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export default RelationshipEditor;