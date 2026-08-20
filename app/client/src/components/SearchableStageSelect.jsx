import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

function SearchableStageSelect({
  label,
  stages,
  value,
  onChange,
  excludedIds = [],
  placeholder = "Search language stages...",
}) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const containerRef = useRef(null);

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

  const selectedStage = stages.find(
    (stage) => Number(stage.id) === Number(value)
  );

  const normalizedExcludedIds = excludedIds.map(Number);

  const filteredStages = useMemo(() => {
    const query = searchText
      .trim()
      .toLocaleLowerCase();

    return stages.filter((stage) => {
      if (
        normalizedExcludedIds.includes(
          Number(stage.id)
        )
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        stage.code,
        stage.name,
        stage.lineage_code,
        stage.lineage_name,
        stage.age_code,
        stage.age_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();

      return searchableText.includes(query);
    });
  }, [stages, searchText, normalizedExcludedIds]);

  function selectStage(stage) {
    onChange(String(stage.id));
    setSearchText("");
    setIsOpen(false);
  }

  function clearSelection() {
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

      {selectedStage && (
        <div className="selected-stage-display">
          <div>
            <strong>{selectedStage.code}</strong>

            <span>
              {selectedStage.lineage_code}
              {" · "}
              {selectedStage.age_code}
            </span>
          </div>

          <button
            type="button"
            className="chip-remove-button"
            onClick={clearSelection}
            aria-label={`Clear ${selectedStage.code}`}
          >
            ×
          </button>
        </div>
      )}

      <div className="searchable-select-input-wrapper">
        <input
          type="search"
          value={searchText}
          placeholder={
            selectedStage
              ? "Choose a different stage..."
              : placeholder
          }
          autoComplete="off"
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
          aria-label="Toggle stage options"
        >
          ▾
        </button>
      </div>

      {isOpen && (
        <div className="searchable-select-menu">
          {filteredStages.length === 0 ? (
            <div className="searchable-select-empty">
              No matching stages.
            </div>
          ) : (
            filteredStages.map((stage) => (
              <button
                type="button"
                className="searchable-select-option"
                key={stage.id}
                onClick={() => selectStage(stage)}
              >
                <span className="option-lemma">
                  {stage.code}
                </span>

                <span className="option-metadata">
                  {stage.name}
                  {" — "}
                  {stage.lineage_code}
                  {" · "}
                  {stage.age_code}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default SearchableStageSelect;