import { apiFetch } from "../api";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

function InheritedLexiconImport({
  targetStage,
  onImportComplete,
}) {
  const [stages, setStages] = useState([]);
  const [sourceStageId, setSourceStageId] =
    useState("");

  const [includeArchived, setIncludeArchived] =
    useState(false);

  const [preview, setPreview] =
    useState(null);

  const [confirmationCode, setConfirmationCode] =
    useState("");

  const [isLoadingStages, setIsLoadingStages] =
    useState(true);

  const [isPreviewing, setIsPreviewing] =
    useState(false);

  const [isImporting, setIsImporting] =
    useState(false);

  const [error, setError] = useState("");
  const [resultMessage, setResultMessage] =
    useState("");

  useEffect(() => {
    async function loadStages() {
      try {
        setIsLoadingStages(true);
        setError("");

        const response = await apiFetch(
          "/stages?includeArchived=true"
        );

        const responseData =
          await response.json();

        if (!response.ok) {
          throw new Error(
            responseData.error ||
              "Language stages could not be loaded."
          );
        }

        setStages(responseData);
      } catch (loadError) {
        console.error(loadError);
        setError(loadError.message);
      } finally {
        setIsLoadingStages(false);
      }
    }

    loadStages();
  }, []);

  /*
   * Changing import settings invalidates any old preview.
   */
  useEffect(() => {
    setPreview(null);
    setConfirmationCode("");
    setResultMessage("");
  }, [sourceStageId, includeArchived]);

  const availableSourceStages = useMemo(
    () =>
      stages.filter(
        (stage) =>
          Number(stage.id) !==
          Number(targetStage.id)
      ),
    [stages, targetStage.id]
  );

  async function handlePreview() {
    if (!sourceStageId) {
      setError(
        "Select a source language stage first."
      );
      return;
    }

    try {
      setIsPreviewing(true);
      setError("");
      setResultMessage("");

      const query = new URLSearchParams({
        sourceStageId:
          String(sourceStageId),
        includeArchived:
          String(includeArchived),
      });

      const response = await apiFetch(
        `/stages/${targetStage.id}/inheritance-import-preview?${query.toString()}`
      );

      const responseData =
        await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The import could not be previewed."
        );
      }

      setPreview(responseData);
    } catch (previewError) {
      console.error(previewError);
      setError(previewError.message);
      setPreview(null);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleImport() {
    if (!preview) {
      return;
    }

    try {
      setIsImporting(true);
      setError("");
      setResultMessage("");

      const response = await apiFetch(
        `/stages/${targetStage.id}/inheritance-import`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            sourceStageId,
            includeArchived,
            confirmationCode,
          }),
        }
      );

      const responseData =
        await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The inherited lexicon could not be imported."
        );
      }

      let message = responseData.message;

      if (
        responseData.matchedClassCount > 0 ||
        responseData.unmatchedClassCount > 0
      ) {
        message +=
          ` (${responseData.matchedClassCount} class assignments preserved`;

        if (responseData.unmatchedClassCount > 0) {
          message +=
            `, ${responseData.unmatchedClassCount} unclassified`;
        }

        message += ")";
      }

      setResultMessage(message);
      setPreview(null);
      setConfirmationCode("");

      await onImportComplete?.();
    } catch (importError) {
      console.error(importError);
      setError(importError.message);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="lexeme-section inheritance-import-section">
      <h2>Import inherited lexicon</h2>

      <p className="muted-text">
        Copy lexemes from an earlier language stage
        into {targetStage.code}, including glosses,
        forms, part-of-speech data, and notes. Existing
        lexical relationships are not copied.
      </p>

      <div className="form-grid inheritance-import-controls">
        <label>
          Source language stage

          <select
            value={sourceStageId}
            onChange={(event) =>
              setSourceStageId(
                event.target.value
              )
            }
            disabled={
              isLoadingStages ||
              isPreviewing ||
              isImporting
            }
          >
            <option value="">
              Select source stage
            </option>

            {availableSourceStages.map(
              (sourceStage) => (
                <option
                  key={sourceStage.id}
                  value={sourceStage.id}
                >
                  {sourceStage.code}
                  {" — "}
                  {sourceStage.name}
                  {sourceStage.is_archived === 1
                    ? " (archived)"
                    : ""}
                </option>
              )
            )}
          </select>
        </label>

        <label className="filter-checkbox inheritance-archive-checkbox">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) =>
              setIncludeArchived(
                event.target.checked
              )
            }
            disabled={
              isPreviewing ||
              isImporting
            }
          />

          Include archived source lexemes
        </label>
      </div>

      <button
        type="button"
        className="secondary-button"
        onClick={handlePreview}
        disabled={
          !sourceStageId ||
          isPreviewing ||
          isImporting
        }
      >
        {isPreviewing
          ? "Preparing preview..."
          : "Preview Import"}
      </button>

      {error && (
        <p className="error-message form-error">
          {error}
        </p>
      )}

      {resultMessage && (
        <p className="success-message">
          {resultMessage}
        </p>
      )}

      {preview && (
        <div className="inheritance-import-preview">
          <h3>Import preview</h3>

          <p>
            <strong>
              {preview.sourceStage.code}
            </strong>
            {" → "}
            <strong>
              {preview.targetStage.code}
            </strong>
          </p>

          <dl className="metadata-grid">
            <div>
              <dt>Source lexemes</dt>
              <dd>
                {preview.sourceLexemeCount}
              </dd>
            </div>

            <div>
              <dt>Eligible lexemes</dt>
              <dd>
                {preview.eligibleLexemeCount}
              </dd>
            </div>

            <div>
              <dt>Already imported</dt>
              <dd>
                {preview.alreadyImportedCount}
              </dd>
            </div>

            <div>
              <dt>Archived skipped</dt>
              <dd>
                {preview.archivedSkippedCount}
              </dd>
            </div>

            <div>
              <dt>Existing target lexemes</dt>
              <dd>
                {
                  preview.targetExistingLexemeCount
                }
              </dd>
            </div>

            <div>
              <dt>New lexemes to create</dt>
              <dd>
                <strong>
                  {preview.willCreateCount}
                </strong>
              </dd>
            </div>

            <div>
              <dt>Classified source lexemes</dt>

              <dd>
                {preview.classifiedSourceLexemeCount}
              </dd>
            </div>

            <div>
              <dt>Classes preserved</dt>

              <dd>
                {preview.matchedClassLexemeCount}
              </dd>
            </div>

            <div>
              <dt>Class matches missing</dt>

              <dd>
                {preview.unmatchedClassLexemeCount}
              </dd>
            </div>
          </dl>

          {preview.warnings.targetIsNonempty && (
            <p className="warning-message">
              This target stage already contains{" "}
              {
                preview.targetExistingLexemeCount
              }{" "}
              lexeme
              {preview.targetExistingLexemeCount ===
              1
                ? ""
                : "s"}
              . Existing entries will not be changed.
            </p>
          )}

          {preview.warnings.sourceIsArchived && (
            <p className="warning-message">
              The selected source stage is archived.
            </p>
          )}

          {preview.warnings.targetIsArchived && (
            <p className="warning-message">
              The target stage is archived.
            </p>
          )}

          {preview.warnings.sourceIsNotEarlier && (
            <p className="warning-message">
              The selected source stage is not assigned
              to an earlier historical age than the
              target stage. Verify that this direction
              is intentional.
            </p>
          )}

          {preview.unmatchedClassLexemeCount > 0 && (
            <p className="warning-message">
              {preview.unmatchedClassLexemeCount} classified
              source lexeme
              {preview.unmatchedClassLexemeCount === 1
                ? ""
                : "s"}{" "}
              use class
              {preview.unmatchedClassLexemeCount === 1
                ? ""
                : "es"}{" "}
              that do not exist in{" "}
              <strong>{targetStage.code}</strong>.
              Those imported lexemes will remain
              unclassified until matching classes are
              created.
            </p>
          )}

          {preview.willCreateCount > 0 ? (
            <>
              <label className="confirmation-field">
                Type{" "}
                <strong>
                  {targetStage.code}
                </strong>{" "}
                to confirm

                <input
                  type="text"
                  value={confirmationCode}
                  onChange={(event) =>
                    setConfirmationCode(
                      event.target.value
                    )
                  }
                  disabled={isImporting}
                />
              </label>

              <button
                type="button"
                onClick={handleImport}
                disabled={
                  isImporting ||
                  confirmationCode !==
                    targetStage.code
                }
              >
                {isImporting
                  ? "Importing lexicon..."
                  : `Import ${preview.willCreateCount} Lexemes`}
              </button>
            </>
          ) : (
            <p className="muted-text">
              Every eligible source lexeme has already
              been imported into this target stage.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default InheritedLexiconImport;