import { apiFetch } from "../api";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const RELATIONSHIP_SEARCH_LIMIT = 20;

const EMPTY_LEXEMES = [];
const EMPTY_EXCLUDED_IDS = [];
const EMPTY_SEARCH_FILTERS = {};

function SearchableLexemeSelect({
  label,
  lexemes = EMPTY_LEXEMES,
  value,
  onChange,
  excludedIds = EMPTY_EXCLUDED_IDS,
  placeholder = "Search lexemes...",
  searchFilters = EMPTY_SEARCH_FILTERS,
}) {
  const [searchText, setSearchText] =
    useState("");

  const [isOpen, setIsOpen] =
    useState(false);

  const [searchResults, setSearchResults] =
    useState([]);

  const [selectedLexeme, setSelectedLexeme] =
    useState(null);

  const [isSearching, setIsSearching] =
    useState(false);

  const [searchError, setSearchError] =
    useState("");

  const containerRef = useRef(null);

  const normalizedExcludedIds = useMemo(
    () => excludedIds.map(Number),
    [excludedIds]
  );

  /*
   * Keep displaying a selected lexeme when it happens
   * to exist in the main lexeme-page results.
   *
   * A lexeme selected from backend search is also saved
   * directly in selectedLexeme below.
   */
  useEffect(() => {
    if (!value) {
      setSelectedLexeme(null);
      return;
    }

    const matchingLexeme = lexemes.find(
      (lexeme) =>
        Number(lexeme.id) === Number(value)
    );

    if (matchingLexeme) {
      setSelectedLexeme(matchingLexeme);
    }
  }, [value, lexemes]);

  /*
   * Close the dropdown when clicking outside it.
   */
  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, []);

  /*
   * Search the backend independently of the main
   * lexeme table.
   *
   * This uses the relationship field's own search text,
   * not the main list's search text.
   */
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const abortController =
      new AbortController();

    const timeoutId = window.setTimeout(
      async () => {
        try {
          setIsSearching(true);
          setSearchError("");

          const query = new URLSearchParams();

          const trimmedSearch =
            searchText.trim();

          const isExactLemmaSearch =
            trimmedSearch.length >= 2 &&
            trimmedSearch.startsWith("/") &&
            trimmedSearch.endsWith("/");

          const effectiveSearchText =
            isExactLemmaSearch
              ? trimmedSearch.slice(1, -1).trim()
              : trimmedSearch;

          if (effectiveSearchText) {
            query.set("q", effectiveSearchText);

            query.set(
              "matchMode",
              isExactLemmaSearch
                ? "exact"
                : "contains"
            );
          }

          if (searchFilters.stageId) {
            query.set(
              "stageId",
              searchFilters.stageId
            );
          }

          if (searchFilters.lineageId) {
            query.set(
              "lineageId",
              searchFilters.lineageId
            );
          }

          if (searchFilters.ageId) {
            query.set(
              "ageId",
              searchFilters.ageId
            );
          }

          if (searchFilters.includeArchived) {
            query.set(
              "includeArchived",
              "true"
            );
          }

          query.set(
            "limit",
            String(RELATIONSHIP_SEARCH_LIMIT)
          );

          query.set("offset", "0");

          const response = await apiFetch(
            `/lexemes?${query.toString()}`,
            {
              signal: abortController.signal,
            }
          );

          const responseData =
            await response.json();

          if (!response.ok) {
            throw new Error(
              responseData.error ||
                "Lexemes could not be searched."
            );
          }

          const availableResults =
            responseData.items.filter(
              (lexeme) =>
                !normalizedExcludedIds.includes(
                  Number(lexeme.id)
                )
            );

          setSearchResults(availableResults);
        } catch (error) {
          if (error.name === "AbortError") {
            return;
          }

          console.error(error);
          setSearchError(error.message);
          setSearchResults([]);
        } finally {
          if (!abortController.signal.aborted) {
            setIsSearching(false);
          }
        }
      },
      250
    );

    return () => {
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [
    isOpen,
    searchText,
    searchFilters.stageId,
    searchFilters.lineageId,
    searchFilters.ageId,
    searchFilters.includeArchived,
    normalizedExcludedIds,
  ]);

  function selectLexeme(lexeme) {
    setSelectedLexeme(lexeme);
    onChange(String(lexeme.id));
    setSearchText("");
    setIsOpen(false);
  }

  function clearSelection() {
    setSelectedLexeme(null);
    onChange("");
    setSearchText("");
  }

  return (
    <div
      className="searchable-select"
      ref={containerRef}
    >
      <span className="searchable-select-label">
        {label}
      </span>

      {selectedLexeme && (
        <div className="selected-stage-display">
          <div>
            <strong>
              {selectedLexeme.lemma}
            </strong>

            <span>
              {selectedLexeme.stage_code}

              {selectedLexeme.glosses
                ? ` — ${selectedLexeme.glosses}`
                : ""}
            </span>
          </div>

          <button
            type="button"
            className="chip-remove-button"
            onClick={clearSelection}
            aria-label={
              `Clear ${selectedLexeme.lemma}`
            }
          >
            ×
          </button>
        </div>
      )}

      <div className="searchable-select-input-wrapper">
        <input
          type="search"
          value={searchText}
          autoComplete="off"
          placeholder={
            selectedLexeme
              ? "Choose a different lexeme..."
              : placeholder
          }
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setSearchText(event.target.value);
            setIsOpen(true);
          }}
        />

        <button
          type="button"
          className="dropdown-toggle"
          onClick={() =>
            setIsOpen((current) => !current)
          }
          aria-label="Toggle lexeme options"
        >
          ▾
        </button>
      </div>

      <p className="searchable-select-hint">
        Use <code>/word/</code> for an exact lemma match.
      </p>

      {isOpen && (
        <div className="searchable-select-menu">
          {isSearching ? (
            <div className="searchable-select-empty">
              Searching...
            </div>
          ) : searchError ? (
            <div className="searchable-select-empty">
              {searchError}
            </div>
          ) : searchResults.length === 0 ? (
            <div className="searchable-select-empty">
              No matching lexemes.
            </div>
          ) : (
            searchResults.map((lexeme) => (
              <button
                type="button"
                className="searchable-select-option"
                key={lexeme.id}
                onClick={() =>
                  selectLexeme(lexeme)
                }
              >
                <span className="option-lemma">
                  {lexeme.lemma}
                </span>

                <span className="option-metadata">
                  {lexeme.stage_code}

                  {lexeme.lexeme_class_name
                    ? ` — ${lexeme.lexeme_class_name}`
                    : ""}

                  {lexeme.glosses
                    ? ` — ${lexeme.glosses}`
                    : ""}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default SearchableLexemeSelect;