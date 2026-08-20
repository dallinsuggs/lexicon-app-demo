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

function LexemeFilters({
  searchText,
  onSearchTextChange,

  selectedStageId,
  onSelectedStageIdChange,

  selectedLineageId,
  onSelectedLineageIdChange,

  selectedAgeId,
  onSelectedAgeIdChange,

  selectedPartOfSpeech,
  onSelectedPartOfSpeechChange,

  selectedLexemeClassId,
  onSelectedLexemeClassIdChange,
  lexemeClasses,
  isLoadingLexemeClasses,

  reviewFilter,
  onReviewFilterChange,

  stages,
  lineages,
  ages,

  onClear,

  showArchived,
  onShowArchivedChange,
}) {
  const hasActiveFilters =
    searchText ||
    selectedStageId ||
    selectedLineageId ||
    selectedAgeId ||
    selectedLexemeClassId ||
    selectedPartOfSpeech ||
    reviewFilter !== "all" ||
    showArchived;

  return (
    <section
      className="filters lexeme-filter-grid"
      aria-label="Lexeme filters"
    >
      <label className="lexeme-search-field">
        Search
        <input
          type="search"
          placeholder="Search lemma or gloss"
          value={searchText}
          onChange={(event) =>
            onSearchTextChange(event.target.value)
          }
        />
      </label>

      <label>
        Language stage
        <select
          value={selectedStageId}
          onChange={(event) =>
            onSelectedStageIdChange(event.target.value)
          }
        >
          <option value="">All stages</option>

          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.code} — {stage.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Lineage
        <select
          value={selectedLineageId}
          onChange={(event) =>
            onSelectedLineageIdChange(
              event.target.value
            )
          }
        >
          <option value="">All lineages</option>

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
          value={selectedAgeId}
          onChange={(event) =>
            onSelectedAgeIdChange(event.target.value)
          }
        >
          <option value="">All ages</option>

          {ages.map((age) => (
            <option key={age.id} value={age.id}>
              {age.code} — {age.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Part of speech

        <select
          value={selectedPartOfSpeech}
          onChange={(event) =>
            onSelectedPartOfSpeechChange(
              event.target.value
            )
          }
        >
          <option value="">
            All parts of speech
          </option>

          <option value="unspecified">
            Unspecified
          </option>

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
          value={selectedLexemeClassId}
          onChange={(event) =>
            onSelectedLexemeClassIdChange(
              event.target.value
            )
          }
          disabled={
            !selectedStageId ||
            isLoadingLexemeClasses
          }
        >
          <option value="">
            {!selectedStageId
              ? "Select a stage first"
              : isLoadingLexemeClasses
                ? "Loading classes..."
                : "All classes"}
          </option>

          {selectedStageId &&
            !isLoadingLexemeClasses && (
              <option value="unclassified">
                Unclassified
              </option>
            )}

          {lexemeClasses.map(
            (lexemeClass) => (
              <option
                key={lexemeClass.id}
                value={lexemeClass.id}
              >
                {lexemeClass.name}
                {" ("}
                {lexemeClass.lexeme_count}
                {")"}
              </option>
            )
          )}
        </select>
      </label>

      <label>
        Review status
        <select
          value={reviewFilter}
          onChange={(event) =>
            onReviewFilterChange(event.target.value)
          }
        >
          <option value="all">
            All review statuses
          </option>

          <option value="needs-review">
            Needs review
          </option>

          <option value="reviewed">
            Reviewed
          </option>
        </select>
      </label>

      <label className="filter-checkbox">
        Archived Entries
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) =>
            onShowArchivedChange(event.target.checked)
          }
        />
      </label>

      <div className="filter-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onClear}
          disabled={!hasActiveFilters}
        >
          Clear Filters
        </button>
      </div>

    </section>
  );
}

export default LexemeFilters;