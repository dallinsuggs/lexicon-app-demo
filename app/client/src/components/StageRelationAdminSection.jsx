import { apiFetch } from "../api";

import { useEffect, useMemo, useState } from "react";

import SearchableStageSelect from "./SearchableStageSelect";

const EMPTY_FORM = {
  sourceStageId: "",
  targetStageId: "",
  relationType: "",
  notes: "",
};

function StageRelationAdminSection() {
  const [relations, setRelations] = useState([]);
  const [stages, setStages] = useState([]);
  const [relationTypes, setRelationTypes] =
    useState([]);

  const [createForm, setCreateForm] =
    useState(EMPTY_FORM);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    relationType: "",
    notes: "",
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");

  async function loadData() {
    try {
      setIsLoading(true);
      setLoadError("");

      const [
        relationsResponse,
        stagesResponse,
        typesResponse,
      ] = await Promise.all([
        apiFetch("/stage-relations"),
        apiFetch("/stages"),
        apiFetch("/stage-relation-types"),
      ]);

      const [
        relationsData,
        stagesData,
        typesData,
      ] = await Promise.all([
        relationsResponse.json(),
        stagesResponse.json(),
        typesResponse.json(),
      ]);

      if (!relationsResponse.ok) {
        throw new Error(
          relationsData.error ||
            "Stage relationships could not be loaded."
        );
      }

      if (!stagesResponse.ok) {
        throw new Error(
          stagesData.error ||
            "Language stages could not be loaded."
        );
      }

      if (!typesResponse.ok) {
        throw new Error(
          typesData.error ||
            "Relationship types could not be loaded."
        );
      }

      setRelations(relationsData);
      setStages(stagesData);
      setRelationTypes(typesData);
    } catch (error) {
      console.error(error);
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const groupedRelationTypes = useMemo(() => {
    return relationTypes.reduce(
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
  }, [relationTypes]);

  function updateCreateForm(event) {
    const { name, value } = event.target;

    setCreateForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function validateCreateForm() {
    if (!createForm.sourceStageId) {
      return "A source stage is required.";
    }

    if (!createForm.targetStageId) {
      return "A target stage is required.";
    }

    if (
      createForm.sourceStageId ===
      createForm.targetStageId
    ) {
      return "A stage cannot relate to itself.";
    }

    if (!createForm.relationType) {
      return "A relationship type is required.";
    }

    return "";
  }

  async function handleCreate(event) {
    event.preventDefault();

    const validationError = validateCreateForm();

    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      setIsSaving(true);
      setFormError("");

      const response = await apiFetch(
        "/stage-relations",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sourceStageId: Number(
              createForm.sourceStageId
            ),
            targetStageId: Number(
              createForm.targetStageId
            ),
            relationType:
              createForm.relationType,
            notes: createForm.notes.trim(),
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The stage relationship could not be created."
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

  function beginEditing(relation) {
    setEditingId(relation.id);

    setEditForm({
      relationType: relation.relation_type,
      notes: relation.notes || "",
    });

    setFormError("");
  }

  function cancelEditing() {
    if (isSaving) {
      return;
    }

    setEditingId(null);
    setEditForm({
      relationType: "",
      notes: "",
    });

    setFormError("");
  }

  function updateEditForm(event) {
    const { name, value } = event.target;

    setEditForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleUpdate(event) {
    event.preventDefault();

    if (!editForm.relationType) {
      setFormError(
        "A relationship type is required."
      );
      return;
    }

    try {
      setIsSaving(true);
      setFormError("");

      const response = await apiFetch(
        `/stage-relations/${editingId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            relationType: editForm.relationType,
            notes: editForm.notes.trim(),
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The stage relationship could not be updated."
        );
      }

      setEditingId(null);
      setEditForm({
        relationType: "",
        notes: "",
      });

      await loadData();
    } catch (error) {
      console.error(error);
      setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(relation) {
    const confirmed = window.confirm(
      `Remove this language-stage relationship?\n\n` +
        `${relation.source_stage_code} → ` +
        `${relation.target_stage_code}\n` +
        `${formatRelationType(
          relation.relation_type
        )}`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(relation.id);
      setLoadError("");

      const response = await apiFetch(
        `/stage-relations/${relation.id}`,
        {
          method: "DELETE",
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The stage relationship could not be deleted."
        );
      }

      if (editingId === relation.id) {
        setEditingId(null);
      }

      await loadData();
    } catch (error) {
      console.error(error);
      setLoadError(error.message);
    } finally {
      setDeletingId(null);
    }
  }

  function formatRelationType(code) {
    const match = relationTypes.find(
      (type) => type.code === code
    );

    return match ? match.name : code;
  }

  function getRelationCategory(code) {
    const match = relationTypes.find(
      (type) => type.code === code
    );

    return match?.category || "other";
  }

  function renderRelationTypeOptions() {
    return Object.entries(groupedRelationTypes).map(
      ([category, types]) => (
        <optgroup
          key={category}
          label={
            category === "genetic"
              ? "Genetic relationships"
              : category === "contact"
                ? "Contact and influence"
                : "Other"
          }
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
    );
  }

  return (
    <section className="admin-section">
      <header className="admin-section-header">
        <div>
          <h2>Stage Relationships</h2>

          <p>
            Record genetic descent, branching,
            mixed-language formation, and contact influence.
          </p>
        </div>
      </header>

      {loadError && (
        <p className="error-message">
          {loadError}
        </p>
      )}

      <form
        className="stage-relation-create-form"
        onSubmit={handleCreate}
      >
        <div className="stage-relation-selector-grid">
          <SearchableStageSelect
            label="Source stage"
            stages={stages}
            value={createForm.sourceStageId}
            onChange={(sourceStageId) =>
              setCreateForm((current) => ({
                ...current,
                sourceStageId,
              }))
            }
            excludedIds={[
              createForm.targetStageId,
            ].filter(Boolean)}
            placeholder="Search source stages..."
          />

          <SearchableStageSelect
            label="Target stage"
            stages={stages}
            value={createForm.targetStageId}
            onChange={(targetStageId) =>
              setCreateForm((current) => ({
                ...current,
                targetStageId,
              }))
            }
            excludedIds={[
              createForm.sourceStageId,
            ].filter(Boolean)}
            placeholder="Search target stages..."
          />
        </div>

        <label>
          Relationship type
          <select
            name="relationType"
            value={createForm.relationType}
            onChange={updateCreateForm}
          >
            <option value="">
              Select relationship type
            </option>

            {renderRelationTypeOptions()}
          </select>
        </label>

        <label>
          Notes
          <textarea
            name="notes"
            rows="3"
            value={createForm.notes}
            onChange={updateCreateForm}
            placeholder="Optional historical explanation."
          />
        </label>

        {formError && (
          <p className="error-message form-error">
            {formError}
          </p>
        )}

        <div className="form-actions">
          <button
            type="submit"
            disabled={isSaving}
          >
            {isSaving
              ? "Saving..."
              : "Add Stage Relationship"}
          </button>
        </div>
      </form>

      {isLoading ? (
        <p className="status-message">
          Loading stage relationships...
        </p>
      ) : (
        <div className="stage-relation-list">
          {relations.length === 0 ? (
            <p className="muted-text">
              No language-stage relationships recorded.
            </p>
          ) : (
            relations.map((relation) => (
              <article
                className="stage-relation-item"
                key={relation.id}
              >
                {editingId === relation.id ? (
                  <form
                    className="stage-relation-edit-form"
                    onSubmit={handleUpdate}
                  >
                    <div className="stage-relation-summary">
                      <strong>
                        {relation.source_stage_code}
                      </strong>

                      <span aria-hidden="true">→</span>

                      <strong>
                        {relation.target_stage_code}
                      </strong>
                    </div>

                    <label>
                      Relationship type
                      <select
                        name="relationType"
                        value={
                          editForm.relationType
                        }
                        onChange={updateEditForm}
                      >
                        {renderRelationTypeOptions()}
                      </select>
                    </label>

                    <label>
                      Notes
                      <textarea
                        name="notes"
                        rows="3"
                        value={editForm.notes}
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
                  </form>
                ) : (
                  <>
                    <div className="stage-relation-content">
                      <div className="stage-relation-summary">
                        <strong>
                          {relation.source_stage_code}
                        </strong>

                        <span
                          className="stage-relation-arrow"
                          aria-hidden="true"
                        >
                          →
                        </span>

                        <strong>
                          {relation.target_stage_code}
                        </strong>
                      </div>

                      <div className="stage-relation-details">
                        <span
                          className={`relation-category-badge relation-category-${getRelationCategory(
                            relation.relation_type
                          )}`}
                        >
                          {getRelationCategory(
                            relation.relation_type
                          )}
                        </span>

                        <span>
                          {formatRelationType(
                            relation.relation_type
                          )}
                        </span>
                      </div>

                      <p className="muted-text">
                        {relation.source_stage_name}
                        {" → "}
                        {relation.target_stage_name}
                      </p>

                      {relation.notes && (
                        <p className="admin-item-notes">
                          {relation.notes}
                        </p>
                      )}
                    </div>

                    <div className="admin-item-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          beginEditing(relation)
                        }
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="danger-button"
                        onClick={() =>
                          handleDelete(relation)
                        }
                        disabled={
                          deletingId === relation.id
                        }
                      >
                        {deletingId === relation.id
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

export default StageRelationAdminSection;