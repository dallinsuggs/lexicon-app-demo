function GlossEditor({
  glosses,
  onChange,
}) {
  function updateGloss(id, field, value) {
    onChange(
      glosses.map((gloss) =>
        gloss.clientId === id
          ? {
              ...gloss,
              [field]: value,
            }
          : gloss
      )
    );
  }

  function addGloss() {
    onChange([
      ...glosses,
      {
        clientId: crypto.randomUUID(),
        gloss: "",
        notes: "",
      },
    ]);
  }

  function removeGloss(id) {
    if (glosses.length === 1) {
      return;
    }

    onChange(
      glosses.filter(
        (gloss) => gloss.clientId !== id
      )
    );
  }

  function moveGloss(index, offset) {
    const newIndex = index + offset;

    if (
      newIndex < 0 ||
      newIndex >= glosses.length
    ) {
      return;
    }

    const reorderedGlosses = [...glosses];

    const [movedGloss] = reorderedGlosses.splice(
      index,
      1
    );

    reorderedGlosses.splice(
      newIndex,
      0,
      movedGloss
    );

    onChange(reorderedGlosses);
  }

  return (
    <section className="gloss-editor">
      <div className="section-heading-row">
        <div>
          <h3>Glosses</h3>

          <p className="muted-text">
            Each row represents one ordered sense.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          data-shortcut="add-gloss"
          onClick={addGloss}
        >
          Add Gloss
        </button>
      </div>

      <div className="gloss-editor-list">
        {glosses.map((gloss, index) => (
          <article
            className="gloss-editor-row"
            key={gloss.clientId}
          >
            <span className="gloss-order">
              {index + 1}
            </span>

            <label>
              Gloss
              <input
                type="text"
                value={gloss.gloss}
                onChange={(event) =>
                  updateGloss(
                    gloss.clientId,
                    "gloss",
                    event.target.value
                  )
                }
                placeholder="mother"
              />
            </label>

            <label>
              Sense notes
              <input
                type="text"
                value={gloss.notes}
                onChange={(event) =>
                  updateGloss(
                    gloss.clientId,
                    "notes",
                    event.target.value
                  )
                }
                placeholder="Optional usage or semantic notes"
              />
            </label>

            <div className="gloss-row-actions">
              <button
                type="button"
                className="compact-button secondary-button"
                onClick={() => moveGloss(index, -1)}
                disabled={index === 0}
                aria-label="Move gloss up"
              >
                ↑
              </button>

              <button
                type="button"
                className="compact-button secondary-button"
                onClick={() => moveGloss(index, 1)}
                disabled={
                  index === glosses.length - 1
                }
                aria-label="Move gloss down"
              >
                ↓
              </button>

              <button
                type="button"
                className="compact-button danger-button"
                onClick={() =>
                  removeGloss(gloss.clientId)
                }
                disabled={glosses.length === 1}
              >
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default GlossEditor;