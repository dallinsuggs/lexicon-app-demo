import { useEffect, useState } from "react";
import { apiFetch } from "../api";

const EMPTY_FORM = {
  code: "",
  name: "",
  sortOrder: "",
  notes: "",
};

function AgeAdminSection() {
  const [ages, setAges] = useState([]);

  const [createForm, setCreateForm] =
    useState(EMPTY_FORM);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");

  async function loadAges() {
    try {
      setIsLoading(true);
      setLoadError("");

      const response = await apiFetch(
        "/ages"
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "Historical ages could not be loaded."
        );
      }

      setAges(responseData);
    } catch (error) {
      console.error(error);
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAges();
  }, []);

  function updateCreateForm(event) {
    const { name, value } = event.target;

    setCreateForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function updateEditForm(event) {
    const { name, value } = event.target;

    setEditForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function validateForm(form) {
    if (!form.code.trim()) {
      return "Age code is required.";
    }

    if (!form.name.trim()) {
      return "Age name is required.";
    }

    if (
      form.sortOrder === "" ||
      !Number.isInteger(Number(form.sortOrder)) ||
      Number(form.sortOrder) < 0
    ) {
      return "Sort order must be a non-negative integer.";
    }

    return "";
  }

  async function handleCreate(event) {
    event.preventDefault();

    const validationError = validateForm(createForm);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      setIsSaving(true);
      setFormError("");

      const response = await apiFetch(
        "/ages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: createForm.code.trim(),
            name: createForm.name.trim(),
            sortOrder: Number(createForm.sortOrder),
            notes: createForm.notes.trim(),
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The historical age could not be created."
        );
      }

      setCreateForm(EMPTY_FORM);
      await loadAges();
    } catch (error) {
      console.error(error);
      setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  function beginEditing(age) {
    setEditingId(age.id);

    setEditForm({
      code: age.code,
      name: age.name,
      sortOrder: String(age.sort_order),
      notes: age.notes || "",
    });

    setFormError("");
  }

  function cancelEditing() {
    if (isSaving) {
      return;
    }

    setEditingId(null);
    setEditForm(EMPTY_FORM);
    setFormError("");
  }

  async function handleUpdate(event) {
    event.preventDefault();

    const validationError = validateForm(editForm);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      setIsSaving(true);
      setFormError("");

      const response = await apiFetch(
        `/ages/${editingId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: editForm.code.trim(),
            name: editForm.name.trim(),
            sortOrder: Number(editForm.sortOrder),
            notes: editForm.notes.trim(),
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The historical age could not be updated."
        );
      }

      setEditingId(null);
      setEditForm(EMPTY_FORM);

      await loadAges();
    } catch (error) {
      console.error(error);
      setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(age) {
    const confirmed = window.confirm(
      `Delete the historical age "${age.code}"?\n\n` +
        "Deletion will be blocked if any language stages use it."
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(age.id);
      setLoadError("");

      const response = await apiFetch(
        `/ages/${age.id}`,
        {
          method: "DELETE",
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The historical age could not be deleted."
        );
      }

      if (editingId === age.id) {
        setEditingId(null);
        setEditForm(EMPTY_FORM);
      }

      await loadAges();
    } catch (error) {
      console.error(error);
      setLoadError(error.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="admin-section">
      <header className="admin-section-header">
        <div>
          <h2>Historical Ages</h2>

          <p>
            Global chronological periods shared across the
            entire worldbuilding project.
          </p>
        </div>
      </header>

      {loadError && (
        <p className="error-message">{loadError}</p>
      )}

      <form
        className="admin-create-form admin-age-form"
        onSubmit={handleCreate}
      >
        <label>
          Code
          <input
            type="text"
            name="code"
            value={createForm.code}
            onChange={updateCreateForm}
            placeholder="A0"
          />
        </label>

        <label>
          Name
          <input
            type="text"
            name="name"
            value={createForm.name}
            onChange={updateCreateForm}
            placeholder="Age 0"
          />
        </label>

        <label>
          Sort order
          <input
            type="number"
            min="0"
            step="1"
            name="sortOrder"
            value={createForm.sortOrder}
            onChange={updateCreateForm}
            placeholder="0"
          />
        </label>

        <button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Add Age"}
        </button>

        <label className="admin-full-width-field">
          Notes
          <textarea
            name="notes"
            rows="3"
            value={createForm.notes}
            onChange={updateCreateForm}
            placeholder="Optional chronological notes."
          />
        </label>
      </form>

      {formError && (
        <p className="error-message form-error">
          {formError}
        </p>
      )}

      {isLoading ? (
        <p className="status-message">
          Loading historical ages...
        </p>
      ) : (
        <div className="admin-list">
          {ages.length === 0 ? (
            <p className="muted-text">
              No historical ages have been created.
            </p>
          ) : (
            ages.map((age) => (
              <article
                className="admin-list-item"
                key={age.id}
              >
                {editingId === age.id ? (
                  <form
                    className="admin-edit-form admin-age-form"
                    onSubmit={handleUpdate}
                  >
                    <label>
                      Code
                      <input
                        type="text"
                        name="code"
                        value={editForm.code}
                        onChange={updateEditForm}
                      />
                    </label>

                    <label>
                      Name
                      <input
                        type="text"
                        name="name"
                        value={editForm.name}
                        onChange={updateEditForm}
                      />
                    </label>

                    <label>
                      Sort order
                      <input
                        type="number"
                        min="0"
                        step="1"
                        name="sortOrder"
                        value={editForm.sortOrder}
                        onChange={updateEditForm}
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
                        type="submit"
                        disabled={isSaving}
                      >
                        {isSaving
                          ? "Saving..."
                          : "Save Changes"}
                      </button>
                    </div>

                    <label className="admin-full-width-field">
                      Notes
                      <textarea
                        name="notes"
                        rows="3"
                        value={editForm.notes}
                        onChange={updateEditForm}
                      />
                    </label>
                  </form>
                ) : (
                  <>
                    <div className="admin-item-information">
                      <strong>{age.code}</strong>

                      <span>{age.name}</span>

                      <span>
                        Sort order: {age.sort_order}
                      </span>

                      {age.notes && (
                        <p className="admin-item-notes">
                          {age.notes}
                        </p>
                      )}
                    </div>

                    <div className="admin-item-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => beginEditing(age)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => handleDelete(age)}
                        disabled={deletingId === age.id}
                      >
                        {deletingId === age.id
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </div>
                  </>
                )}
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}

export default AgeAdminSection;