import {
  useEffect,
  useRef,
} from "react";

import GlossEditor from "./GlossEditor";
import FormEditor from "./FormEditor";

const PARTS_OF_SPEECH = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "determiner",
  "preposition",
  "postposition",
  "conjunction",
  "particle",
  "interjection",
  "affix",
  "root",
];

function EditLexemeForm({
  formData,
  stages,
  lexemeClasses,
  isLoadingLexemeClasses,
  formError,
  isSaving,
  needsReview,
  onReviewStatusChange,
  isSavingReview,
  reviewError,
  onFieldChange,
  onGlossesChange,
  onFormsChange,
  onShowFormsChange,
  onSubmit,
  onCancel,
  onArchive,
  isArchived,
  onDelete,
  isDeleting,
  deleteError,
  children,
}) {
  const lemmaInputRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    lemmaInputRef.current?.focus();
    lemmaInputRef.current?.select();
  }, []);

  useEffect(() => {
    function handleShortcut(event) {
      const key = event.key.toLowerCase();

      // Ctrl + Enter: save the lexeme
      if (
        event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        event.key === "Enter"
      ) {
        event.preventDefault();

        if (!isSaving && !isDeleting) {
          formRef.current?.requestSubmit();
        }

        return;
      }

      // Alt + Shift + G: add a gloss
      if (
        event.altKey &&
        event.shiftKey &&
        !event.ctrlKey &&
        key === "g"
      ) {
        event.preventDefault();

        formRef.current
          ?.querySelector(
            '[data-shortcut="add-gloss"]'
          )
          ?.click();

        return;
      }

      // Alt + Shift + F: add a form
      if (
        event.altKey &&
        event.shiftKey &&
        !event.ctrlKey &&
        key === "f"
      ) {
        event.preventDefault();

        /*
        * If forms are hidden, first enable the section.
        * The parent callback creates the initial row.
        */
        if (!formData.showForms) {
          onShowFormsChange(true);
          return;
        }

        formRef.current
          ?.querySelector(
            '[data-shortcut="add-form"]'
          )
          ?.click();

        return;
      }

      // Alt + Shift + V: toggle review status
      if (
        event.altKey &&
        event.shiftKey &&
        !event.ctrlKey &&
        key === "v"
      ) {
        event.preventDefault();

        if (
          !isSaving &&
          !isDeleting &&
          !isSavingReview
        ) {
          onReviewStatusChange();
        }

        return;
      }

      // Alt + Shift + R: activate relationship creation
      if (
        event.altKey &&
        event.shiftKey &&
        !event.ctrlKey &&
        key === "r"
      ) {
        event.preventDefault();

        formRef.current
          ?.querySelector(
            '[data-shortcut="add-edit-relationship"]'
          )
          ?.click();
      }
    }

    window.addEventListener(
      "keydown",
      handleShortcut
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleShortcut
      );
    };
  }, [
    isSaving,
    isDeleting,
    isSavingReview,
    formData.showForms,
    onShowFormsChange,
    onReviewStatusChange,
  ]);

  return (
    <section className="form-panel">
      <div className="form-heading">
        <div>
          <h2>Edit Lexeme</h2>

          <p>
            Update the entry, ordered senses, stage,
            and historical relationships.
          </p>

          <span
            className={
              needsReview
                ? "review-badge needs-review-badge"
                : "review-badge reviewed-badge"
            }
          >
            {needsReview
              ? "Needs review"
              : "Reviewed"}
          </span>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onReviewStatusChange}
            disabled={
              isSaving ||
              isDeleting ||
              isSavingReview
            }
          >
            {isSavingReview
              ? "Saving..."
              : needsReview
                ? "Mark Reviewed"
                : "Mark Needs Review"}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={onCancel}
            disabled={
              isSaving ||
              isDeleting ||
              isSavingReview
            }
          >
            Close
          </button>
        </div>
      </div>

      <div className="shortcut-hints">
        <span>
          <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd>
          <span>
            {needsReview
              ? "Mark reviewed"
              : "Mark needs review"}
          </span>
        </span>
        <span>
          <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>G</kbd>
          <span>Add gloss</span>
        </span>

        <span>
          <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd>
          <span>Add form</span>
        </span>

        <span>
          <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd>
          <span>Add relationship</span>
        </span>

        <span>
          <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
          <span>Save changes</span>
        </span>
      </div>

      <form
        ref={formRef}
        onSubmit={onSubmit}
      >
        <div className="form-grid">
          <label>
            Lemma
            <input
              ref={lemmaInputRef}
              type="text"
              name="lemma"
              value={formData.lemma}
              onChange={onFieldChange}
              required
            />
          </label>

          <label>
            Language stage
            <select
              name="languageStageId"
              value={formData.languageStageId}
              onChange={onFieldChange}
              required
            >
              <option value="">
                Select language stage
              </option>

              {stages.map((stage) => (
                <option
                  key={stage.id}
                  value={stage.id}
                >
                  {stage.code} — {stage.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Part of speech
            <select
              name="partOfSpeech"
              value={formData.partOfSpeech}
              onChange={onFieldChange}
            >
              <option value="">Unspecified</option>

              {PARTS_OF_SPEECH.map(
                (partOfSpeech) => (
                  <option
                    key={partOfSpeech}
                    value={partOfSpeech}
                  >
                    {partOfSpeech}
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            Lexeme class
            <select
              name="lexemeClassId"
              value={formData.lexemeClassId}
              onChange={onFieldChange}
              disabled={
                !formData.languageStageId ||
                isLoadingLexemeClasses
              }
            >
              <option value="">
                {!formData.languageStageId
                  ? "Select a language stage first"
                  : isLoadingLexemeClasses
                    ? "Loading classes..."
                    : "No class"}
              </option>

              {lexemeClasses.map(
                (lexemeClass) => (
                  <option
                    key={lexemeClass.id}
                    value={lexemeClass.id}
                  >
                    {lexemeClass.name}
                  </option>
                )
              )}
            </select>
          </label>
        </div>

        <GlossEditor
          glosses={formData.glosses}
          onChange={onGlossesChange}
        />

        <section className="form-editor">
          <label className="forms-toggle">
            <input
              type="checkbox"
              checked={formData.showForms}
              onChange={(event) =>
                onShowFormsChange(event.target.checked)
              }
            />

            <span>This lexeme has named forms</span>
          </label>

          {formData.showForms && (
            <FormEditor
              forms={formData.forms}
              onChange={onFormsChange}
              embedded
            />
          )}
        </section>

        {children}

        <label className="notes-field">
          Lexeme notes
          <textarea
            name="notes"
            value={formData.notes}
            onChange={onFieldChange}
            rows="6"
          />
        </label>

        {reviewError && (
          <p className="error-message form-error">
            {reviewError}
          </p>
        )}

        {formError && (
          <p className="error-message form-error">
            {formError}
          </p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onCancel}
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

        <section className="danger-zone">
          <div>
            <h2>Entry Management</h2>

            <p>
              Archive the lexeme to hide it from normal
              searches, or permanently delete it.
            </p>
          </div>

          {deleteError && (
            <p className="error-message">
              {deleteError}
            </p>
          )}

          <div className="danger-zone-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onArchive}
              disabled={isSaving || isDeleting}
            >
              {isArchived
                ? "Restore Lexeme"
                : "Archive Lexeme"}
            </button>

            <button
              type="button"
              className="danger-button"
              onClick={onDelete}
              disabled={isSaving || isDeleting}
            >
              {isDeleting
                ? "Deleting..."
                : "Delete Lexeme Permanently"}
            </button>
          </div>
        </section>
      </form>
    </section>
  );
}

export default EditLexemeForm;