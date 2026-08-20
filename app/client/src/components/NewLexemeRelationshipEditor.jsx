import SearchableLexemeSelect from "./SearchableLexemeSelect";

function NewLexemeRelationshipEditor({
  relationships,
  onChange,
  onInheritanceSourceSelected,
  lexemes,
  relationTypes,
  searchFilters,
}) {
  function addRelationship() {
    onChange([
      ...relationships,
      {
        direction: "incoming",
        relatedLexemeId: "",
        relationType: "",
        notes: "",
      },
    ]);
  }

  function updateRelationship(
    index,
    field,
    value
  ) {
    const updatedRelationships = relationships.map(
      (relationship, relationshipIndex) => {
        if (relationshipIndex !== index) {
          return relationship;
        }

        const updatedRelationship = {
          ...relationship,
          [field]: value,
        };

        /*
        * A relationship type chosen for one direction
        * may not be valid after changing direction.
        */
        if (field === "direction") {
          updatedRelationship.relationType = "";
        }

        return updatedRelationship;
      }
    );

    onChange(updatedRelationships);

    const updatedRelationship =
      updatedRelationships[index];

    const isInheritanceSource =
      updatedRelationship.direction === "incoming" &&
      updatedRelationship.relationType ===
        "inherited_from" &&
      updatedRelationship.relatedLexemeId;

    if (
      isInheritanceSource &&
      [
        "direction",
        "relationType",
        "relatedLexemeId",
      ].includes(field)
    ) {
      onInheritanceSourceSelected?.(
        updatedRelationship.relatedLexemeId
      );
    }
  }

  function removeRelationship(index) {
    onChange(
      relationships.filter(
        (_, relationshipIndex) =>
          relationshipIndex !== index
      )
    );
  }

  const groupedTypes = relationTypes.reduce(
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

  return (
    <section className="create-relationship-section">
      <div className="section-heading-row">
        <div>
          <h3>Lexical Relationships</h3>

          <p className="muted-text">
            Optionally connect this entry to existing
            lexemes.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          data-shortcut="add-relationship"
          onClick={addRelationship}
        >
          Add Relationship
        </button>
      </div>

      {relationships.length === 0 ? (
        <p className="muted-text">
          No relationships selected.
        </p>
      ) : (
        <div className="new-relationship-list">
          {relationships.map(
            (relationship, index) => (
              <article
                className="new-relationship-row"
                key={index}
              >
                <label>
                  Direction
                  <select
                    value={relationship.direction}
                    onChange={(event) =>
                      updateRelationship(
                        index,
                        "direction",
                        event.target.value
                      )
                    }
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
                  value={
                    relationship.relatedLexemeId
                  }
                  onChange={(relatedLexemeId) =>
                    updateRelationship(
                      index,
                      "relatedLexemeId",
                      relatedLexemeId
                    )
                  }
                  placeholder="Search existing lexemes..."
                  searchFilters={searchFilters}
                />

                <label>
                  Relationship type
                  <select
                    value={relationship.relationType}
                    onChange={(event) =>
                      updateRelationship(
                        index,
                        "relationType",
                        event.target.value
                      )
                    }
                  >
                    <option value="">
                      Select relationship type
                    </option>

                    {Object.entries(groupedTypes).map(
                      ([category, types]) => (
                        <optgroup
                          key={category}
                          label={category}
                        >
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
                    )}
                  </select>
                </label>

                <label>
                  Relationship notes
                  <textarea
                    rows="2"
                    value={relationship.notes}
                    onChange={(event) =>
                      updateRelationship(
                        index,
                        "notes",
                        event.target.value
                      )
                    }
                    placeholder="Optional historical notes"
                  />
                </label>

                <button
                  type="button"
                  className="danger-button"
                  onClick={() =>
                    removeRelationship(index)
                  }
                >
                  Remove Relationship
                </button>
              </article>
            )
          )}
        </div>
      )}
    </section>
  );
}

export default NewLexemeRelationshipEditor;