import { useEffect, useState } from "react";
import {
  Link,
  useParams,
} from "react-router";

import StageRelationshipList from "../components/StageRelationshipList";
import GrammarDocument from "../components/GrammarDocument";

import LexemeClassManager
  from "../components/LexemeClassManager";

import InheritedLexiconImport
  from "../components/InheritedLexiconImport";

const API_BASE_URL = "http://localhost:3001/api";

function LanguageStagePage() {
  const { id } = useParams();

  const [stage, setStage] = useState(null);
  const [showArchivedLexemes, setShowArchivedLexemes] =
    useState(false);

  const [isLoading, setIsLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState("");

  const [
    showLexiconDeletion,
    setShowLexiconDeletion,
  ] = useState(false);

  const [
    lexiconDeletionPreview,
    setLexiconDeletionPreview,
  ] = useState(null);

  const [
    isLoadingDeletionPreview,
    setIsLoadingDeletionPreview,
  ] = useState(false);

  const [
    deletionConfirmationCode,
    setDeletionConfirmationCode,
  ] = useState("");

  const [
    lexiconDeletionError,
    setLexiconDeletionError,
  ] = useState("");

  const [
    isDeletingLexicon,
    setIsDeletingLexicon,
  ] = useState(false);

  const [
    lexiconDeletionMessage,
    setLexiconDeletionMessage,
  ] = useState("");

  async function loadStage() {
    try {
      setIsLoading(true);
      setLoadError("");

      const response = await fetch(
        `${API_BASE_URL}/stages/${id}/profile`
      );

      const responseData =
        await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The language stage could not be loaded."
        );
      }

      setStage(responseData);
    } catch (error) {
      console.error(error);
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function openLexiconDeletion() {
    if (isDeletingLexicon) {
      return;
    }

    setShowLexiconDeletion(true);
    setDeletionConfirmationCode("");
    setLexiconDeletionError("");
    setLexiconDeletionMessage("");
    setLexiconDeletionPreview(null);

    await loadLexiconDeletionPreview();
  }

  function closeLexiconDeletion() {
    if (isDeletingLexicon) {
      return;
    }

    setShowLexiconDeletion(false);
    setLexiconDeletionPreview(null);
    setDeletionConfirmationCode("");
    setLexiconDeletionError("");
  }

  async function loadLexiconDeletionPreview() {
    try {
      setIsLoadingDeletionPreview(true);
      setLexiconDeletionError("");
      setLexiconDeletionMessage("");

      const response = await fetch(
        `${API_BASE_URL}/stages/${id}/lexicon-deletion-preview`
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The lexicon deletion preview could not be loaded."
        );
      }

      setLexiconDeletionPreview(responseData);
    } catch (error) {
      console.error(error);
      setLexiconDeletionError(error.message);
    } finally {
      setIsLoadingDeletionPreview(false);
    }
  }

  async function handleDeleteStageLexicon(event) {
    event.preventDefault();

    if (!stage) {
      return;
    }

    setLexiconDeletionError("");
    setLexiconDeletionMessage("");

    if (
      deletionConfirmationCode.trim() !==
      stage.code
    ) {
      setLexiconDeletionError(
        `Type ${stage.code} exactly to confirm deletion.`
      );

      return;
    }

    try {
      setIsDeletingLexicon(true);

      const response = await fetch(
        `${API_BASE_URL}/stages/${id}/lexicon`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            confirmationCode:
              deletionConfirmationCode.trim(),
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The stage lexicon could not be deleted."
        );
      }

      setLexiconDeletionMessage(
        responseData.message
      );

      setDeletionConfirmationCode("");
      setLexiconDeletionPreview(null);
      setShowLexiconDeletion(false);
      setShowArchivedLexemes(false);

      await loadStage();
    } catch (error) {
      console.error(error);
      setLexiconDeletionError(error.message);
    } finally {
      setIsDeletingLexicon(false);
    }
  }

  useEffect(() => {
    setShowLexiconDeletion(false);
    setLexiconDeletionPreview(null);
    setDeletionConfirmationCode("");
    setLexiconDeletionError("");
    setLexiconDeletionMessage("");

    loadStage();
  }, [id]);

  useEffect(() => {
    if (!stage) {
      document.title = "Lexicon";
      return;
    }

    document.title = `Lexicon - ${
      stage.name || "Unnamed stage"
    }`;
  }, [stage]);

  if (isLoading) {
    return (
      <main className="app">
        <p className="status-message">
          Loading language stage...
        </p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="app">
        <nav className="breadcrumb">
          <Link to="/">
            ← Back to lexicon
          </Link>
        </nav>

        <p className="error-message">
          {loadError}
        </p>
      </main>
    );
  }

  if (!stage) {
    return null;
  }

  const visibleLexemes =
    showArchivedLexemes
      ? stage.lexemes
      : stage.lexemes.filter(
          (lexeme) =>
            lexeme.is_archived !== 1
        );

  return (
    <main className="app">
      <nav className="breadcrumb">
        <Link to="/">
          ← Back to lexicon
        </Link>
      </nav>

      <article className="lexeme-page stage-profile-page">
        <header className="lexeme-header">
          <div>
            <p className="language-label">
              Language stage
            </p>

            <h1>{stage.code}</h1>

            <p className="part-of-speech">
              {stage.name || "Unnamed stage"}
            </p>

            {stage.is_archived === 1 && (
              <span className="archive-badge">
                Archived
              </span>
            )}
          </div>

          <Link to="/admin">
            Manage in Admin
          </Link>
        </header>

        <section className="lexeme-section">
          <h2>Classification</h2>

          <dl className="metadata-grid">
            <div>
              <dt>Stage code</dt>
              <dd>{stage.code}</dd>
            </div>

            <div>
              <dt>Lineage</dt>
              <dd>{stage.lineage_code}</dd>
            </div>

            <div>
              <dt>Historical age</dt>
              <dd>{stage.age_code}</dd>
            </div>

            <div>
              <dt>Status</dt>
              <dd>
                {stage.is_archived === 1
                  ? "Archived"
                  : "Active"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="lexeme-section">
          <h2>Lexicon inventory</h2>

          <dl className="metadata-grid">
            <div>
              <dt>Total lexemes</dt>
              <dd>{stage.lexeme_count}</dd>
            </div>

            <div>
              <dt>Active lexemes</dt>
              <dd>
                {stage.active_lexeme_count}
              </dd>
            </div>

            <div>
              <dt>Archived lexemes</dt>
              <dd>
                {stage.archived_lexeme_count}
              </dd>
            </div>
          </dl>
        </section>

        <LexemeClassManager
          stageId={stage.id}
          stageCode={stage.code}
        />

        <InheritedLexiconImport
          targetStage={stage}
          onImportComplete={loadStage}
        />

        <section className="lexeme-section">
          <h2>Historical relationships</h2>

          <div className="relationship-display-grid">
            <StageRelationshipList
              title="Incoming"
              emptyMessage="No earlier stages or external influences are recorded."
              relations={
                stage.incoming_relations
              }
              direction="incoming"
            />

            <StageRelationshipList
              title="Outgoing"
              emptyMessage="No descendants or outward influences are recorded."
              relations={
                stage.outgoing_relations
              }
              direction="outgoing"
            />
          </div>
        </section>

        <section className="lexeme-section">
            <h2>Grammar document</h2>

            {stage.grammar_path ? (
                <GrammarDocument
                stageId={stage.id}
                grammarPath={stage.grammar_path}
                />
            ) : (
                <p className="muted-text">
                No grammar document has been assigned
                to this stage.
                </p>
            )}
        </section>

        <section className="lexeme-section">
          <h2>Stage notes</h2>

          {stage.notes ? (
            <p className="notes-display">
              {stage.notes}
            </p>
          ) : (
            <p className="muted-text">
              No stage notes recorded.
            </p>
          )}
        </section>

        <section className="lexeme-section">
          <div className="section-heading-row">
            <div>
              <h2>Lexemes</h2>

              <p className="muted-text">
                Entries belonging directly to this
                historical stage.
              </p>
            </div>

            {Number(
              stage.archived_lexeme_count
            ) > 0 && (
              <label className="filter-checkbox stage-profile-checkbox">
                <input
                  type="checkbox"
                  checked={
                    showArchivedLexemes
                  }
                  onChange={(event) =>
                    setShowArchivedLexemes(
                      event.target.checked
                    )
                  }
                />

                Show archived
              </label>
            )}
          </div>

          {visibleLexemes.length === 0 ? (
            <p className="muted-text">
              No lexemes are currently recorded for
              this stage.
            </p>
          ) : (
            <div className="stage-lexeme-list">
              {visibleLexemes.map((lexeme) => (
                <article
                  className={`stage-lexeme-item ${
                    lexeme.is_archived === 1
                      ? "archived-relation-item"
                      : ""
                  }`}
                  key={lexeme.id}
                >
                  <div>
                    <div className="stage-lexeme-heading">
                      <Link
                        to={`/lexemes/${lexeme.id}`}
                      >
                        {lexeme.lemma}
                      </Link>

                      {lexeme.is_archived === 1 && (
                        <span className="archive-badge">
                          Archived
                        </span>
                      )}

                      {lexeme.needs_review === 1 && (
                        <span className="review-badge needs-review-badge">
                          Needs review
                        </span>
                      )}
                    </div>

                    <p className="relationship-metadata">
                      {lexeme.glosses ||
                        "No glosses"}
                    </p>
                  </div>

                  <span className="muted-text">
                    {lexeme.part_of_speech ||
                      "Unspecified"}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="lexeme-section danger-zone">
          <div className="section-heading-row">
            <div>
              <h2>Danger zone</h2>

              <p className="muted-text">
                Permanently delete every lexeme belonging
                to this language stage. The stage itself,
                its grammar document, notes, and historical
                stage relationships will remain.
              </p>
            </div>

            {!showLexiconDeletion && (
              <button
                type="button"
                className="danger-button"
                onClick={openLexiconDeletion}
                disabled={
                  isLoadingDeletionPreview ||
                  isDeletingLexicon ||
                  Number(stage.lexeme_count) === 0
                }
              >
                {Number(stage.lexeme_count) === 0
                  ? "Lexicon is empty"
                  : "Delete Stage Lexicon"}
              </button>
            )}
          </div>

          {lexiconDeletionMessage && (
            <p className="success-message">
              {lexiconDeletionMessage}
            </p>
          )}

          {showLexiconDeletion && (
            <div className="danger-zone-panel">
              {isLoadingDeletionPreview && (
                <p className="status-message">
                  Loading deletion preview...
                </p>
              )}

              {lexiconDeletionError && (
                <p className="error-message">
                  {lexiconDeletionError}
                </p>
              )}

              {!isLoadingDeletionPreview &&
                lexiconDeletionPreview && (
                  <form
                    onSubmit={
                      handleDeleteStageLexicon
                    }
                  >
                    <h3>
                      Delete all lexemes from{" "}
                      {stage.code}?
                    </h3>

                    <p>
                      This will permanently delete:
                    </p>

                    <dl className="metadata-grid">
                      <div>
                        <dt>Lexemes</dt>
                        <dd>
                          {
                            lexiconDeletionPreview.lexemeCount
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>Active lexemes</dt>
                        <dd>
                          {
                            lexiconDeletionPreview.activeLexemeCount
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>Archived lexemes</dt>
                        <dd>
                          {
                            lexiconDeletionPreview.archivedLexemeCount
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>Needs review</dt>
                        <dd>
                          {
                            lexiconDeletionPreview.needsReviewLexemeCount
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>Glosses</dt>
                        <dd>
                          {
                            lexiconDeletionPreview.glossCount
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>Forms</dt>
                        <dd>
                          {
                            lexiconDeletionPreview.formCount
                          }
                        </dd>
                      </div>

                      <div>
                        <dt>Lexical relationships</dt>
                        <dd>
                          {
                            lexiconDeletionPreview.relationshipCount
                          }
                        </dd>
                      </div>
                    </dl>

                    <p className="warning-message">
                      Lexical relationships connecting these
                      entries to lexemes in other stages will
                      also be deleted.
                    </p>

                    <label>
                      Type{" "}
                      <strong>{stage.code}</strong>{" "}
                      to confirm
                      <input
                        type="text"
                        value={
                          deletionConfirmationCode
                        }
                        onChange={(event) =>
                          setDeletionConfirmationCode(
                            event.target.value
                          )
                        }
                        disabled={isDeletingLexicon}
                        autoComplete="off"
                      />
                    </label>

                    <div className="form-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={
                          closeLexiconDeletion
                        }
                        disabled={isDeletingLexicon}
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        className="danger-button"
                        disabled={
                          isDeletingLexicon ||
                          deletionConfirmationCode.trim() !==
                            stage.code
                        }
                      >
                        {isDeletingLexicon
                          ? "Deleting..."
                          : "Permanently Delete Lexicon"}
                      </button>
                    </div>
                  </form>
                )}
            </div>
          )}
        </section>
      </article>
    </main>
  );
}

export default LanguageStagePage;