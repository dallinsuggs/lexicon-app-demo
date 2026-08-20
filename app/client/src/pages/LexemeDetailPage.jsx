import { apiFetch } from "../api";
import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";

import EditLexemeForm from "../components/EditLexemeForm";
import LexemeRelationshipEditor from "../components/LexemeRelationshipEditor";

function createGlossFormRows(glosses) {
  return glosses.map((gloss) => ({
    clientId: crypto.randomUUID(),
    gloss: gloss.gloss,
    notes: gloss.notes || "",
  }));
}

function createFormRows(forms) {
  return forms.map((form) => ({
    clientId: crypto.randomUUID(),
    formLabel: form.form_label,
    form: form.form,
    notes: form.notes || "",
  }));
}

function LexemeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] =
    useSearchParams();

  const editWasOpenedFromList =
    searchParams.get("from") === "list";

  const [lexeme, setLexeme] = useState(null);
  const [stages, setStages] = useState([]);
  const [relationTypes, setRelationTypes] =
    useState([]);

  const [
    editLexemeClasses,
    setEditLexemeClasses,
  ] = useState([]);

  const [
    isLoadingEditClasses,
    setIsLoadingEditClasses,
  ] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [isEditing, setIsEditing] = useState(false);

  const [editForm, setEditForm] = useState({
    lemma: "",
    languageStageId: "",
    partOfSpeech: "",
    lexemeClassId: "",
    notes: "",
    glosses: [],
    showForms: false,
    forms: [],
  });

  const [editError, setEditError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [reviewError, setReviewError] =
    useState("");

  const [isSavingReview, setIsSavingReview] =
    useState(false);

  const [relationshipError, setRelationshipError] =
    useState("");

  const [
    isSavingRelationship,
    setIsSavingRelationship,
  ] = useState(false);

  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] =
    useState(false);

  async function loadPageData() {
    try {
      setIsLoading(true);
      setLoadError("");

      const [
        lexemeResponse,
        stagesResponse,
        relationTypesResponse,
      ] = await Promise.all([
        apiFetch(`/lexemes/${id}`),
        apiFetch("/stages"),
        apiFetch(
          "/lexeme-relation-types"
        ),
      ]);

      const [
        lexemeData,
        stagesData,
        relationTypesData,
      ] = await Promise.all([
        lexemeResponse.json(),
        stagesResponse.json(),
        relationTypesResponse.json(),
      ]);

      if (!lexemeResponse.ok) {
        throw new Error(
          lexemeData.error ||
            "The lexeme could not be loaded."
        );
      }

      if (!stagesResponse.ok) {
        throw new Error(
          stagesData.error ||
            "Language stages could not be loaded."
        );
      }

      if (!relationTypesResponse.ok) {
        throw new Error(
          relationTypesData.error ||
            "Relationship types could not be loaded."
        );
      }

      setLexeme(lexemeData);
      setStages(stagesData);
      setRelationTypes(relationTypesData);
    } catch (error) {
      console.error(error);
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (
      !lexeme ||
      isEditing ||
      searchParams.get("edit") !== "true"
    ) {
      return;
    }

    beginEditing();

    /*
    * Remove edit=true after opening the form.
    *
    * Otherwise saving and reloading the lexeme data
    * could immediately reopen edit mode.
    */
    const updatedSearchParams =
      new URLSearchParams(searchParams);

    updatedSearchParams.delete("edit");

    setSearchParams(
      updatedSearchParams,
      {
        replace: true,
      }
    );
  }, [
    lexeme,
    isEditing,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    loadPageData();
  }, [id]);

  useEffect(() => {
    if (!lexeme) {
      document.title = "Lexicon";
      return;
    }

    document.title = `Lexicon - ${lexeme.lemma}`;
  }, [lexeme]);

  useEffect(() => {
    if (!isEditing) {
      setEditLexemeClasses([]);
      return;
    }

    const stageId =
      editForm.languageStageId;

    if (!stageId) {
      setEditLexemeClasses([]);
      return;
    }

    let wasCancelled = false;

    async function loadEditLexemeClasses() {
      try {
        setIsLoadingEditClasses(true);
        setEditError("");

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

        if (!wasCancelled) {
          setEditLexemeClasses(
            responseData.classes
          );
        }
      } catch (error) {
        console.error(error);

        if (!wasCancelled) {
          setEditLexemeClasses([]);
          setEditError(error.message);
        }
      } finally {
        if (!wasCancelled) {
          setIsLoadingEditClasses(false);
        }
      }
    }

    loadEditLexemeClasses();

    return () => {
      wasCancelled = true;
    };
  }, [
    isEditing,
    editForm.languageStageId,
  ]);

  function beginEditing() {
    setEditForm({
      lemma: lexeme.lemma,
      languageStageId: String(
        lexeme.language_stage_id
      ),
      partOfSpeech:
        lexeme.part_of_speech || "",

      lexemeClassId:
        lexeme.lexeme_class_id
          ? String(lexeme.lexeme_class_id)
          : "",

      notes: lexeme.notes || "",

      glosses: createGlossFormRows(
        lexeme.glosses
      ),

      showForms:
        (lexeme.forms || []).length > 0,

      forms: createFormRows(
        lexeme.forms || []
      ),
    });

    setEditError("");
    setDeleteError("");
    setRelationshipError("");
    setIsEditing(true);
    setReviewError("");
  }

  function cancelEditing() {
    if (
      isSaving ||
      isSavingReview ||
      isSavingRelationship ||
      isDeleting
    ) {
      return;
    }

    setEditError("");
    setDeleteError("");
    setRelationshipError("");
    setReviewError("");

    if (editWasOpenedFromList) {
      navigate("/");
      return;
    }

    setIsEditing(false);
  }

  function handleEditFieldChange(event) {
    const { name, value } = event.target;

    setEditForm((current) => {
      if (name === "languageStageId") {
        return {
          ...current,
          languageStageId: value,
          lexemeClassId: "",
        };
      }

      return {
        ...current,
        [name]: value,
      };
    });
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    setEditError("");

    if (!editForm.lemma.trim()) {
      setEditError("Lemma is required.");
      return;
    }

    if (!editForm.languageStageId) {
      setEditError(
        "A language stage is required."
      );
      return;
    }

    const cleanedGlosses = editForm.glosses
      .map((gloss) => ({
        gloss: gloss.gloss.trim(),
        notes: gloss.notes.trim(),
      }))
      .filter((gloss) => gloss.gloss);

    if (cleanedGlosses.length === 0) {
      setEditError(
        "At least one gloss is required."
      );
      return;
    }

    const cleanedForms = editForm.forms
      .map((form) => ({
        formLabel: form.formLabel.trim(),
        form: form.form.trim(),
        notes: form.notes.trim(),
      }))
      .filter(
        (form) =>
          form.formLabel ||
          form.form ||
          form.notes
      );

    for (const form of cleanedForms) {
      if (!form.formLabel || !form.form) {
        setEditError(
          "Every form requires both a form label and a form."
        );
        return;
      }
    }

    try {
      setIsSaving(true);

      const response = await apiFetch(
        `/lexemes/${id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lemma: editForm.lemma.trim(),
            languageStageId: Number(
              editForm.languageStageId
            ),
            partOfSpeech:
              editForm.partOfSpeech,
            notes: editForm.notes.trim(),
            lexemeClassId:
              editForm.lexemeClassId
                ? Number(editForm.lexemeClassId)
                : null,
            glosses: cleanedGlosses,
            forms: cleanedForms,
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The lexeme could not be updated."
        );
      }

      if (editWasOpenedFromList) {
        navigate("/");
        return;
      }

      await loadPageData();
      setIsEditing(false);
    } catch (error) {
      console.error(error);
      setEditError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateRelationship(payload) {
    setRelationshipError("");

    try {
      setIsSavingRelationship(true);

      const response = await apiFetch(
        "/lexeme-relations",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The relationship could not be created."
        );
      }

      await loadPageData();
      return true;
    } catch (error) {
      console.error(error);
      setRelationshipError(error.message);
      return false;
    } finally {
      setIsSavingRelationship(false);
    }
  }

  async function handleUpdateRelationship(
    relationId,
    payload
  ) {
    setRelationshipError("");

    try {
      setIsSavingRelationship(true);

      const response = await apiFetch(
        `/lexeme-relations/${relationId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The relationship could not be updated."
        );
      }

      await loadPageData();
      return true;
    } catch (error) {
      console.error(error);
      setRelationshipError(error.message);
      return false;
    } finally {
      setIsSavingRelationship(false);
    }
  }

  async function handleDeleteRelationship(
    relationId,
    relatedLemma
  ) {
    const confirmed = window.confirm(
      `Remove the relationship involving "${relatedLemma}"?`
    );

    if (!confirmed) {
      return;
    }

    setRelationshipError("");

    try {
      setIsSavingRelationship(true);

      const response = await apiFetch(
        `/lexeme-relations/${relationId}`,
        {
          method: "DELETE",
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The relationship could not be deleted."
        );
      }

      await loadPageData();
    } catch (error) {
      console.error(error);
      setRelationshipError(error.message);
    } finally {
      setIsSavingRelationship(false);
    }
  }

  async function handleReviewStatus() {
  const shouldNeedReview =
    lexeme.needs_review !== 1;

  try {
    setIsSavingReview(true);
    setReviewError("");

    const response = await apiFetch(
      `/lexemes/${lexeme.id}/review-status`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          needsReview: shouldNeedReview,
        }),
      }
    );

    const responseData =
      await response.json();

    if (!response.ok) {
      throw new Error(
        responseData.error ||
          "The review status could not be changed."
      );
    }

    await loadPageData();
  } catch (error) {
    console.error(error);
    setReviewError(error.message);
  } finally {
    setIsSavingReview(false);
  }
}

  async function handleArchive() {
    const shouldArchive =
      lexeme.is_archived !== 1;

    const confirmed = window.confirm(
      `${shouldArchive ? "Archive" : "Restore"} ` +
        `"${lexeme.lemma}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsSaving(true);
      setEditError("");

      const response = await apiFetch(
        `/lexemes/${lexeme.id}/archive`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isArchived: shouldArchive,
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The archive status could not be changed."
        );
      }

      await loadPageData();
    } catch (error) {
      console.error(error);
      setEditError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteLexeme() {
    const firstConfirmation = window.confirm(
      `Permanently delete "${lexeme.lemma}"?\n\n` +
        "This removes all glosses and every relationship involving it."
    );

    if (!firstConfirmation) {
      return;
    }

    const typedLemma = window.prompt(
      `Type the lemma exactly to confirm:\n${lexeme.lemma}`
    );

    if (typedLemma !== lexeme.lemma) {
      if (typedLemma !== null) {
        setDeleteError(
          "Deletion cancelled because the lemma did not match."
        );
      }

      return;
    }

    try {
      setIsDeleting(true);
      setDeleteError("");

      const response = await apiFetch(
        `/lexemes/${lexeme.id}`,
        {
          method: "DELETE",
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The lexeme could not be deleted."
        );
      }

      navigate("/");
    } catch (error) {
      console.error(error);
      setDeleteError(error.message);
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="app">
        <p className="status-message">
          Loading lexeme...
        </p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="app">
        <nav className="breadcrumb">
          <Link to="/">← Back to lexicon</Link>
        </nav>

        <p className="error-message">
          {loadError}
        </p>
      </main>
    );
  }

  if (!lexeme) {
    return null;
  }

  return (
    <main className="app">
      <nav className="breadcrumb">
        <Link to="/">← Back to lexicon</Link>
      </nav>

      {isEditing ? (
        <EditLexemeForm
          formData={editForm}
          stages={stages}
          lexemeClasses={editLexemeClasses}
          isLoadingLexemeClasses={
            isLoadingEditClasses
          }
          formError={editError}
          isSaving={isSaving}

          needsReview={
            lexeme.needs_review === 1
          }
          onReviewStatusChange={
            handleReviewStatus
          }
          isSavingReview={
            isSavingReview
          }
          reviewError={
            reviewError
          }
          
          onFieldChange={handleEditFieldChange}
          onGlossesChange={(glosses) =>
            setEditForm((current) => ({
              ...current,
              glosses,
            }))
          }
          onFormsChange={(forms) =>
            setEditForm((current) => ({
              ...current,
              forms,
            }))
          }
          onShowFormsChange={(showForms) =>
            setEditForm((current) => ({
              ...current,
              showForms,

              forms: showForms
                ? current.forms.length > 0
                  ? current.forms
                  : [
                      {
                        clientId: crypto.randomUUID(),
                        formLabel: "",
                        form: "",
                        notes: "",
                      },
                    ]
                : [],
            }))
          }
          onSubmit={handleEditSubmit}
          onCancel={cancelEditing}
          onArchive={handleArchive}
          isArchived={lexeme.is_archived === 1}
          onDelete={handleDeleteLexeme}
          isDeleting={isDeleting}
          deleteError={deleteError}
        >
          <LexemeRelationshipEditor
            currentLexemeId={lexeme.id}
            lexemes={[]}
            relationTypes={relationTypes}
            searchFilters={{
              stageId: "",
              lineageId: "",
              ageId: "",
              includeArchived: false,
            }}
            incomingRelations={
              lexeme.incoming_relations
            }
            outgoingRelations={
              lexeme.outgoing_relations
            }
            symmetricRelations={
              lexeme.symmetric_relations || []
            }
            onCreate={
              handleCreateRelationship
            }
            onUpdate={
              handleUpdateRelationship
            }
            onDelete={
              handleDeleteRelationship
            }
            isSaving={
              isSavingRelationship
            }
            error={relationshipError}
          />
        </EditLexemeForm>
      ) : (
        <article className="lexeme-page">
          <header className="lexeme-header">
            <div>
              <p className="language-label">
                {lexeme.stage_code}
              </p>

              <h1>{lexeme.lemma}</h1>

              <p className="part-of-speech">
                {lexeme.part_of_speech ||
                  "Part of speech unspecified"}

                {lexeme.lexeme_class_name
                  ? ` — ${lexeme.lexeme_class_name}`
                  : ""}
              </p>

              {lexeme.is_archived === 1 && (
                <span className="archive-badge">
                  Archived
                </span>
              )}

              <span
                className={
                  lexeme.needs_review === 1
                    ? "review-badge needs-review-badge"
                    : "review-badge reviewed-badge"
                }
              >
                {lexeme.needs_review === 1
                  ? "Needs review"
                  : "Reviewed"}
              </span>
            </div>

            <div className="header-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={handleReviewStatus}
                disabled={isSavingReview}
              >
                {isSavingReview
                  ? "Saving..."
                  : lexeme.needs_review === 1
                    ? "Mark Reviewed"
                    : "Mark Needs Review"}
              </button>

              <button
                type="button"
                onClick={beginEditing}
                disabled={isSavingReview}
              >
                Edit Lexeme
              </button>
            </div>
          </header>

          {reviewError && (
            <p className="error-message">
              {reviewError}
            </p>
          )}

          <section className="lexeme-section">
            <h2>Glosses</h2>

            <ol className="gloss-list detailed-gloss-list">
              {lexeme.glosses.map((gloss) => (
                <li key={gloss.id}>
                  <strong>{gloss.gloss}</strong>

                  {gloss.notes && (
                    <p className="muted-text">
                      {gloss.notes}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>

          {(lexeme.forms || []).length > 0 && (
            <section className="lexeme-section">
              <h2>Forms</h2>

              <ol className="form-list detailed-form-list">
                {lexeme.forms.map((form) => (
                  <li key={form.id}>
                    <strong>{form.form_label}</strong>

                    <span> — {form.form}</span>

                    {form.notes && (
                      <p className="muted-text">
                        {form.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="lexeme-section">
            <h2>Classification</h2>

            <dl className="metadata-grid">
              <div>
                <dt>Language stage</dt>
                <dd>
                  <Link
                    to={`/stages/${lexeme.language_stage_id}`}
                  >
                    {lexeme.stage_code}
                  </Link>
                </dd>
              </div>

              <div>
                <dt>Lineage</dt>
                <dd>{lexeme.lineage_code}</dd>
              </div>

              <div>
                <dt>Historical age</dt>
                <dd>{lexeme.age_code}</dd>
              </div>

              <div>
                <dt>Part of speech</dt>
                <dd>
                  {lexeme.part_of_speech || "—"}
                </dd>
              </div>

              <div>
                <dt>Lexeme class</dt>
                <dd>
                  {lexeme.lexeme_class_name ||
                    "Unclassified"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="lexeme-section">
            <h2>Lexical Relationships</h2>

            <div className="relationship-display-grid">
              <section>
                <h3>Incoming</h3>

                {lexeme.incoming_relations.length ===
                0 ? (
                  <p className="muted-text">
                    None recorded.
                  </p>
                ) : (
                  <ul className="relationship-list">
                    {lexeme.incoming_relations.map(
                      (relation) => (
                        <li
                          key={relation.relation_id}
                        >
                          <Link
                            to={`/lexemes/${relation.id}`}
                          >
                            {relation.lemma}
                          </Link>

                          {relation.is_archived === 1 && (
                            <span className="archive-badge">
                              Archived
                            </span>
                          )}

                          <span className="relationship-metadata">
                            {relation.stage_code}
                            {" — "}
                            {relation.relation_type}
                          </span>

                          {relation.relationship_notes && (
                            <p className="relationship-note">
                              {
                                relation.relationship_notes
                              }
                            </p>
                          )}
                        </li>
                      )
                    )}
                  </ul>
                )}
              </section>

              <section>
                <h3>Outgoing</h3>

                {lexeme.outgoing_relations.length ===
                0 ? (
                  <p className="muted-text">
                    None recorded.
                  </p>
                ) : (
                  <ul className="relationship-list">
                    {lexeme.outgoing_relations.map(
                      (relation) => (
                        <li
                          key={relation.relation_id}
                        >
                          <Link
                            to={`/lexemes/${relation.id}`}
                          >
                            {relation.lemma}
                          </Link>

                          {relation.is_archived === 1 && (
                            <span className="archive-badge">
                              Archived
                            </span>
                          )}

                          <span className="relationship-metadata">
                            {relation.stage_code}
                            {" — "}
                            {relation.relation_type}
                          </span>

                          {relation.relationship_notes && (
                            <p className="relationship-note">
                              {
                                relation.relationship_notes
                              }
                            </p>
                          )}
                        </li>
                      )
                    )}
                  </ul>
                )}
              </section>

              <section>
                <h3>Symmetric</h3>

                {(lexeme.symmetric_relations || []).length ===
                0 ? (
                  <p className="muted-text">
                    None recorded.
                  </p>
                ) : (
                  <ul className="relationship-list">
                    {lexeme.symmetric_relations.map(
                      (relation) => (
                        <li key={relation.relation_id}>
                          <Link
                            to={`/lexemes/${relation.id}`}
                          >
                            {relation.lemma}
                          </Link>

                          {relation.is_archived === 1 && (
                            <span className="archive-badge">
                              Archived
                            </span>
                          )}

                          <span className="relationship-metadata">
                            {relation.stage_code}
                            {" — "}
                            {relation.relation_type}
                          </span>

                          {relation.relationship_notes && (
                            <p className="relationship-note">
                              {
                                relation.relationship_notes
                              }
                            </p>
                          )}
                        </li>
                      )
                    )}
                  </ul>
                )}
              </section>
            </div>
          </section>

          <section className="lexeme-section">
            <h2>Notes</h2>

            {lexeme.notes ? (
              <p className="notes-display">
                {lexeme.notes}
              </p>
            ) : (
              <p className="muted-text">
                No lexeme notes recorded.
              </p>
            )}
          </section>
        </article>
      )}
    </main>
  );
}

export default LexemeDetailPage;