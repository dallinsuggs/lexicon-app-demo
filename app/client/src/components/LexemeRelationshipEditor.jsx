import { Link } from "react-router";
import { useState } from "react";

import SearchableLexemeSelect from "./SearchableLexemeSelect";

const EMPTY_RELATIONSHIP_FORM = {
  direction: "incoming",
  relatedLexemeId: "",
  relationType: "",
  notes: "",
};

function LexemeRelationshipEditor({
  currentLexemeId,
  lexemes = [],
  relationTypes,
  searchFilters,
  incomingRelations,
  outgoingRelations,
  symmetricRelations,
  onCreate,
  onUpdate,
  onDelete,
  isSaving,
  error,
}) {
  const [createForm, setCreateForm] = useState(
    EMPTY_RELATIONSHIP_FORM
  );

  const [editingRelationId, setEditingRelationId] =
    useState(null);

  const [editForm, setEditForm] = useState({
    direction: "incoming",
    relationType: "",
    notes: "",
  });

  function getTypesForDirection(direction) {
    const wantsSymmetric =
      direction === "symmetric";

    const availableRelationTypes =
      Array.isArray(relationTypes)
        ? relationTypes
        : [];

    return availableRelationTypes.filter(
      (type) =>
        Boolean(type.isSymmetrical) ===
        wantsSymmetric
    );
  }

  function groupRelationTypes(types) {
    return types.reduce(
      (groups, relationType) => {
        const category =
          relationType.category || "other";

        if (!groups[category]) {
          groups[category] = [];
        }

        groups[category].push(relationType);

        return groups;
      },
      {}
    );
  }

  function renderTypeOptions(direction) {
    const availableTypes =
      getTypesForDirection(direction);

    const groupedTypes =
      groupRelationTypes(availableTypes);

    return Object.entries(groupedTypes).map(
      ([category, types]) => (
        <optgroup key={category} label={category}>
          {types.map((type) => (
            <option
              key={type.code}
              value={type.code}
            >
              {type.name}
            </option>
          ))}
        </optgroup>
      )
    );
  }

  function getTypeName(code) {
    const type = relationTypes.find(
      (candidate) => candidate.code === code
    );

    return type?.name || code;
  }

  function getTypeCategory(code) {
    const type = relationTypes.find(
      (candidate) => candidate.code === code
    );

    return type?.category || "other";
  }

  async function handleCreate() {
    if (!createForm.relatedLexemeId) {
      return;
    }

    if (!createForm.relationType) {
      return;
    }

    const currentId = Number(currentLexemeId);
    const relatedId = Number(
      createForm.relatedLexemeId
    );

    let payload;

    if (createForm.direction === "incoming") {
      payload = {
        sourceLexemeId: relatedId,
        targetLexemeId: currentId,
      };
    } else {
      /*
      * Outgoing and symmetric relationships can both
      * be submitted in this order. The backend canonicalizes
      * symmetric endpoint ordering.
      */
      payload = {
        sourceLexemeId: currentId,
        targetLexemeId: relatedId,
      };
    }
    const succeeded = await onCreate({
      ...payload,
      relationType: createForm.relationType,
      notes: createForm.notes,
    });

    if (succeeded) {
      setCreateForm(EMPTY_RELATIONSHIP_FORM);
    }
  }

  function beginEditing(relation, direction) {
    setEditingRelationId(relation.relation_id);

    setEditForm({
      direction,
      relationType: relation.relation_type,
      notes: relation.relationship_notes || "",
    });
  }

  function cancelEditing() {
    if (isSaving) {
      return;
    }

    setEditingRelationId(null);

    setEditForm({
      direction: "incoming",
      relationType: "",
      notes: "",
    });
  }

  async function handleUpdate() {
    if (!editForm.relationType) {
      return;
    }

    const succeeded = await onUpdate(
      editingRelationId,
      {
        relationType: editForm.relationType,
        notes: editForm.notes,
      }
    );

    if (succeeded) {
      cancelEditing();
    }
  }

  function renderRelation(
    relation,
    direction
  ) {
    const isEditing =
      editingRelationId === relation.relation_id;

    let arrow;

    if (direction === "incoming") {
      arrow = "→ this lexeme";
    } else if (direction === "outgoing") {
      arrow = "this lexeme →";
    } else {
      arrow = "this lexeme ↔";
    }

    return (
      <article
        className={`lexeme-relation-item ${
          relation.is_archived === 1
            ? "archived-relation-item"
            : ""
        }`}
        key={relation.relation_id}
      >
        {isEditing ? (
          <div className="lexeme-relation-edit-form">
            <label>
              Relationship type
              <select
                value={editForm.relationType}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    relationType:
                      event.target.value,
                  }))
                }
              >
                {renderTypeOptions(editForm.direction)}
              </select>
            </label>

            <label>
              Relationship notes
              <textarea
                rows="3"
                value={editForm.notes}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </label>

            <div className="admin-item-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={cancelEditing}
                disabled={isSaving}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleUpdate}
                disabled={
                  isSaving ||
                  !editForm.relationType
                }
              >
                {isSaving
                  ? "Saving..."
                  : "Save Relationship"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="lexeme-relation-content">
              <div className="lexeme-relation-heading">
                <span className="muted-text">
                  {arrow}
                </span>

                <Link
                  to={`/lexemes/${relation.id}`}
                >
                  {relation.lemma}
                </Link>

                {relation.is_archived === 1 && (
                  <span className="archive-badge">
                    Archived
                  </span>
                )}
              </div>

              <div className="stage-relation-details">
                <span
                  className={`relation-category-badge relation-category-${getTypeCategory(
                    relation.relation_type
                  )}`}
                >
                  {getTypeCategory(
                    relation.relation_type
                  )}
                </span>

                <span>
                  {getTypeName(
                    relation.relation_type
                  )}
                </span>
              </div>

              <p className="relationship-metadata">
                {relation.stage_code}
                {" · "}
                {relation.lineage_code}
                {" · "}
                {relation.age_code}
                {relation.glosses
                  ? ` — ${relation.glosses}`
                  : ""}
              </p>

              {relation.relationship_notes && (
                <p className="relationship-note">
                  {relation.relationship_notes}
                </p>
              )}
            </div>

            <div className="admin-item-actions">
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() =>
                  beginEditing(relation, direction)
                }
                disabled={isSaving}
              >
                Edit
              </button>

              <button
                type="button"
                className="danger-button compact-button"
                onClick={() =>
                  onDelete(
                    relation.relation_id,
                    relation.lemma
                  )
                }
                disabled={isSaving}
              >
                Remove
              </button>
            </div>
          </>
        )}
      </article>
    );
  }

  return (
    <section className="relationship-editor">
      <div className="section-heading-row">
        <div>
          <h2>Lexical Relationships</h2>

          <p className="muted-text">
            Add, classify, edit, or remove historical
            connections to other lexemes.
          </p>
        </div>
      </div>

      {error && (
        <p className="error-message form-error">
          {error}
        </p>
      )}

      <button
        type="button"
        className="visually-hidden"
        data-shortcut="add-edit-relationship"
        onClick={() => {
          document
            .querySelector(
              ".relationship-editor .searchable-select input"
            )
            ?.focus();
        }}
        tabIndex={-1}
        aria-hidden="true"
      />

      <section className="new-relationship-row">
        <label>
          Direction
          <select
            value={createForm.direction}
            onChange={(event) => {
              const direction = event.target.value;

              setCreateForm((current) => ({
                ...current,
                direction,
                relationType: "",
              }));
            }}
          >
            <option value="incoming">
              Another lexeme → this lexeme
            </option>

            <option value="outgoing">
              This lexeme → another lexeme
            </option>

            <option value="symmetric">
              This lexeme ↔ another lexeme
            </option>
          </select>
        </label>

        <SearchableLexemeSelect
          label="Related lexeme"
          lexemes={lexemes}
          value={createForm.relatedLexemeId}
          excludedIds={[currentLexemeId]}
          searchFilters={searchFilters}
          onChange={(relatedLexemeId) =>
            setCreateForm((current) => ({
              ...current,
              relatedLexemeId,
            }))
          }
          placeholder="Search existing lexemes..."
        />

        <label>
          Relationship type
          <select
            value={createForm.relationType}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                relationType:
                  event.target.value,
              }))
            }
          >
            <option value="">
              Select relationship type
            </option>

            {renderTypeOptions(createForm.direction)}
          </select>
        </label>

        <label>
          Relationship notes
          <textarea
            rows="3"
            value={createForm.notes}
            onChange={(event) =>
              setCreateForm((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
          />
        </label>

        <button
          type="button"
          onClick={handleCreate}
          disabled={
            isSaving ||
            !createForm.relatedLexemeId ||
            !createForm.relationType
          }
        >
          {isSaving
            ? "Saving..."
            : "Add Relationship"}
        </button>
      </section>

      <div className="relationship-display-grid">
        <section>
          <h3>Incoming relationships</h3>

          {incomingRelations.length === 0 ? (
            <p className="muted-text">
              No incoming relationships recorded.
            </p>
          ) : (
            <div className="lexeme-relation-list">
              {incomingRelations.map((relation) =>
                renderRelation(
                  relation,
                  "incoming"
                )
              )}
            </div>
          )}
        </section>

        <section>
          <h3>Outgoing relationships</h3>

          {outgoingRelations.length === 0 ? (
            <p className="muted-text">
              No outgoing relationships recorded.
            </p>
          ) : (
            <div className="lexeme-relation-list">
              {outgoingRelations.map((relation) =>
                renderRelation(
                  relation,
                  "outgoing"
                )
              )}
            </div>
          )}
        </section>

        <section>
          <h3>Symmetric relationships</h3>

          {symmetricRelations.length === 0 ? (
            <p className="muted-text">
              No symmetric relationships recorded.
            </p>
          ) : (
            <div className="lexeme-relation-list">
              {symmetricRelations.map((relation) =>
                renderRelation(
                  relation,
                  "symmetric"
                )
              )}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

export default LexemeRelationshipEditor;