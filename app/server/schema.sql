PRAGMA foreign_keys = ON;


/* =========================================================
   Historical ages
   ========================================================= */

CREATE TABLE IF NOT EXISTS ages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL UNIQUE,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


/* =========================================================
   Language lineages
   ========================================================= */

CREATE TABLE IF NOT EXISTS language_lineages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  notes TEXT,

  is_archived INTEGER NOT NULL DEFAULT 0
    CHECK (is_archived IN (0, 1)),

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


/* =========================================================
   Language stages
   ========================================================= */

CREATE TABLE IF NOT EXISTS language_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,

  lineage_id INTEGER NOT NULL,
  age_id INTEGER NOT NULL,

  grammar_path TEXT,
  notes TEXT,

  is_archived INTEGER NOT NULL DEFAULT 0
    CHECK (is_archived IN (0, 1)),

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (lineage_id)
    REFERENCES language_lineages(id),

  FOREIGN KEY (age_id)
    REFERENCES ages(id),

  UNIQUE (lineage_id, age_id)
);

/* =========================================================
   Stage-specific lexeme classes
   ========================================================= */

CREATE TABLE IF NOT EXISTS lexeme_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  language_stage_id INTEGER NOT NULL,

  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  description TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (language_stage_id)
    REFERENCES language_stages(id)
    ON DELETE CASCADE,

  UNIQUE (
    language_stage_id,
    normalized_name
  )
);

/* =========================================================
   Language-stage relationships
   ========================================================= */

CREATE TABLE IF NOT EXISTS language_stage_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  source_stage_id INTEGER NOT NULL,
  target_stage_id INTEGER NOT NULL,

  relation_type TEXT NOT NULL,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (source_stage_id)
    REFERENCES language_stages(id)
    ON DELETE CASCADE,

  FOREIGN KEY (target_stage_id)
    REFERENCES language_stages(id)
    ON DELETE CASCADE,

  CHECK (source_stage_id != target_stage_id),

  UNIQUE (
    source_stage_id,
    target_stage_id,
    relation_type
  )
);


/* =========================================================
   Lexemes
   ========================================================= */

CREATE TABLE IF NOT EXISTS lexemes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  lemma TEXT NOT NULL,
  normalized_lemma TEXT NOT NULL,

  language_stage_id INTEGER NOT NULL,

  part_of_speech TEXT,
  lexeme_class_id INTEGER,
  notes TEXT,

  is_archived INTEGER NOT NULL DEFAULT 0
    CHECK (is_archived IN (0, 1)),

  needs_review INTEGER NOT NULL DEFAULT 0
    CHECK (needs_review IN (0, 1)),

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (language_stage_id)
    REFERENCES language_stages(id),

  FOREIGN KEY (lexeme_class_id)
    REFERENCES lexeme_classes(id)
    ON DELETE SET NULL
);


/* =========================================================
   Glosses
   ========================================================= */

CREATE TABLE IF NOT EXISTS glosses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  lexeme_id INTEGER NOT NULL,
  gloss TEXT NOT NULL,
  sense_order INTEGER NOT NULL DEFAULT 1,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (lexeme_id)
    REFERENCES lexemes(id)
    ON DELETE CASCADE
);

/* =========================================================
   Lexeme forms
   ========================================================= */

CREATE TABLE IF NOT EXISTS lexeme_forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  lexeme_id INTEGER NOT NULL,

  form_label TEXT NOT NULL,
  form TEXT NOT NULL,
  form_order INTEGER NOT NULL DEFAULT 1,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (lexeme_id)
    REFERENCES lexemes(id)
    ON DELETE CASCADE
);

/* =========================================================
   Lexeme relationships
   ========================================================= */

CREATE TABLE IF NOT EXISTS lexeme_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  source_lexeme_id INTEGER NOT NULL,
  target_lexeme_id INTEGER NOT NULL,

  relation_type TEXT NOT NULL,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (source_lexeme_id)
    REFERENCES lexemes(id)
    ON DELETE CASCADE,

  FOREIGN KEY (target_lexeme_id)
    REFERENCES lexemes(id)
    ON DELETE CASCADE,

  CHECK (source_lexeme_id != target_lexeme_id),

  UNIQUE (
    source_lexeme_id,
    target_lexeme_id,
    relation_type
  )
);


/* =========================================================
   Indexes
   ========================================================= */

CREATE INDEX IF NOT EXISTS idx_ages_sort_order
  ON ages(sort_order);

CREATE INDEX IF NOT EXISTS idx_lineages_code
  ON language_lineages(code);

CREATE INDEX IF NOT EXISTS idx_stages_code
  ON language_stages(code);

CREATE INDEX IF NOT EXISTS idx_stages_lineage
  ON language_stages(lineage_id);

CREATE INDEX IF NOT EXISTS idx_stages_age
  ON language_stages(age_id);

CREATE INDEX IF NOT EXISTS idx_stage_relations_source
  ON language_stage_relations(source_stage_id);

CREATE INDEX IF NOT EXISTS idx_stage_relations_target
  ON language_stage_relations(target_stage_id);

CREATE INDEX IF NOT EXISTS idx_lexemes_lemma
  ON lexemes(lemma);

CREATE INDEX IF NOT EXISTS idx_lexemes_normalized_lemma
  ON lexemes(normalized_lemma);

CREATE INDEX IF NOT EXISTS idx_lexemes_stage
  ON lexemes(language_stage_id);

CREATE INDEX IF NOT EXISTS idx_glosses_lexeme
  ON glosses(lexeme_id);

CREATE INDEX IF NOT EXISTS idx_glosses_gloss
  ON glosses(gloss);

CREATE INDEX IF NOT EXISTS idx_lexeme_forms_lexeme
  ON lexeme_forms(lexeme_id);

CREATE INDEX IF NOT EXISTS idx_lexeme_forms_form
  ON lexeme_forms(form);

CREATE INDEX IF NOT EXISTS idx_lexeme_relations_source
  ON lexeme_relations(source_lexeme_id);

CREATE INDEX IF NOT EXISTS idx_lexeme_relations_target
  ON lexeme_relations(target_lexeme_id);

CREATE INDEX IF NOT EXISTS idx_lexeme_classes_stage
  ON lexeme_classes(language_stage_id);

CREATE INDEX IF NOT EXISTS idx_lexeme_classes_name
  ON lexeme_classes(normalized_name);