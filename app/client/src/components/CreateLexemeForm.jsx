import GlossEditor from "./GlossEditor";
import NewLexemeRelationshipEditor from "./NewLexemeRelationshipEditor";
import { useRef, useEffect } from "react";
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

function CreateLexemeForm({
  formData,
  stages,
  lexemeClasses,
  isLoadingLexemeClasses,
  lexemes,
  relationTypes,
  relationshipSearchFilters,
  formError,
  isSaving,
  onFieldChange,
  onGlossesChange,
  onFormsChange,
  onShowFormsChange,
  onRelationshipsChange,
  onInheritanceSourceSelected,
  onSubmit,
  onClose,
  lastCreatedLemma,
}) {
    const lemmaInputRef = useRef(null);
    const formRef = useRef(null);

    useEffect(() => {
      if (!formData.lemma) {
        lemmaInputRef.current?.focus();
      }
    }, [formData.lemma]);

    useEffect(() => {
      function handleShortcut(event) {
        const key = event.key.toLowerCase();

        // Ctrl + Enter: submit/create the lexeme
        if (
          event.ctrlKey &&
          !event.altKey &&
          !event.shiftKey &&
          event.key === "Enter"
        ) {
          event.preventDefault();

          if (!isSaving) {
            formRef.current?.requestSubmit();
          }

          return;
        }

        // Alt + Shift + G: add another gloss
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

        // Alt + Shift + R: add another relationship
        if (
          event.altKey &&
          event.shiftKey &&
          !event.ctrlKey &&
          key === "r"
        ) {
          event.preventDefault();

          formRef.current
            ?.querySelector(
              '[data-shortcut="add-relationship"]'
            )
            ?.click();
        }
      }

      window.addEventListener("keydown", handleShortcut);

      return () => {
        window.removeEventListener(
          "keydown",
          handleShortcut
        );
      };
    }, [isSaving]);

  return (
    <section className="form-panel">
      <div className="form-heading">
        <div>
          <h2>New Lexeme</h2>

          <p>
            Create a lexical entry in one historical
            language stage.
          </p>

          {lastCreatedLemma && (
            <p className="migration-marker">
              Last migrated:
              <strong>{lastCreatedLemma}</strong>
            </p>
          )}
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
          disabled={isSaving}
        >
          Close
        </button>
      </div>

      <div className="shortcut-hints">
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
          <span>Create lexeme</span>
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

        <NewLexemeRelationshipEditor
          relationships={formData.relationships}
          onChange={onRelationshipsChange}
          onInheritanceSourceSelected={
            onInheritanceSourceSelected
          }
          lexemes={lexemes}
          relationTypes={relationTypes}
          searchFilters={
            relationshipSearchFilters
          }
        />

        <label className="notes-field">
          Lexeme notes
          <textarea
            name="notes"
            value={formData.notes}
            onChange={onFieldChange}
            rows="6"
          />
        </label>

        {formError && (
          <p className="error-message form-error">
            {formError}
          </p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSaving}
          >
            {isSaving
              ? "Creating..."
              : "Create Lexeme"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default CreateLexemeForm;