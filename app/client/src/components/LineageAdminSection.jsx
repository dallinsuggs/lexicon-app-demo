import { apiFetch } from "../api";
import { useEffect, useState } from "react";

const EMPTY_FORM = {
  code: "",
  name: "",
  notes: "",
};

function LineageAdminSection() {
  const [lineages, setLineages] = useState([]);

  const [createForm, setCreateForm] =
    useState(EMPTY_FORM);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  const [showArchived, setShowArchived] =
    useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeActionId, setActiveActionId] =
    useState(null);

  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");

  async function loadLineages() {
    try {
      setIsLoading(true);
      setLoadError("");

      const query = showArchived
        ? "?includeArchived=true"
        : "";

      // loadLineages()

      const response = await apiFetch(
        `/lineages${query}`
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "Language lineages could not be loaded."
        );
      }

      setLineages(responseData);
    } catch (error) {
      console.error(error);
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadLineages();
  }, [showArchived]);

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
      return "Lineage code is required.";
    }

    if (!form.name.trim()) {
      return "Lineage name is required.";
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
        "/lineages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: createForm.code.trim(),
            name: createForm.name.trim(),
            notes: createForm.notes.trim(),
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The language lineage could not be created."
        );
      }

      setCreateForm(EMPTY_FORM);
      await loadLineages();
    } catch (error) {
      console.error(error);
      setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  function beginEditing(lineage) {
    setEditingId(lineage.id);

    setEditForm({
      code: lineage.code,
      name: lineage.name,
      notes: lineage.notes || "",
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
        `/lineages/${editingId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: editForm.code.trim(),
            name: editForm.name.trim(),
            notes: editForm.notes.trim(),
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The language lineage could not be updated."
        );
      }

      setEditingId(null);
      setEditForm(EMPTY_FORM);

      await loadLineages();
    } catch (error) {
      console.error(error);
      setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive(lineage, isArchived) {
    const action = isArchived ? "archive" : "restore";

    const confirmed = window.confirm(
      `${isArchived ? "Archive" : "Restore"} the lineage ` +
        `"${lineage.code}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setActiveActionId(lineage.id);
      setLoadError("");

      const response = await apiFetch(
        `/lineages/${lineage.id}/archive`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isArchived,
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            `The lineage could not be ${action}d.`
        );
      }

      await loadLineages();
    } catch (error) {
      console.error(error);
      setLoadError(error.message);
    } finally {
      setActiveActionId(null);
    }
  }

  async function handleDelete(lineage) {
    const confirmed = window.confirm(
      `Permanently delete the lineage "${lineage.code}"?\n\n` +
        "Deletion will be blocked if language stages use it."
    );

    if (!confirmed) {
      return;
    }

    try {
      setActiveActionId(lineage.id);
      setLoadError("");

      const response = await apiFetch(
        `/lineages/${lineage.id}`,
        {
          method: "DELETE",
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The language lineage could not be deleted."
        );
      }

      if (editingId === lineage.id) {
        setEditingId(null);
        setEditForm(EMPTY_FORM);
      }

      await loadLineages();
    } catch (error) {
      console.error(error);
      setLoadError(error.message);
    } finally {
      setActiveActionId(null);
    }
  }

  return (
    <section className="admin-section">
      <header className="admin-section-header admin-section-header-with-actions">
        <div>
          <h2>Language Lineages</h2>

          <p>
            Continuing developmental branches such as C1-L1,
            C1-L2, or C1C2-L1.
          </p>
        </div>

        <label className="admin-checkbox">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) =>
              setShowArchived(event.target.checked)
            }
          />

          Show archived
        </label>
      </header>

      {loadError && (
        <p className="error-message">{loadError}</p>
      )}

      <form
        className="admin-create-form admin-lineage-form"
        onSubmit={handleCreate}
      >
        <label>
          Code
          <input
            type="text"
            name="code"
            value={createForm.code}
            onChange={updateCreateForm}
            placeholder="C1-L1"
          />
        </label>

        <label>
          Name
          <input
            type="text"
            name="name"
            value={createForm.name}
            onChange={updateCreateForm}
            placeholder="C1 Primary Lineage"
          />
        </label>

        <button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Add Lineage"}
        </button>

        <label className="admin-full-width-field">
          Notes
          <textarea
            name="notes"
            rows="3"
            value={createForm.notes}
            onChange={updateCreateForm}
            placeholder="Optional notes about this developmental branch."
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
          Loading language lineages...
        </p>
      ) : (
        <div className="admin-list">
          {lineages.length === 0 ? (
            <p className="muted-text">
              No language lineages found.
            </p>
          ) : (
            lineages.map((lineage) => (
              <article
                className={`admin-list-item ${
                  lineage.is_archived
                    ? "admin-list-item-archived"
                    : ""
                }`}
                key={lineage.id}
              >
                {editingId === lineage.id ? (
                  <form
                    className="admin-edit-form admin-lineage-form"
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
                      <div className="admin-title-row">
                        <strong>{lineage.code}</strong>

                        {lineage.is_archived === 1 && (
                          <span className="archive-badge">
                            Archived
                          </span>
                        )}
                      </div>

                      <span>{lineage.name}</span>

                      {lineage.notes && (
                        <p className="admin-item-notes">
                          {lineage.notes}
                        </p>
                      )}
                    </div>

                    <div className="admin-item-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => beginEditing(lineage)}
                        disabled={activeActionId === lineage.id}
                      >
                        Edit
                      </button>

                      {lineage.is_archived === 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleArchive(lineage, false)
                          }
                          disabled={
                            activeActionId === lineage.id
                          }
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            handleArchive(lineage, true)
                          }
                          disabled={
                            activeActionId === lineage.id
                          }
                        >
                          Archive
                        </button>
                      )}

                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => handleDelete(lineage)}
                        disabled={activeActionId === lineage.id}
                      >
                        {activeActionId === lineage.id
                          ? "Working..."
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

export default LineageAdminSection;