function FormEditor({
  forms,
  onChange,
  embedded = false,
}) {
  function updateForm(id, field, value) {
    onChange(
      forms.map((form) =>
        form.clientId === id
          ? {
              ...form,
              [field]: value,
            }
          : form
      )
    );
  }

  function addForm() {
    onChange([
      ...forms,
      {
        clientId: crypto.randomUUID(),
        formLabel: "",
        form: "",
        notes: "",
      },
    ]);
  }

  function removeForm(id) {

    onChange(
      forms.filter(
        (form) => form.clientId !== id
      )
    );
  }

  function moveForm(index, offset) {
    const newIndex = index + offset;

    if (
      newIndex < 0 ||
      newIndex >= forms.length
    ) {
      return;
    }

    const reorderedForms = [...forms];

    const [movedForm] = reorderedForms.splice(
      index,
      1
    );

    reorderedForms.splice(
      newIndex,
      0,
      movedForm
    );

    onChange(reorderedForms);
  }

  return (
    <section
        className={
            embedded
            ? "form-editor-content"
            : "form-editor"
        }
        >
      <div className="section-heading-row">
        <div>
          <h3>Forms</h3>

          <p className="muted-text">
            Irregular, inflected, or citation forms.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          data-shortcut="add-form"
          onClick={addForm}
        >
          Add Form
        </button>
      </div>

      <div className="form-editor-list">
        {forms.map((form, index) => (
          <article
            className="form-editor-row"
            key={form.clientId}
          >
            <span className="form-order">
              {index + 1}
            </span>

            <label>
                Form label
                <input
                    type="text"
                    value={form.formLabel}
                    onChange={(event) =>
                        updateForm(
                            form.clientId,
                            "formLabel",
                            event.target.value
                        )
                    }
                    placeholder="accusative"
                />
            </label>

            <label>
                Form
                <input
                    type="text"
                    value={form.form}
                    onChange={(event) =>
                        updateForm(
                            form.clientId,
                            "form",
                            event.target.value
                        )
                    }
                    placeholder="nam"
                />
            </label>

            <label>
                Notes
                <input
                    type="text"
                    value={form.notes}
                    onChange={(event) =>
                        updateForm(
                            form.clientId,
                            "notes",
                            event.target.value
                        )
                    }
                    placeholder="Optional"
                />
            </label>

            <div className="form-row-actions">
              <button
                type="button"
                className="compact-button secondary-button"
                onClick={() => moveForm(index, -1)}
                disabled={index === 0}
                aria-label="Move form up"
              >
                ↑
              </button>

              <button
                type="button"
                className="compact-button secondary-button"
                onClick={() => moveForm(index, 1)}
                disabled={
                  index === forms.length - 1
                }
                aria-label="Move form down"
              >
                ↓
              </button>

              <button
                type="button"
                className="compact-button danger-button"
                onClick={() =>
                  removeForm(form.clientId)
                }
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

export default FormEditor;