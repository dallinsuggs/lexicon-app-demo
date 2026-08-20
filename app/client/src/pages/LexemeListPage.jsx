import { apiFetch } from "../api";

import { useEffect, useRef, useState } from "react";

import "../App.css";
import { useNavigate } from "react-router";

import CreateLexemeForm from "../components/CreateLexemeForm";
import LexemeFilters from "../components/LexemeFilters";
import LexemeHeader from "../components/LexemeHeader";
import LexemeTable from "../components/LexemeTable";

const LEXEME_PAGE_SIZE = 100;
const FILTER_STORAGE_KEY =
  "lexemeListFilters";

const EMPTY_CREATE_FORM = {
  lemma: "",
  languageStageId: "",
  partOfSpeech: "",
  lexemeClassId: "",
  notes: "",

  glosses: [
    {
      clientId: crypto.randomUUID(),
      gloss: "",
      notes: "",
    },
  ],

  showForms: false,
  forms: [],

  relationships: [],
};

const DEFAULT_FILTERS = {
  searchText: "",
  selectedStageId: "",
  selectedLineageId: "",
  selectedAgeId: "",
  selectedLexemeClassId: "",
  selectedPartOfSpeech: "",
  reviewFilter: "all",
  showArchived: false,
};

function loadSavedFilters() {
  try {
    const saved = localStorage.getItem(
      FILTER_STORAGE_KEY
    );

    if (!saved) {
      return DEFAULT_FILTERS;
    }

    return {
      ...DEFAULT_FILTERS,
      ...JSON.parse(saved),
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function LexemeListPage() {
  const [savedFilters] = useState(
    () => loadSavedFilters()
  );

  const navigate = useNavigate();

  const [
    isRestoringDemo,
    setIsRestoringDemo,
  ] = useState(false);

  const [
    restoreDemoError,
    setRestoreDemoError,
  ] = useState("");
  
  const [lexemes, setLexemes] = useState([]);
  const [totalLexemes, setTotalLexemes] = useState(0);
  const [hasMoreLexemes, setHasMoreLexemes] =
    useState(false);
  const [isLoadingMore, setIsLoadingMore] =
    useState(false);
  const [stages, setStages] = useState([]);
  const [lineages, setLineages] = useState([]);
  const [ages, setAges] = useState([]);
  const [relationTypes, setRelationTypes] = useState([]);

  const [
    createLexemeClasses,
    setCreateLexemeClasses,
  ] = useState([]);

  const [
    isLoadingCreateClasses,
    setIsLoadingCreateClasses,
  ] = useState(false);

  const [searchText, setSearchText] = useState(savedFilters.searchText);
  const [selectedStageId, setSelectedStageId] =
    useState(savedFilters.selectedStageId);
  const [selectedLineageId, setSelectedLineageId] =
    useState(savedFilters.selectedLineageId);
  const [selectedAgeId, setSelectedAgeId] =
    useState(savedFilters.selectedAgeId);
  const [
    selectedLexemeClassId,
    setSelectedLexemeClassId,
  ] = useState(
    savedFilters.selectedLexemeClassId
  );

  const [
    selectedPartOfSpeech,
    setSelectedPartOfSpeech,
  ] = useState(
    savedFilters.selectedPartOfSpeech
  );

  const [reviewFilter, setReviewFilter] =
  useState(savedFilters.reviewFilter);

  const [showCreateForm, setShowCreateForm] =
    useState(false);

  const [createForm, setCreateForm] =
    useState(EMPTY_CREATE_FORM);

  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [lastCreatedLemma, setLastCreatedLemma] =
    useState(() =>
      localStorage.getItem("lastCreatedLemma") || ""
    );

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [
    isBulkUpdatingReview,
    setIsBulkUpdatingReview,
  ] = useState(false);

  const [
    bulkReviewMessage,
    setBulkReviewMessage,
  ] = useState("");

  const [
    bulkReviewError,
    setBulkReviewError,
  ] = useState("");

  const [
    filterLexemeClasses,
    setFilterLexemeClasses,
  ] = useState([]);

  const [
    isLoadingFilterClasses,
    setIsLoadingFilterClasses,
  ] = useState(false);

  const [
    filterClassError,
    setFilterClassError,
  ] = useState("");

  const [showArchived, setShowArchived] =
    useState(savedFilters.showArchived);

  const isCopyingInheritedGlosses = useRef(false);

  useEffect(() => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({
        searchText,
        selectedStageId,
        selectedLineageId,
        selectedAgeId,
        selectedLexemeClassId,
        selectedPartOfSpeech,
        reviewFilter,
        showArchived,
      })
    );
  }, [
    searchText,
    selectedStageId,
    selectedLineageId,
    selectedAgeId,
    selectedLexemeClassId,
    selectedPartOfSpeech,
    reviewFilter,
    showArchived,
  ]);

  useEffect(() => {
    if (!selectedStageId) {
      setFilterLexemeClasses([]);
      setFilterClassError("");

      if (selectedLexemeClassId) {
        setSelectedLexemeClassId("");
      }

      return;
    }

    let wasCancelled = false;

    async function loadFilterLexemeClasses() {
      try {
        setIsLoadingFilterClasses(true);
        setFilterClassError("");

        // 1. Filter-stage lexeme classes

        const response = await apiFetch(
          `/stages/${selectedStageId}/lexeme-classes`
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
          setFilterLexemeClasses(
            responseData.classes
          );

          /*
          * A previously stored class ID may no longer
          * exist or may belong to another stage.
          */
          if (
            selectedLexemeClassId &&
            selectedLexemeClassId !==
              "unclassified"
          ) {
            const selectedClassStillExists =
              responseData.classes.some(
                (lexemeClass) =>
                  Number(lexemeClass.id) ===
                  Number(
                    selectedLexemeClassId
                  )
              );

            if (!selectedClassStillExists) {
              setSelectedLexemeClassId("");
            }
          }
        }
      } catch (error) {
        console.error(error);

        if (!wasCancelled) {
          setFilterLexemeClasses([]);
          setFilterClassError(error.message);
          setSelectedLexemeClassId("");
        }
      } finally {
        if (!wasCancelled) {
          setIsLoadingFilterClasses(false);
        }
      }
    }

    loadFilterLexemeClasses();

    return () => {
      wasCancelled = true;
    };
  }, [selectedStageId]);

  async function loadFilterOptions() {
    const [
      stagesResponse,
      lineagesResponse,
      agesResponse,
      relationTypesResponse,
    ] = await Promise.all([
      apiFetch("/stages"),
      apiFetch("/lineages"),
      apiFetch("/ages"),
      apiFetch("/lexeme-relation-types"),
    ]);

    const [
      stagesData,
      lineagesData,
      agesData,
      relationTypesData,
    ] = await Promise.all([
      stagesResponse.json(),
      lineagesResponse.json(),
      agesResponse.json(),
      relationTypesResponse.json(),
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

    if (!relationTypesResponse.ok) {
      throw new Error(
        relationTypesData.error ||
          "Lexeme relationship types could not be loaded."
      );
    }

    setStages(stagesData);
    setLineages(lineagesData);
    setAges(agesData);
    setRelationTypes(relationTypesData);
  }

  async function loadLexemes({
    append = false,
    offset = 0,
  } = {}) {
    const query = new URLSearchParams();

    if (searchText.trim()) {
      query.set("q", searchText.trim());
    }

    if (selectedStageId) {
      query.set("stageId", selectedStageId);
    }

    if (selectedLineageId) {
      query.set("lineageId", selectedLineageId);
    }

    if (selectedAgeId) {
      query.set("ageId", selectedAgeId);
    }

    if (selectedLexemeClassId) {
      query.set(
        "lexemeClassId",
        selectedLexemeClassId
      );
    }

    if (selectedPartOfSpeech) {
      query.set(
        "partOfSpeech",
        selectedPartOfSpeech
      );
    }

    if (showArchived) {
      query.set("includeArchived", "true");
    }

    if (reviewFilter === "needs-review") {
      query.set("needsReview", "true");
    }

    if (reviewFilter === "reviewed") {
      query.set("needsReview", "false");
    }

    query.set("limit", String(LEXEME_PAGE_SIZE));
    query.set("offset", String(offset));

    const response = await apiFetch(
      `/lexemes?${query.toString()}`
    );

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(
        responseData.error ||
          "Lexemes could not be loaded."
      );
    }

    setLexemes((current) =>
      append
        ? [...current, ...responseData.items]
        : responseData.items
    );

    setTotalLexemes(responseData.total);
    setHasMoreLexemes(responseData.hasMore);
  }

  async function handleLoadMore() {
    if (
      isLoading ||
      isLoadingMore ||
      !hasMoreLexemes
    ) {
      return;
    }

    try {
      setIsLoadingMore(true);
      setLoadError("");

      await loadLexemes({
        append: true,
        offset: lexemes.length,
      });
    } catch (error) {
      console.error(error);
      setLoadError(error.message);
    } finally {
      setIsLoadingMore(false);
    }
  }

  useEffect(() => {
    const lemma = createForm.lemma.trim();

    if (!showCreateForm) {
      document.title = "Lexicon";
      return;
    }

    document.title = lemma
      ? `New Lexeme - ${lemma}`
      : "New Lexeme";
  }, [showCreateForm, createForm.lemma]);

  /*
   * Create-lexeme keyboard shortcuts
   *
   * Keep page-level shortcuts together in this effect so
   * additional shortcuts can be added without registering
   * separate document listeners.
   */
  useEffect(() => {
    function handleKeyboardShortcut(event) {
      const activeElement = document.activeElement;

      const isTyping =
        activeElement instanceof HTMLElement &&
        (
          activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.tagName === "SELECT"
        );

      const isEditFirstShortcut =
        event.altKey &&
        event.shiftKey &&
        !event.ctrlKey &&
        event.code === "KeyE";

      if (
        isEditFirstShortcut &&
        !showCreateForm &&
        !isTyping &&
        lexemes.length > 0
      ) {
        event.preventDefault();

        navigate(
          `/lexemes/${lexemes[0].id}?edit=true&from=list`
        );

        return;
      }

      if (!showCreateForm || event.repeat) {
        return;
      }

      const isAddFormShortcut =
        event.shiftKey &&
        event.altKey &&
        event.code === "KeyF";

      if (isAddFormShortcut) {
        event.preventDefault();

        setCreateForm((current) => ({
          ...current,
          showForms: true,
          forms: [
            ...current.forms,
            {
              clientId: crypto.randomUUID(),
              formLabel: "",
              form: "",
              notes: "",
            },
          ],
        }));

        return;
      }

      /*
       * Add future create-form shortcuts here:
       *
       * const isSomeOtherShortcut = ...;
       *
       * if (isSomeOtherShortcut) {
       *   event.preventDefault();
       *   ...
       *   return;
       * }
       */
    }

    document.addEventListener(
      "keydown",
      handleKeyboardShortcut
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyboardShortcut
      );
    };
  }, [
    showCreateForm,
    lexemes,
    navigate,
  ]);

  useEffect(() => {
    async function loadInitialPage() {
      try {
        setLoadError("");
        await loadFilterOptions();
      } catch (error) {
        console.error(error);
        setLoadError(error.message);
        setIsLoading(false);
      }
    }

    loadInitialPage();
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      async () => {
        try {
          setIsLoading(true);
          setLoadError("");

          await loadLexemes({
            append: false,
            offset: 0,
          });
        } catch (error) {
          console.error(error);
          setLoadError(error.message);
        } finally {
          setIsLoading(false);
        }
      },
      250
    );

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    searchText,
    selectedStageId,
    selectedLineageId,
    selectedAgeId,
    selectedLexemeClassId,
    selectedPartOfSpeech,
    showArchived,
    reviewFilter,
  ]);

  useEffect(() => {
    const stageId =
      createForm.languageStageId;

    if (!stageId) {
      setCreateLexemeClasses([]);

      setCreateForm((current) => {
        if (!current.lexemeClassId) {
          return current;
        }

        return {
          ...current,
          lexemeClassId: "",
        };
      });

      return;
    }

    let wasCancelled = false;

    async function loadCreateLexemeClasses() {
      try {
        setIsLoadingCreateClasses(true);
        setCreateError("");

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
          setCreateLexemeClasses(
            responseData.classes
          );
        }
      } catch (error) {
        console.error(error);

        if (!wasCancelled) {
          setCreateLexemeClasses([]);
          setCreateError(error.message);
        }
      } finally {
        if (!wasCancelled) {
          setIsLoadingCreateClasses(false);
        }
      }
    }

    loadCreateLexemeClasses();

    return () => {
      wasCancelled = true;
    };
  }, [createForm.languageStageId]);

  function handleSelectedStageIdChange(stageId) {
    setSelectedStageId(stageId);
    setSelectedLexemeClassId("");
  }

  const hasMeaningfulBulkFilter =
    Boolean(
      searchText.trim() ||
      selectedStageId ||
      selectedLineageId ||
      selectedAgeId ||
      selectedLexemeClassId ||
      selectedPartOfSpeech ||
      reviewFilter !== "all"
    );

  function clearFilters() {
    setSearchText("");
    setSelectedStageId("");
    setSelectedLineageId("");
    setSelectedAgeId("");
    setSelectedLexemeClassId("");
    setSelectedPartOfSpeech("");
    setShowArchived(false);
    setReviewFilter("all");
  }

  async function handleBulkReviewStatus(
    needsReview
  ) {
    if (
      !hasMeaningfulBulkFilter ||
      totalLexemes === 0 ||
      isBulkUpdatingReview
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Mark all ${totalLexemes} lexeme` +
        `${totalLexemes === 1 ? "" : "s"} ` +
        `matching the current filters as ` +
        `${
          needsReview
            ? "needing review"
            : "reviewed"
        }?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsBulkUpdatingReview(true);
      setBulkReviewError("");
      setBulkReviewMessage("");

      const response = await apiFetch(
        "/lexemes/bulk-review-status",
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            needsReview,

            q: searchText.trim(),

            stageId:
              selectedStageId || null,

            lineageId:
              selectedLineageId || null,

            ageId:
              selectedAgeId || null,

            lexemeClassId:
              selectedLexemeClassId ||
              null,

            partOfSpeech:
              selectedPartOfSpeech ||
              null,

            includeArchived:
              showArchived,

            filterNeedsReview:
              reviewFilter ===
              "needs-review"
                ? true
                : reviewFilter ===
                    "reviewed"
                  ? false
                  : null,
          }),
        }
      );

      const responseData =
        await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "Lexemes could not be marked for review."
        );
      }

      setBulkReviewMessage(
        responseData.message
      );

      await loadLexemes({
        append: false,
        offset: 0,
      });
    } catch (error) {
      console.error(error);

      setBulkReviewError(
        error.message
      );
    } finally {
      setIsBulkUpdatingReview(false);
    }
  }

  function openCreateForm() {
    setCreateError("");
    setShowCreateForm(true);
  }

  function closeCreateForm() {
    if (isCreating) {
      return;
    }

    setCreateForm(EMPTY_CREATE_FORM);
    setCreateError("");
    setShowCreateForm(false);
  }

  function handleCreateFieldChange(event) {
    const { name, value } = event.target;

    setCreateForm((current) => {
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

  function glossesAreBlank(glosses) {
  return glosses.every(
    (gloss) =>
      !gloss.gloss.trim() &&
      !gloss.notes.trim()
  );
}

async function handleInheritanceSourceSelected(
  parentLexemeId
) {
  if (!parentLexemeId) {
    return;
  }

  /*
   * Never overwrite glosses the user has already entered
   * or edited.
   */
  if (!glossesAreBlank(createForm.glosses)) {
    return;
  }

  /*
   * Prevent two near-simultaneous relationship changes
   * from starting duplicate requests.
   */
  if (isCopyingInheritedGlosses.current) {
    return;
  }

  try {
    isCopyingInheritedGlosses.current = true;
    setCreateError("");

    const response = await apiFetch(
      `/lexemes/${parentLexemeId}`
    );

    const parentLexeme = await response.json();

    if (!response.ok) {
      throw new Error(
        parentLexeme.error ||
          "The parent lexeme could not be loaded."
      );
    }

    const copiedGlosses = parentLexeme.glosses.map(
      (gloss) => ({
        clientId: crypto.randomUUID(),
        gloss: gloss.gloss,
        notes: gloss.notes || "",
      })
    );

    if (copiedGlosses.length === 0) {
      return;
    }

    setCreateForm((current) => {
      /*
       * Check again after the request finishes. The user
       * might have entered a gloss while it was loading.
       */
      if (!glossesAreBlank(current.glosses)) {
        return current;
      }

      return {
        ...current,
        glosses: copiedGlosses,
      };
    });
  } catch (error) {
    console.error(error);
    setCreateError(error.message);
  } finally {
    isCopyingInheritedGlosses.current = false;
  }
}

  async function handleCreateLexeme(event) {
    event.preventDefault();
    setCreateError("");

    if (!createForm.lemma.trim()) {
      setCreateError("Lemma is required.");
      return;
    }

    if (!createForm.languageStageId) {
      setCreateError(
        "A language stage is required."
      );
      return;
    }

    const cleanedGlosses = createForm.glosses
      .map((gloss) => ({
        gloss: gloss.gloss.trim(),
        notes: gloss.notes.trim(),
      }))
      .filter((gloss) => gloss.gloss);

    if (cleanedGlosses.length === 0) {
      setCreateError(
        "At least one gloss is required."
      );
      return;
    }

    const cleanedForms = createForm.forms
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
        setCreateError(
          "Every form requires both a form label and a form."
        );
        return;
      }
    }

    for (const relationship of createForm.relationships) {
      if (!relationship.relatedLexemeId) {
        setCreateError(
          "Every relationship requires a related lexeme."
        );
        return;
      }

      if (!relationship.relationType) {
        setCreateError(
          "Every relationship requires a type."
        );
        return;
      }
    }

    try {
      setIsCreating(true);

      const response = await apiFetch(
        "/lexemes",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lemma: createForm.lemma.trim(),
            languageStageId: Number(
              createForm.languageStageId
            ),
            partOfSpeech:
              createForm.partOfSpeech,
            lexemeClassId:
              createForm.lexemeClassId
                ? Number(createForm.lexemeClassId)
                : null,
            notes: createForm.notes.trim(),
            glosses: cleanedGlosses,
            forms: cleanedForms,
            relationships:
              createForm.relationships.map(
                (relationship) => ({
                  direction:
                    relationship.direction,
                  relatedLexemeId: Number(
                    relationship.relatedLexemeId
                  ),
                  relationType:
                    relationship.relationType,
                  notes:
                    relationship.notes.trim(),
                })
              ),
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The lexeme could not be created."
        );
      }

      const createdLemma = createForm.lemma.trim();

      setLastCreatedLemma(createdLemma);

      localStorage.setItem(
        "lastCreatedLemma",
        createdLemma
      );

      setCreateForm({
        ...EMPTY_CREATE_FORM,
        languageStageId:
          createForm.languageStageId,
      });

      await loadLexemes({
        append: false,
        offset: 0,
      });
    } catch (error) {
      console.error(error);
      setCreateError(error.message);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRestoreDemoData() {
  const confirmed = window.confirm(
    "Restore the demo to its original state?\n\n" +
      "All edits, deletions, archives, newly created entries, " +
      "and other changes made in this demo session will be discarded."
  );

  if (!confirmed) {
    return;
  }

  try {
    setIsRestoringDemo(true);
    setRestoreDemoError("");

    const response = await apiFetch(
      "/demo/reset",
      {
        method: "POST",
      }
    );

    const responseData =
      await response.json();

    if (!response.ok) {
      throw new Error(
        responseData.error ||
          "The demo data could not be restored."
      );
    }

    window.location.reload();
  } catch (error) {
    console.error(error);
    setRestoreDemoError(error.message);
  } finally {
    setIsRestoringDemo(false);
  }
}

  return (
    <main className="app">
      <LexemeHeader
        onNewLexeme={openCreateForm}
        onRestoreDemo={handleRestoreDemoData}
        isRestoringDemo={isRestoringDemo}
      />

      {restoreDemoError && (
        <p className="error-message">
          {restoreDemoError}
        </p>
      )}

      {showCreateForm && (
        <CreateLexemeForm
          formData={createForm}
          stages={stages}
          lexemeClasses={
            createLexemeClasses
          }
          isLoadingLexemeClasses={
            isLoadingCreateClasses
          }
          lexemes={lexemes}
          relationTypes={relationTypes}
          relationshipSearchFilters={{
            stageId: selectedStageId,
            lineageId: selectedLineageId,
            ageId: selectedAgeId,
            includeArchived: showArchived,
          }}
          formError={createError}
          isSaving={isCreating}
          lastCreatedLemma={lastCreatedLemma}
          onFieldChange={handleCreateFieldChange}
          onGlossesChange={(glosses) =>
            setCreateForm((current) => ({
              ...current,
              glosses,
            }))
          }
          onFormsChange={(forms) =>
            setCreateForm((current) => ({
              ...current,
              forms,
            }))
          }
          onShowFormsChange={(showForms) =>
            setCreateForm((current) => ({
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
          onRelationshipsChange={(relationships) =>
            setCreateForm((current) => ({
              ...current,
              relationships,
            }))
          }
          onInheritanceSourceSelected={
            handleInheritanceSourceSelected
          }
          onSubmit={handleCreateLexeme}
          onClose={closeCreateForm}
        />
      )}

      <LexemeFilters
        searchText={searchText}
        onSearchTextChange={setSearchText}

        selectedStageId={selectedStageId}
        onSelectedStageIdChange={
          handleSelectedStageIdChange
        }

        selectedLineageId={selectedLineageId}
        onSelectedLineageIdChange={
          setSelectedLineageId
        }

        selectedAgeId={selectedAgeId}
        onSelectedAgeIdChange={setSelectedAgeId}

        selectedPartOfSpeech={
          selectedPartOfSpeech
        }
        onSelectedPartOfSpeechChange={
          setSelectedPartOfSpeech
        }

        selectedLexemeClassId={
          selectedLexemeClassId
        }
        onSelectedLexemeClassIdChange={
          setSelectedLexemeClassId
        }
        lexemeClasses={filterLexemeClasses}
        isLoadingLexemeClasses={
          isLoadingFilterClasses
        }

        reviewFilter={reviewFilter}
        onReviewFilterChange={setReviewFilter}

        stages={stages}
        lineages={lineages}
        ages={ages}

        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}

        onClear={clearFilters}
      />

      {filterClassError && (
        <p className="error-message">
          {filterClassError}
        </p>
      )}

      {isLoading && (
        <p className="status-message">
          Loading lexemes...
        </p>
      )}

      {loadError && (
        <p className="error-message">
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && (
        <section>
          <div className="result-summary">
            <span>
              Showing <strong>{lexemes.length}</strong> of{" "}
              <strong>{totalLexemes}</strong>{" "}
              {totalLexemes === 1
                ? "lexeme"
                : "lexemes"}
            </span>

            <button
              type="button"
              className="secondary-button compact-button"
              onClick={() =>
                handleBulkReviewStatus(true)
              }
              disabled={
                !hasMeaningfulBulkFilter ||
                totalLexemes === 0 ||
                isBulkUpdatingReview
              }
              title={
                !hasMeaningfulBulkFilter
                  ? "Apply at least one filter before using a bulk review action."
                  : `Mark all ${totalLexemes} matching lexemes as needing review`
              }
            >
              {isBulkUpdatingReview
                ? "Marking..."
                : "Mark filtered as needs review"}
            </button>

            <button
              type="button"
              className="secondary-button compact-button"
              onClick={() =>
                handleBulkReviewStatus(false)
              }
              disabled={
                !hasMeaningfulBulkFilter ||
                totalLexemes === 0 ||
                isBulkUpdatingReview
              }
              title={
                !hasMeaningfulBulkFilter
                  ? "Apply at least one filter before using a bulk review action."
                  : `Mark all ${totalLexemes} matching lexemes as reviewed`
              }
            >
              {isBulkUpdatingReview
                ? "Updating..."
                : "Mark filtered as reviewed"}
            </button>

            {lexemes.length > 0 && (
              <span className="result-shortcut-hint">
                <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd>
                <span>Edit first result</span>
              </span>
            )}
          </div>

          {bulkReviewMessage && (
            <p className="success-message">
              {bulkReviewMessage}
            </p>
          )}

          {bulkReviewError && (
            <p className="error-message">
              {bulkReviewError}
            </p>
          )}

          <LexemeTable lexemes={lexemes} />

          {hasMoreLexemes && (
            <div className="load-more-container">
              <button
                type="button"
                className="secondary-button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore
                  ? "Loading..."
                  : `Load ${LEXEME_PAGE_SIZE} More`}
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default LexemeListPage;