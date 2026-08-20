import {
  useEffect,
  useState,
} from "react";

import { apiFetch } from "../api";

const EMPTY_FORM = {
  name: "",
  description: "",
};

function LexemeClassManager({
  stageId,
  stageCode,
}) {
  const [lexemeClasses, setLexemeClasses] =
    useState([]);

  const [createForm, setCreateForm] =
    useState(EMPTY_FORM);

  const [
    editingClassId,
    setEditingClassId,
  ] = useState(null);

  const [editForm, setEditForm] =
    useState(EMPTY_FORM);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSaving, setIsSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  async function loadLexemeClasses() {
    try {
      setIsLoading(true);
      setError("");

      const response = await apiFetch(
        `/stages/${stageId}/lexeme-classes`
      );

      const responseData =
        await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "Lexeme classes could not be loaded."
        );
      }

      setLexemeClasses(
        responseData.classes
      );
    } catch (loadError) {
      console.error(loadError);
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setCreateForm(EMPTY_FORM);
    setEditingClassId(null);
    setEditForm(EMPTY_FORM);
    setMessage("");
    setError("");

    loadLexemeClasses();
  }, [stageId]);

  async function handleCreate(event) {
    event.preventDefault();

    const name =
      createForm.name.trim();

    if (!name) {
      setError(
        "Lexeme-class name is required."
      );
      return;
    }

    try {
      setIsSaving(true);
      setError("");
      setMessage("");

      const response = await apiFetch(
        `/stages/${stageId}/lexeme-classes`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name,
            description:
              createForm.description.trim(),
          }),
        }
      );

      const responseData =
        await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The lexeme class could not be created."
        );
      }

      setCreateForm(EMPTY_FORM);

      setMessage(
        `"${responseData.name}" was created.`
      );

      await loadLexemeClasses();
    } catch (saveError) {
      console.error(saveError);
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  function beginEditing(lexemeClass) {
    if (isSaving) {
      return;
    }

    setEditingClassId(
      lexemeClass.id
    );

    setEditForm({
      name: lexemeClass.name,
      description:
        lexemeClass.description || "",
    });

    setError("");
    setMessage("");
  }

  function cancelEditing() {
    if (isSaving) {
      return;
    }

    setEditingClassId(null);
    setEditForm(EMPTY_FORM);
    setError("");
  }

  async function handleUpdate(event) {
    event.preventDefault();

    const name =
      editForm.name.trim();

    if (!name) {
      setError(
        "Lexeme-class name is required."
      );
      return;
    }

    try {
      setIsSaving(true);
      setError("");
      setMessage("");

      const response = await apiFetch(
        `/lexeme-classes/${editingClassId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name,
            description:
              editForm.description.trim(),
          }),
        }
      );

      const responseData =
        await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The lexeme class could not be updated."
        );
      }

      setEditingClassId(null);
      setEditForm(EMPTY_FORM);

      setMessage(
        `"${responseData.name}" was updated.`
      );

      await loadLexemeClasses();
    } catch (saveError) {
      console.error(saveError);
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(
    lexemeClass
  ) {
    const affectedLexemes =
      Number(
        lexemeClass.lexeme_count
      );

    const warning =
      affectedLexemes > 0
        ? `\n\n${affectedLexemes} lexeme${
            affectedLexemes === 1
              ? ""
              : "s"
          } will become unclassified.`
        : "";

    const confirmed = window.confirm(
      `Delete the lexeme class "${lexemeClass.name}" from ${stageCode}?${warning}`
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsSaving(true);
      setError("");
      setMessage("");

      const response = await apiFetch(
        `/lexeme-classes/${lexemeClass.id}`,
        {
          method: "DELETE",
        }
      );

      const responseData =
        await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The lexeme class could not be deleted."
        );
      }

      if (
        editingClassId ===
        lexemeClass.id
      ) {
        setEditingClassId(null);
        setEditForm(EMPTY_FORM);
      }

      setMessage(
        responseData.message
      );

      await loadLexemeClasses();
    } catch (deleteError) {
      console.error(deleteError);
      setError(deleteError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="lexeme-section lexeme-class-manager">
      <div className="section-heading-row">
        <div>
          <h2>Lexeme classes</h2>

          <p className="muted-text">
            Define grammatical or morphological
            subclasses available to lexemes in{" "}
            {stageCode}.
          </p>
        </div>
      </div>

      {error && (
        <p className="error-message">
          {error}
        </p>
      )}

      {message && (
        <p className="success-message">
          {message}
        </p>
      )}

      <form
        className="lexeme-class-form"
        onSubmit={handleCreate}
      >
        <label>
          Class name
          <input
            type="text"
            value={createForm.name}
            onChange={(event) =>
              setCreateForm(
                (current) => ({
                  ...current,
                  name:
                    event.target.value,
                })
              )
            }
            placeholder="maritime"
            disabled={isSaving}
          />
        </label>

        <label>
          Description
          <textarea
            rows="2"
            value={
              createForm.description
            }
            onChange={(event) =>
              setCreateForm(
                (current) => ({
                  ...current,
                  description:
                    event.target.value,
                })
              )
            }
            placeholder="Optional grammatical or semantic description"
            disabled={isSaving}
          />
        </label>

        <button
          type="submit"
          disabled={
            isSaving ||
            !createForm.name.trim()
          }
        >
          {isSaving
            ? "Saving..."
            : "Add Lexeme Class"}
        </button>
      </form>

      {isLoading ? (
        <p className="status-message">
          Loading lexeme classes...
        </p>
      ) : lexemeClasses.length === 0 ? (
        <p className="muted-text">
          No lexeme classes are defined
          for this language stage.
        </p>
      ) : (
        <div className="lexeme-class-list">
          {lexemeClasses.map(
            (lexemeClass) => {
              const isEditing =
                editingClassId ===
                lexemeClass.id;

              return (
                <article
                  className="lexeme-class-item"
                  key={lexemeClass.id}
                >
                  {isEditing ? (
                    <form
                      className="lexeme-class-edit-form"
                      onSubmit={
                        handleUpdate
                      }
                    >
                      <label>
                        Class name
                        <input
                          type="text"
                          value={
                            editForm.name
                          }
                          onChange={(
                            event
                          ) =>
                            setEditForm(
                              (
                                current
                              ) => ({
                                ...current,
                                name:
                                  event
                                    .target
                                    .value,
                              })
                            )
                          }
                          disabled={
                            isSaving
                          }
                          required
                        />
                      </label>

                      <label>
                        Description
                        <textarea
                          rows="2"
                          value={
                            editForm.description
                          }
                          onChange={(
                            event
                          ) =>
                            setEditForm(
                              (
                                current
                              ) => ({
                                ...current,
                                description:
                                  event
                                    .target
                                    .value,
                              })
                            )
                          }
                          disabled={
                            isSaving
                          }
                        />
                      </label>

                      <div className="admin-item-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={
                            cancelEditing
                          }
                          disabled={
                            isSaving
                          }
                        >
                          Cancel
                        </button>

                        <button
                          type="submit"
                          disabled={
                            isSaving ||
                            !editForm.name.trim()
                          }
                        >
                          {isSaving
                            ? "Saving..."
                            : "Save Class"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="lexeme-class-content">
                        <div className="lexeme-class-heading">
                          <h3>
                            {
                              lexemeClass.name
                            }
                          </h3>

                          <span className="muted-text">
                            {
                              lexemeClass.lexeme_count
                            }{" "}
                            lexeme
                            {Number(
                              lexemeClass.lexeme_count
                            ) === 1
                              ? ""
                              : "s"}
                          </span>
                        </div>

                        {lexemeClass.description ? (
                          <p>
                            {
                              lexemeClass.description
                            }
                          </p>
                        ) : (
                          <p className="muted-text">
                            No description
                            recorded.
                          </p>
                        )}
                      </div>

                      <div className="admin-item-actions">
                        <button
                          type="button"
                          className="secondary-button compact-button"
                          onClick={() =>
                            beginEditing(
                              lexemeClass
                            )
                          }
                          disabled={
                            isSaving
                          }
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="danger-button compact-button"
                          onClick={() =>
                            handleDelete(
                              lexemeClass
                            )
                          }
                          disabled={
                            isSaving
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            }
          )}
        </div>
      )}
    </section>
  );
}

export default LexemeClassManager;