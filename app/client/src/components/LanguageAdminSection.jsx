import { useEffect, useState } from "react";

const API_BASE_URL = "http://localhost:3001/api";

const EMPTY_LANGUAGE_FORM = {
  code: "",
  name: "",
};

function LanguageAdminSection() {
  const [languages, setLanguages] = useState([]);
  const [newLanguage, setNewLanguage] = useState(
    EMPTY_LANGUAGE_FORM
  );

  const [editingLanguageId, setEditingLanguageId] =
    useState(null);

  const [editForm, setEditForm] = useState(
    EMPTY_LANGUAGE_FORM
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingLanguageId, setDeletingLanguageId] =
    useState(null);

  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");

  async function loadLanguages() {
    try {
      setIsLoading(true);
      setPageError("");

      const response = await fetch(
        `${API_BASE_URL}/languages`
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "Languages could not be loaded."
        );
      }

      setLanguages(responseData);
    } catch (error) {
      console.error(error);
      setPageError(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadLanguages();
  }, []);

  function handleNewLanguageChange(event) {
    const { name, value } = event.target;

    setNewLanguage((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function beginEditing(language) {
    setEditingLanguageId(language.id);

    setEditForm({
      code: language.code,
      name: language.name,
    });

    setFormError("");
  }

  function cancelEditing() {
    if (isSaving) {
      return;
    }

    setEditingLanguageId(null);
    setEditForm(EMPTY_LANGUAGE_FORM);
    setFormError("");
  }

  function handleEditChange(event) {
    const { name, value } = event.target;

    setEditForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleCreateLanguage(event) {
    event.preventDefault();
    setFormError("");

    if (!newLanguage.code.trim()) {
      setFormError("Language code is required.");
      return;
    }

    if (!newLanguage.name.trim()) {
      setFormError("Language name is required.");
      return;
    }

    try {
      setIsSaving(true);

      const response = await fetch(
        `${API_BASE_URL}/languages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: newLanguage.code.trim(),
            name: newLanguage.name.trim(),
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The language could not be created."
        );
      }

      setNewLanguage(EMPTY_LANGUAGE_FORM);
      await loadLanguages();
    } catch (error) {
      console.error(error);
      setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateLanguage(event) {
    event.preventDefault();
    setFormError("");

    if (!editForm.code.trim()) {
      setFormError("Language code is required.");
      return;
    }

    if (!editForm.name.trim()) {
      setFormError("Language name is required.");
      return;
    }

    try {
      setIsSaving(true);

      const response = await fetch(
        `${API_BASE_URL}/languages/${editingLanguageId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: editForm.code.trim(),
            name: editForm.name.trim(),
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The language could not be updated."
        );
      }

      setEditingLanguageId(null);
      setEditForm(EMPTY_LANGUAGE_FORM);

      await loadLanguages();
    } catch (error) {
      console.error(error);
      setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteLanguage(language) {
    const confirmed = window.confirm(
      `Delete the language "${language.code}"?\n\n` +
        "Deletion will be blocked if lexemes still use it."
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingLanguageId(language.id);
      setPageError("");

      const response = await fetch(
        `${API_BASE_URL}/languages/${language.id}`,
        {
          method: "DELETE",
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The language could not be deleted."
        );
      }

      if (editingLanguageId === language.id) {
        cancelEditing();
      }

      await loadLanguages();
    } catch (error) {
      console.error(error);
      setPageError(error.message);
    } finally {
      setDeletingLanguageId(null);
    }
  }

  return (
    <section className="admin-section">
      <header className="admin-section-header">
        <div>
          <h2>Languages</h2>

          <p>
            Create and manage languages available in the
            lexeme editor.
          </p>
        </div>
      </header>

      {pageError && (
        <p className="error-message">
          {pageError}
        </p>
      )}

      <form
        className="admin-create-form"
        onSubmit={handleCreateLanguage}
      >
        <label>
          Language code
          <input
            type="text"
            name="code"
            value={newLanguage.code}
            onChange={handleNewLanguageChange}
            placeholder="C1-L1-A0"
          />
        </label>

        <label>
          Display name
          <input
            type="text"
            name="name"
            value={newLanguage.name}
            onChange={handleNewLanguageChange}
            placeholder="C1 Language, Lineage 1, Age 0"
          />
        </label>

        <button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Add Language"}
        </button>
      </form>

      {formError && (
        <p className="error-message form-error">
          {formError}
        </p>
      )}

      {isLoading ? (
        <p className="status-message">
          Loading languages...
        </p>
      ) : (
        <div className="admin-list">
          {languages.length === 0 ? (
            <p className="muted-text">
              No languages have been created.
            </p>
          ) : (
            languages.map((language) => (
              <article
                className="admin-list-item"
                key={language.id}
              >
                {editingLanguageId === language.id ? (
                  <form
                    className="admin-edit-form"
                    onSubmit={handleUpdateLanguage}
                  >
                    <label>
                      Language code
                      <input
                        type="text"
                        name="code"
                        value={editForm.code}
                        onChange={handleEditChange}
                      />
                    </label>

                    <label>
                      Display name
                      <input
                        type="text"
                        name="name"
                        value={editForm.name}
                        onChange={handleEditChange}
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
                    <div className="admin-item-information">
                      <strong>{language.code}</strong>
                      <span>{language.name}</span>
                    </div>

                    <div className="admin-item-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          beginEditing(language)
                        }
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="danger-button"
                        onClick={() =>
                          handleDeleteLanguage(language)
                        }
                        disabled={
                          deletingLanguageId === language.id
                        }
                      >
                        {deletingLanguageId === language.id
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

export default LanguageAdminSection;