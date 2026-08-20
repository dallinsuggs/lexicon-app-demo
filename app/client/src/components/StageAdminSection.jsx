import { apiFetch } from "../api";

import { useEffect, useState } from "react";
import { Link } from "react-router";

const EMPTY_FORM = {
  code: "",
  name: "",
  lineageId: "",
  ageId: "",
  grammarPath: "",
  notes: "",
};

function StageAdminSection() {
  const [stages, setStages] = useState([]);
  const [lineages, setLineages] = useState([]);
  const [ages, setAges] = useState([]);

  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const [showArchived, setShowArchived] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeActionId, setActiveActionId] = useState(null);
  const [isSuggestingCode, setIsSuggestingCode] =
    useState(false);

  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");

  async function loadData() {
    try {
      setIsLoading(true);
      setLoadError("");

      const stageQuery = showArchived
        ? "?includeArchived=true"
        : "";

      const [
        stagesResponse,
        lineagesResponse,
        agesResponse,
      ] = await Promise.all([
        apiFetch(`/stages${stageQuery}`),
        apiFetch("/lineages"),
        apiFetch("/ages"),
      ]);

      const [
        stagesData,
        lineagesData,
        agesData,
      ] = await Promise.all([
        stagesResponse.json(),
        lineagesResponse.json(),
        agesResponse.json(),
      ]);

      if (!stagesResponse.ok) {
        throw new Error(
          stagesData.error ||
            "Language stages could not be loaded."
        );
      }

      if (!lineagesResponse.ok) {
        throw new Error(
          lineagesData.error ||
            "Language lineages could not be loaded."
        );
      }

      if (!agesResponse.ok) {
        throw new Error(
          agesData.error ||
            "Historical ages could not be loaded."
        );
      }

      setStages(stagesData);
      setLineages(lineagesData);
      setAges(agesData);
    } catch (error) {
      console.error(error);
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
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
    if (!form.lineageId) {
      return "A language lineage is required.";
    }

    if (!form.ageId) {
      return "A historical age is required.";
    }

    if (!form.code.trim()) {
      return "Language-stage code is required.";
    }

    if (!form.name.trim()) {
      return "Language-stage name is required.";
    }

    return "";
  }

  async function suggestCode(
    lineageId,
    ageId,
    setForm
  ) {
    if (!lineageId || !ageId) {
      return;
    }

    try {
      setIsSuggestingCode(true);
      setFormError("");

      const response = await apiFetch(
        `/stages/suggest-code?` +
          `lineageId=${lineageId}&ageId=${ageId}`
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "A stage code could not be suggested."
        );
      }

      setForm((current) => ({
        ...current,
        code: responseData.suggestedCode,
      }));
    } catch (error) {
      console.error(error);
      setFormError(error.message);
    } finally {
      setIsSuggestingCode(false);
    }
  }

  function handleCreateLineageChange(event) {
    const lineageId = event.target.value;

    setCreateForm((current) => ({
      ...current,
      lineageId,
    }));

    suggestCode(
      lineageId,
      createForm.ageId,
      setCreateForm
    );
  }

  function handleCreateAgeChange(event) {
    const ageId = event.target.value;

    setCreateForm((current) => ({
      ...current,
      ageId,
    }));

    suggestCode(
      createForm.lineageId,
      ageId,
      setCreateForm
    );
  }

  function handleEditLineageChange(event) {
    const lineageId = event.target.value;

    setEditForm((current) => ({
      ...current,
      lineageId,
    }));

    suggestCode(
      lineageId,
      editForm.ageId,
      setEditForm
    );
  }

  function handleEditAgeChange(event) {
    const ageId = event.target.value;

    setEditForm((current) => ({
      ...current,
      ageId,
    }));

    suggestCode(
      editForm.lineageId,
      ageId,
      setEditForm
    );
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
        "/stages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: createForm.code.trim(),
            name: createForm.name.trim(),
            lineageId: Number(createForm.lineageId),
            ageId: Number(createForm.ageId),
            grammarPath:
              createForm.grammarPath.trim(),
            notes: createForm.notes.trim(),
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The language stage could not be created."
        );
      }

      setCreateForm(EMPTY_FORM);
      await loadData();
    } catch (error) {
      console.error(error);
      setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  function beginEditing(stage) {
    setEditingId(stage.id);

    setEditForm({
      code: stage.code,
      name: stage.name,
      lineageId: String(stage.lineage_id),
      ageId: String(stage.age_id),
      grammarPath: stage.grammar_path || "",
      notes: stage.notes || "",
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
        `/stages/${editingId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: editForm.code.trim(),
            name: editForm.name.trim(),
            lineageId: Number(editForm.lineageId),
            ageId: Number(editForm.ageId),
            grammarPath: editForm.grammarPath.trim(),
            notes: editForm.notes.trim(),
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The language stage could not be updated."
        );
      }

      setEditingId(null);
      setEditForm(EMPTY_FORM);

      await loadData();
    } catch (error) {
      console.error(error);
      setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive(stage, isArchived) {
    const confirmed = window.confirm(
      `${isArchived ? "Archive" : "Restore"} the stage ` +
        `"${stage.code}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setActiveActionId(stage.id);
      setLoadError("");

      const response = await apiFetch(
        `/stages/${stage.id}/archive`,
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
            "The stage archive status could not be changed."
        );
      }

      await loadData();
    } catch (error) {
      console.error(error);
      setLoadError(error.message);
    } finally {
      setActiveActionId(null);
    }
  }

  async function handleDelete(stage) {
    const confirmed = window.confirm(
      `Permanently delete the stage "${stage.code}"?\n\n` +
        "Its stage relationships will be removed. " +
        "Deletion will be blocked if lexemes belong to it."
    );

    if (!confirmed) {
      return;
    }

    try {
      setActiveActionId(stage.id);
      setLoadError("");

      const response = await apiFetch(
        `/stages/${stage.id}`,
        {
          method: "DELETE",
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The language stage could not be deleted."
        );
      }

      if (editingId === stage.id) {
        setEditingId(null);
        setEditForm(EMPTY_FORM);
      }

      await loadData();
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
          <h2>Language Stages</h2>

          <p>
            One canonical language snapshot per lineage and
            historical age.
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
        className="admin-create-form admin-stage-form"
        onSubmit={handleCreate}
      >
        <label>
          Lineage
          <select
            name="lineageId"
            value={createForm.lineageId}
            onChange={handleCreateLineageChange}
          >
            <option value="">Select lineage</option>

            {lineages.map((lineage) => (
              <option
                key={lineage.id}
                value={lineage.id}
              >
                {lineage.code} — {lineage.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Historical age
          <select
            name="ageId"
            value={createForm.ageId}
            onChange={handleCreateAgeChange}
          >
            <option value="">Select age</option>

            {ages.map((age) => (
              <option key={age.id} value={age.id}>
                {age.code} — {age.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Stage code
          <input
            type="text"
            name="code"
            value={createForm.code}
            onChange={updateCreateForm}
            placeholder="C1-L1-A0"
          />
        </label>

        <label>
          Display name
          <input
            type="text"
            name="name"
            value={createForm.name}
            onChange={updateCreateForm}
            placeholder="C1-L1 Initial Stage"
          />
        </label>

        <button
          type="submit"
          disabled={isSaving || isSuggestingCode}
        >
          {isSaving ? "Saving..." : "Add Stage"}
        </button>

        <label className="admin-full-width-field">
          Grammar path
          <input
            type="text"
            name="grammarPath"
            value={createForm.grammarPath}
            onChange={updateCreateForm}
            placeholder="Languages/C1/C1-L1-A0/Grammar.md"
          />

          <span className="field-help">
            Path relative to the Obsidian vault root.
          </span>
        </label>

        <label className="admin-full-width-field">
          Notes
          <textarea
            name="notes"
            rows="3"
            value={createForm.notes}
            onChange={updateCreateForm}
            placeholder="Optional notes about this historical stage."
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
          Loading language stages...
        </p>
      ) : (
        <div className="admin-list">
          {stages.length === 0 ? (
            <p className="muted-text">
              No language stages found.
            </p>
          ) : (
            stages.map((stage) => (
              <article
                className={`admin-list-item ${
                  stage.is_archived
                    ? "admin-list-item-archived"
                    : ""
                }`}
                key={stage.id}
              >
                {editingId === stage.id ? (
                  <form
                    className="admin-edit-form admin-stage-form"
                    onSubmit={handleUpdate}
                  >
                    <label>
                      Lineage
                      <select
                        name="lineageId"
                        value={editForm.lineageId}
                        onChange={handleEditLineageChange}
                      >
                        <option value="">
                          Select lineage
                        </option>

                        {lineages.map((lineage) => (
                          <option
                            key={lineage.id}
                            value={lineage.id}
                          >
                            {lineage.code} —{" "}
                            {lineage.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Historical age
                      <select
                        name="ageId"
                        value={editForm.ageId}
                        onChange={handleEditAgeChange}
                      >
                        <option value="">
                          Select age
                        </option>

                        {ages.map((age) => (
                          <option
                            key={age.id}
                            value={age.id}
                          >
                            {age.code} — {age.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Stage code
                      <input
                        type="text"
                        name="code"
                        value={editForm.code}
                        onChange={updateEditForm}
                      />
                    </label>

                    <label>
                      Display name
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
                        disabled={
                          isSaving || isSuggestingCode
                        }
                      >
                        {isSaving
                          ? "Saving..."
                          : "Save Changes"}
                      </button>
                    </div>

                    <label className="admin-full-width-field">
                      Grammar path
                      <input
                        type="text"
                        name="grammarPath"
                        value={editForm.grammarPath}
                        onChange={updateEditForm}
                      />
                    </label>

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
                        <Link
                          to={`/stages/${stage.id}`}
                          className="admin-stage-link"
                        >
                          <strong>{stage.code}</strong>
                        </Link>

                        {stage.is_archived === 1 && (
                          <span className="archive-badge">
                            Archived
                          </span>
                        )}
                      </div>

                      <span>{stage.name}</span>

                      <span>
                        Lineage: {stage.lineage_code}
                      </span>

                      <span>
                        Age: {stage.age_code}
                      </span>

                      <span>
                        Lexemes: {stage.lexeme_count}
                      </span>

                      {stage.grammar_path && (
                        <span>
                          Grammar: {stage.grammar_path}
                        </span>
                      )}

                      {stage.notes && (
                        <p className="admin-item-notes">
                          {stage.notes}
                        </p>
                      )}
                    </div>

                    <div className="admin-item-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => beginEditing(stage)}
                        disabled={
                          activeActionId === stage.id
                        }
                      >
                        Edit
                      </button>

                      {stage.is_archived === 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleArchive(stage, false)
                          }
                          disabled={
                            activeActionId === stage.id
                          }
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            handleArchive(stage, true)
                          }
                          disabled={
                            activeActionId === stage.id
                          }
                        >
                          Archive
                        </button>
                      )}

                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => handleDelete(stage)}
                        disabled={
                          activeActionId === stage.id
                        }
                      >
                        {activeActionId === stage.id
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

export default StageAdminSection;