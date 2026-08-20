const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const databasePath = path.join(
  __dirname,
  "..",
  "data",
  "lexicon.db"
);
const schemaPath = path.join(__dirname, "schema.sql");
const vaultPath = path.join(
  __dirname,
  "..",
  "..",
  "vault"
);

const db = new Database(databasePath);

// SQLite does not always enforce foreign keys unless this is enabled.
db.pragma("foreign_keys = ON");

// Create any missing tables.
const schema = fs.readFileSync(schemaPath, "utf8");
db.exec(schema);

/*
 * Database migrations
 *
 * Remove duplicate relationship records created before the unique
 * relationship index existed, then enforce uniqueness going forward.
 */

db.exec(`
  DELETE FROM lexeme_relations
  WHERE id NOT IN (
    SELECT MIN(id)
    FROM lexeme_relations
    GROUP BY
      source_lexeme_id,
      target_lexeme_id,
      relation_type
  );

  CREATE UNIQUE INDEX IF NOT EXISTS
    idx_unique_lexeme_relation
  ON lexeme_relations (
    source_lexeme_id,
    target_lexeme_id,
    relation_type
  );
`);

/*
 * Helpers
 */

function parseNonNegativeInteger(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    return null;
  }

  return number;
}

function normalizeLemma(lemma) {
  return lemma.trim().toLocaleLowerCase();
}

function parsePositiveInteger(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

function cleanRequiredText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const cleanedValue = value.trim();

  return cleanedValue || null;
}

/*
 * Basic server check
 */

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    database: "connected",
  });
});

/*
 * Languages
 */

app.get("/api/languages", (req, res) => {
  const languages = db
    .prepare(`
      SELECT id, code, name
      FROM languages
      ORDER BY code
    `)
    .all();

  res.json(languages);
});

app.post("/api/languages", (req, res) => {
  const code = cleanRequiredText(req.body.code);
  const name = cleanRequiredText(req.body.name);

  if (!code) {
    return res.status(400).json({
      error: "Language code is required.",
    });
  }

  if (!name) {
    return res.status(400).json({
      error: "Language name is required.",
    });
  }

  try {
    const result = db
      .prepare(`
        INSERT INTO languages (
          code,
          name
        )
        VALUES (?, ?)
      `)
      .run(code, name);

    const language = db
      .prepare(`
        SELECT id, code, name
        FROM languages
        WHERE id = ?
      `)
      .get(Number(result.lastInsertRowid));

    return res.status(201).json(language);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "A language with that code already exists.",
      });
    }

    console.error("Failed to create language:", error);

    return res.status(500).json({
      error: "The language could not be created.",
    });
  }
});

app.put("/api/languages/:id", (req, res) => {
  const languageId = parsePositiveInteger(req.params.id);

  if (!languageId) {
    return res.status(400).json({
      error: "Invalid language ID.",
    });
  }

  const existingLanguage = db
    .prepare(`
      SELECT id
      FROM languages
      WHERE id = ?
    `)
    .get(languageId);

  if (!existingLanguage) {
    return res.status(404).json({
      error: "Language not found.",
    });
  }

  const code = cleanRequiredText(req.body.code);
  const name = cleanRequiredText(req.body.name);

  if (!code) {
    return res.status(400).json({
      error: "Language code is required.",
    });
  }

  if (!name) {
    return res.status(400).json({
      error: "Language name is required.",
    });
  }

  try {
    db.prepare(`
      UPDATE languages
      SET
        code = ?,
        name = ?
      WHERE id = ?
    `).run(code, name, languageId);

    const updatedLanguage = db
      .prepare(`
        SELECT id, code, name
        FROM languages
        WHERE id = ?
      `)
      .get(languageId);

    return res.json(updatedLanguage);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "A language with that code already exists.",
      });
    }

    console.error("Failed to update language:", error);

    return res.status(500).json({
      error: "The language could not be updated.",
    });
  }
});

app.delete("/api/languages/:id", (req, res) => {
  const languageId = parsePositiveInteger(req.params.id);

  if (!languageId) {
    return res.status(400).json({
      error: "Invalid language ID.",
    });
  }

  const existingLanguage = db
    .prepare(`
      SELECT id, code, name
      FROM languages
      WHERE id = ?
    `)
    .get(languageId);

  if (!existingLanguage) {
    return res.status(404).json({
      error: "Language not found.",
    });
  }

  const usage = db
    .prepare(`
      SELECT COUNT(*) AS lexeme_count
      FROM lexemes
      WHERE language_id = ?
    `)
    .get(languageId);

  if (usage.lexeme_count > 0) {
    return res.status(409).json({
      error:
        `This language cannot be deleted because ` +
        `${usage.lexeme_count} lexeme` +
        `${usage.lexeme_count === 1 ? "" : "s"} use it.`,
    });
  }

  try {
    db.prepare(`
      DELETE FROM languages
      WHERE id = ?
    `).run(languageId);

    return res.json({
      id: languageId,
      code: existingLanguage.code,
      name: existingLanguage.name,
      message: "Language deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete language:", error);

    return res.status(500).json({
      error: "The language could not be deleted.",
    });
  }
});

/*
 * Ages
 */

app.get("/api/ages", (req, res) => {
  const ages = db
    .prepare(`
      SELECT id, code, name, sort_order
      FROM ages
      ORDER BY sort_order
    `)
    .all();

  res.json(ages);
});

app.post("/api/ages", (req, res) => {
  const code = cleanRequiredText(req.body.code);
  const name = cleanRequiredText(req.body.name);
  const sortOrder = parseNonNegativeInteger(
    req.body.sortOrder
  );

  if (!code) {
    return res.status(400).json({
      error: "Age code is required.",
    });
  }

  if (!name) {
    return res.status(400).json({
      error: "Age name is required.",
    });
  }

  if (sortOrder === null) {
    return res.status(400).json({
      error: "Sort order must be a non-negative integer.",
    });
  }

  try {
    const result = db
      .prepare(`
        INSERT INTO ages (
          code,
          name,
          sort_order
        )
        VALUES (?, ?, ?)
      `)
      .run(code, name, sortOrder);

    const age = db
      .prepare(`
        SELECT id, code, name, sort_order
        FROM ages
        WHERE id = ?
      `)
      .get(Number(result.lastInsertRowid));

    return res.status(201).json(age);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "An age with that code already exists.",
      });
    }

    console.error("Failed to create age:", error);

    return res.status(500).json({
      error: "The age could not be created.",
    });
  }
});

app.put("/api/ages/:id", (req, res) => {
  const ageId = parsePositiveInteger(req.params.id);

  if (!ageId) {
    return res.status(400).json({
      error: "Invalid age ID.",
    });
  }

  const existingAge = db
    .prepare(`
      SELECT id
      FROM ages
      WHERE id = ?
    `)
    .get(ageId);

  if (!existingAge) {
    return res.status(404).json({
      error: "Age not found.",
    });
  }

  const code = cleanRequiredText(req.body.code);
  const name = cleanRequiredText(req.body.name);
  const sortOrder = parseNonNegativeInteger(
    req.body.sortOrder
  );

  if (!code) {
    return res.status(400).json({
      error: "Age code is required.",
    });
  }

  if (!name) {
    return res.status(400).json({
      error: "Age name is required.",
    });
  }

  if (sortOrder === null) {
    return res.status(400).json({
      error: "Sort order must be a non-negative integer.",
    });
  }

  try {
    db.prepare(`
      UPDATE ages
      SET
        code = ?,
        name = ?,
        sort_order = ?
      WHERE id = ?
    `).run(code, name, sortOrder, ageId);

    const updatedAge = db
      .prepare(`
        SELECT id, code, name, sort_order
        FROM ages
        WHERE id = ?
      `)
      .get(ageId);

    return res.json(updatedAge);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "An age with that code already exists.",
      });
    }

    console.error("Failed to update age:", error);

    return res.status(500).json({
      error: "The age could not be updated.",
    });
  }
});

app.delete("/api/ages/:id", (req, res) => {
  const ageId = parsePositiveInteger(req.params.id);

  if (!ageId) {
    return res.status(400).json({
      error: "Invalid age ID.",
    });
  }

  const existingAge = db
    .prepare(`
      SELECT id, code, name, sort_order
      FROM ages
      WHERE id = ?
    `)
    .get(ageId);

  if (!existingAge) {
    return res.status(404).json({
      error: "Age not found.",
    });
  }

  const usage = db
    .prepare(`
      SELECT COUNT(*) AS lexeme_count
      FROM lexemes
      WHERE age_id = ?
    `)
    .get(ageId);

  if (usage.lexeme_count > 0) {
    return res.status(409).json({
      error:
        `This age cannot be deleted because ` +
        `${usage.lexeme_count} lexeme` +
        `${usage.lexeme_count === 1 ? "" : "s"} use it.`,
    });
  }

  try {
    db.prepare(`
      DELETE FROM ages
      WHERE id = ?
    `).run(ageId);

    return res.json({
      id: ageId,
      code: existingAge.code,
      name: existingAge.name,
      message: "Age deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete age:", error);

    return res.status(500).json({
      error: "The age could not be deleted.",
    });
  }
});

/*
 * Lexeme list
 */

app.get("/api/lexemes", (req, res) => {
  const lexemes = db
    .prepare(`
      SELECT
        lexemes.id,
        lexemes.lemma,
        lexemes.part_of_speech,
        lexemes.notes,
        languages.id AS language_id,
        languages.code AS language_code,
        languages.name AS language_name,
        ages.id AS age_id,
        ages.code AS age_code,
        GROUP_CONCAT(glosses.gloss, ' | ') AS glosses
      FROM lexemes
      JOIN languages
        ON lexemes.language_id = languages.id
      JOIN ages
        ON lexemes.age_id = ages.id
      LEFT JOIN glosses
        ON glosses.lexeme_id = lexemes.id
      GROUP BY lexemes.id
      ORDER BY languages.code, lexemes.lemma
    `)
    .all();

  res.json(lexemes);
});

/*
 * Single lexeme
 */

app.get("/api/lexemes/:id", (req, res) => {
  const lexemeId = parsePositiveInteger(req.params.id);

  if (!lexemeId) {
    return res.status(400).json({
      error: "Invalid lexeme ID.",
    });
  }

  const lexeme = db
    .prepare(`
      SELECT
        lexemes.id,
        lexemes.lemma,
        lexemes.normalized_lemma,
        lexemes.part_of_speech,
        lexemes.notes,
        lexemes.created_at,
        lexemes.updated_at,
        languages.id AS language_id,
        languages.code AS language_code,
        languages.name AS language_name,
        ages.id AS age_id,
        ages.code AS age_code,
        ages.name AS age_name
      FROM lexemes
      JOIN languages
        ON lexemes.language_id = languages.id
      JOIN ages
        ON lexemes.age_id = ages.id
      WHERE lexemes.id = ?
    `)
    .get(lexemeId);

  if (!lexeme) {
    return res.status(404).json({
      error: "Lexeme not found.",
    });
  }

  const glosses = db
    .prepare(`
      SELECT id, gloss, sense_order
      FROM glosses
      WHERE lexeme_id = ?
      ORDER BY sense_order, id
    `)
    .all(lexemeId);

  res.json({
    ...lexeme,
    glosses,
  });
});

/*
 * Lexeme relationships
 *
 * For parent relationships:
 * source_lexeme_id = parent
 * target_lexeme_id = daughter
 */

app.get("/api/lexemes/:id/relations", (req, res) => {
  const lexemeId = parsePositiveInteger(req.params.id);

  if (!lexemeId) {
    return res.status(400).json({
      error: "Invalid lexeme ID.",
    });
  }

  const lexemeExists = db
    .prepare(`
      SELECT id
      FROM lexemes
      WHERE id = ?
    `)
    .get(lexemeId);

  if (!lexemeExists) {
    return res.status(404).json({
      error: "Lexeme not found.",
    });
  }

  const parents = db
    .prepare(`
      SELECT
        relations.id AS relation_id,
        parent.id,
        parent.lemma,
        parent.part_of_speech,
        languages.code AS language_code,
        ages.code AS age_code,
        GROUP_CONCAT(glosses.gloss, ' | ') AS glosses,
        relations.notes AS relationship_notes
      FROM lexeme_relations AS relations
      JOIN lexemes AS parent
        ON relations.source_lexeme_id = parent.id
      JOIN languages
        ON parent.language_id = languages.id
      JOIN ages
        ON parent.age_id = ages.id
      LEFT JOIN glosses
        ON glosses.lexeme_id = parent.id
      WHERE relations.target_lexeme_id = ?
        AND relations.relation_type = 'parent'
      GROUP BY relations.id
      ORDER BY ages.sort_order, parent.lemma
    `)
    .all(lexemeId);

  const daughters = db
    .prepare(`
      SELECT
        relations.id AS relation_id,
        daughter.id,
        daughter.lemma,
        daughter.part_of_speech,
        languages.code AS language_code,
        ages.code AS age_code,
        GROUP_CONCAT(glosses.gloss, ' | ') AS glosses,
        relations.notes AS relationship_notes
      FROM lexeme_relations AS relations
      JOIN lexemes AS daughter
        ON relations.target_lexeme_id = daughter.id
      JOIN languages
        ON daughter.language_id = languages.id
      JOIN ages
        ON daughter.age_id = ages.id
      LEFT JOIN glosses
        ON glosses.lexeme_id = daughter.id
      WHERE relations.source_lexeme_id = ?
        AND relations.relation_type = 'parent'
      GROUP BY relations.id
      ORDER BY ages.sort_order, daughter.lemma
    `)
    .all(lexemeId);

  res.json({
    parents,
    daughters,
  });
});

// Create relationship between two lexemes (parent -> daughter)
app.post("/api/lexeme-relations", (req, res) => {
  const {
    parentLexemeId,
    daughterLexemeId,
    notes,
  } = req.body;

  const parsedParentId =
    parsePositiveInteger(parentLexemeId);

  const parsedDaughterId =
    parsePositiveInteger(daughterLexemeId);

  if (!parsedParentId) {
    return res.status(400).json({
      error: "A valid parent lexeme ID is required.",
    });
  }

  if (!parsedDaughterId) {
    return res.status(400).json({
      error: "A valid daughter lexeme ID is required.",
    });
  }

  if (parsedParentId === parsedDaughterId) {
    return res.status(400).json({
      error: "A lexeme cannot be its own parent.",
    });
  }

  const parentLexeme = db
    .prepare(`
      SELECT id, lemma
      FROM lexemes
      WHERE id = ?
    `)
    .get(parsedParentId);

  if (!parentLexeme) {
    return res.status(404).json({
      error: "Parent lexeme not found.",
    });
  }

  const daughterLexeme = db
    .prepare(`
      SELECT id, lemma
      FROM lexemes
      WHERE id = ?
    `)
    .get(parsedDaughterId);

  if (!daughterLexeme) {
    return res.status(404).json({
      error: "Daughter lexeme not found.",
    });
  }

  try {
    const result = db
      .prepare(`
        INSERT OR IGNORE INTO lexeme_relations (
          source_lexeme_id,
          target_lexeme_id,
          relation_type,
          notes
        )
        VALUES (?, ?, 'parent', ?)
      `)
      .run(
        parsedParentId,
        parsedDaughterId,
        typeof notes === "string" && notes.trim()
          ? notes.trim()
          : null
      );

    if (result.changes === 0) {
      return res.status(409).json({
        error: "That parent/daughter relationship already exists.",
      });
    }

    return res.status(201).json({
      id: Number(result.lastInsertRowid),
      parent: parentLexeme,
      daughter: daughterLexeme,
      message: "Lexeme relationship created successfully.",
    });
  } catch (error) {
    console.error(
      "Failed to create lexeme relationship:",
      error
    );

    return res.status(500).json({
      error: "The lexeme relationship could not be created.",
    });
  }
});

/*
 * Create lexeme
 */

const createLexemeTransaction = db.transaction((data) => {
  const lexemeResult = db
    .prepare(`
      INSERT INTO lexemes (
        lemma,
        normalized_lemma,
        language_id,
        age_id,
        part_of_speech,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      data.lemma,
      normalizeLemma(data.lemma),
      data.languageId,
      data.ageId,
      data.partOfSpeech || null,
      data.notes || null
    );

  const lexemeId = Number(lexemeResult.lastInsertRowid);

  const insertGloss = db.prepare(`
    INSERT INTO glosses (
      lexeme_id,
      gloss,
      sense_order
    )
    VALUES (?, ?, ?)
  `);

  data.glosses.forEach((gloss, index) => {
    insertGloss.run(lexemeId, gloss, index + 1);
  });

  const insertRelationship = db.prepare(`
    INSERT INTO lexeme_relations (
      source_lexeme_id,
      target_lexeme_id,
      relation_type,
      notes
    )
    VALUES (?, ?, 'parent', NULL)
  `);

  data.parentLexemeIds.forEach((parentLexemeId) => {
    insertRelationship.run(
      parentLexemeId,
      lexemeId
    );
  });

  data.daughterLexemeIds.forEach((daughterLexemeId) => {
    insertRelationship.run(
      lexemeId,
      daughterLexemeId
    );
  });

  return lexemeId;
});

app.post("/api/lexemes", (req, res) => {
  const {
    lemma,
    glosses,
    languageId,
    ageId,
    partOfSpeech,
    notes,
    parentLexemeIds = [],
    daughterLexemeIds = [],
  } = req.body;

  if (typeof lemma !== "string" || lemma.trim() === "") {
    return res.status(400).json({
      error: "Lemma is required.",
    });
  }

  if (!Array.isArray(glosses) || glosses.length === 0) {
    return res.status(400).json({
      error: "At least one gloss is required.",
    });
  }

  const cleanedGlosses = glosses
    .filter((gloss) => typeof gloss === "string")
    .map((gloss) => gloss.trim())
    .filter(Boolean);

  if (cleanedGlosses.length === 0) {
    return res.status(400).json({
      error: "At least one non-empty gloss is required.",
    });
  }

  const parsedLanguageId = parsePositiveInteger(languageId);
  const parsedAgeId = parsePositiveInteger(ageId);

  if (!parsedLanguageId) {
    return res.status(400).json({
      error: "A valid language ID is required.",
    });
  }

  if (!parsedAgeId) {
    return res.status(400).json({
      error: "A valid age ID is required.",
    });
  }

  const languageExists = db
    .prepare(`
      SELECT id
      FROM languages
      WHERE id = ?
    `)
    .get(parsedLanguageId);

  if (!languageExists) {
    return res.status(400).json({
      error: "The selected language does not exist.",
    });
  }

  const ageExists = db
    .prepare(`
      SELECT id
      FROM ages
      WHERE id = ?
    `)
    .get(parsedAgeId);

  if (!ageExists) {
    return res.status(400).json({
      error: "The selected age does not exist.",
    });
  }

  if (!Array.isArray(parentLexemeIds)) {
    return res.status(400).json({
      error: "Parent lexeme IDs must be an array.",
    });
  }

  if (!Array.isArray(daughterLexemeIds)) {
    return res.status(400).json({
      error: "Daughter lexeme IDs must be an array.",
    });
  }

  const cleanedParentIds = [
    ...new Set(
      parentLexemeIds
        .map(parsePositiveInteger)
        .filter(Boolean)
    ),
  ];

  const cleanedDaughterIds = [
    ...new Set(
      daughterLexemeIds
        .map(parsePositiveInteger)
        .filter(Boolean)
    ),
  ];

  const overlappingIds = cleanedParentIds.filter(
    (id) => cleanedDaughterIds.includes(id)
  );

  if (overlappingIds.length > 0) {
    return res.status(400).json({
      error:
        "The same lexeme cannot be selected as both a parent and a daughter.",
    });
  }

  const requestedRelationshipIds = [
    ...new Set([
      ...cleanedParentIds,
      ...cleanedDaughterIds,
    ]),
  ];

  if (requestedRelationshipIds.length > 0) {
    const placeholders = requestedRelationshipIds
      .map(() => "?")
      .join(", ");

    const existingRows = db
      .prepare(`
        SELECT id
        FROM lexemes
        WHERE id IN (${placeholders})
      `)
      .all(...requestedRelationshipIds);

    if (
      existingRows.length !==
      requestedRelationshipIds.length
    ) {
      return res.status(400).json({
        error:
          "One or more selected relationship lexemes do not exist.",
      });
    }
  }

  try {
    const lexemeId = createLexemeTransaction({
      lemma: lemma.trim(),
      glosses: cleanedGlosses,
      languageId: parsedLanguageId,
      ageId: parsedAgeId,
      partOfSpeech:
        typeof partOfSpeech === "string"
          ? partOfSpeech.trim()
          : "",
      notes:
        typeof notes === "string"
          ? notes.trim()
          : "",
      parentLexemeIds: cleanedParentIds,
      daughterLexemeIds: cleanedDaughterIds,
    });

    const createdLexeme = db
      .prepare(`
        SELECT
          lexemes.id,
          lexemes.lemma,
          lexemes.part_of_speech,
          lexemes.notes,
          languages.code AS language_code,
          ages.code AS age_code
        FROM lexemes
        JOIN languages
          ON lexemes.language_id = languages.id
        JOIN ages
          ON lexemes.age_id = ages.id
        WHERE lexemes.id = ?
      `)
      .get(lexemeId);

    return res.status(201).json(createdLexeme);
  } catch (error) {
    console.error("Failed to create lexeme:", error);

    return res.status(500).json({
      error: "The lexeme could not be created.",
    });
  }
});

const updateLexemeTransaction = db.transaction((lexemeId, data) => {
  db.prepare(`
    UPDATE lexemes
    SET
      lemma = ?,
      normalized_lemma = ?,
      language_id = ?,
      age_id = ?,
      part_of_speech = ?,
      notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    data.lemma,
    normalizeLemma(data.lemma),
    data.languageId,
    data.ageId,
    data.partOfSpeech || null,
    data.notes || null,
    lexemeId
  );

  // For now, replacing the gloss list is simpler and safer than
  // attempting to reconcile individual gloss records.
  db.prepare(`
    DELETE FROM glosses
    WHERE lexeme_id = ?
  `).run(lexemeId);

  const insertGloss = db.prepare(`
    INSERT INTO glosses (
      lexeme_id,
      gloss,
      sense_order
    )
    VALUES (?, ?, ?)
  `);

  data.glosses.forEach((gloss, index) => {
    insertGloss.run(lexemeId, gloss, index + 1);
  });
});

app.put("/api/lexemes/:id", (req, res) => {
  const lexemeId = parsePositiveInteger(req.params.id);

  if (!lexemeId) {
    return res.status(400).json({
      error: "Invalid lexeme ID.",
    });
  }

  const existingLexeme = db
    .prepare(`
      SELECT id
      FROM lexemes
      WHERE id = ?
    `)
    .get(lexemeId);

  if (!existingLexeme) {
    return res.status(404).json({
      error: "Lexeme not found.",
    });
  }

  const {
    lemma,
    glosses,
    languageId,
    ageId,
    partOfSpeech,
    notes,
  } = req.body;

  if (typeof lemma !== "string" || lemma.trim() === "") {
    return res.status(400).json({
      error: "Lemma is required.",
    });
  }

  if (!Array.isArray(glosses) || glosses.length === 0) {
    return res.status(400).json({
      error: "At least one gloss is required.",
    });
  }

  const cleanedGlosses = glosses
    .filter((gloss) => typeof gloss === "string")
    .map((gloss) => gloss.trim())
    .filter(Boolean);

  if (cleanedGlosses.length === 0) {
    return res.status(400).json({
      error: "At least one non-empty gloss is required.",
    });
  }

  const parsedLanguageId = parsePositiveInteger(languageId);
  const parsedAgeId = parsePositiveInteger(ageId);

  if (!parsedLanguageId) {
    return res.status(400).json({
      error: "A valid language ID is required.",
    });
  }

  if (!parsedAgeId) {
    return res.status(400).json({
      error: "A valid age ID is required.",
    });
  }

  const languageExists = db
    .prepare(`
      SELECT id
      FROM languages
      WHERE id = ?
    `)
    .get(parsedLanguageId);

  if (!languageExists) {
    return res.status(400).json({
      error: "The selected language does not exist.",
    });
  }

  const ageExists = db
    .prepare(`
      SELECT id
      FROM ages
      WHERE id = ?
    `)
    .get(parsedAgeId);

  if (!ageExists) {
    return res.status(400).json({
      error: "The selected age does not exist.",
    });
  }

  try {
    updateLexemeTransaction(lexemeId, {
      lemma: lemma.trim(),
      glosses: cleanedGlosses,
      languageId: parsedLanguageId,
      ageId: parsedAgeId,
      partOfSpeech:
        typeof partOfSpeech === "string"
          ? partOfSpeech.trim()
          : "",
      notes:
        typeof notes === "string"
          ? notes.trim()
          : "",
    });

    return res.json({
      id: lexemeId,
      message: "Lexeme updated successfully.",
    });
  } catch (error) {
    console.error("Failed to update lexeme:", error);

    return res.status(500).json({
      error: "The lexeme could not be updated.",
    });
  }
});

app.delete("/api/lexeme-relations/:id", (req, res) => {
  const relationId = parsePositiveInteger(req.params.id);

  if (!relationId) {
    return res.status(400).json({
      error: "Invalid relationship ID.",
    });
  }

  const existingRelation = db
    .prepare(`
      SELECT id
      FROM lexeme_relations
      WHERE id = ?
    `)
    .get(relationId);

  if (!existingRelation) {
    return res.status(404).json({
      error: "Relationship not found.",
    });
  }

  try {
    db.prepare(`
      DELETE FROM lexeme_relations
      WHERE id = ?
    `).run(relationId);

    return res.json({
      id: relationId,
      message: "Relationship deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete relationship:", error);

    return res.status(500).json({
      error: "The relationship could not be deleted.",
    });
  }
});

const deleteLexemeTransaction = db.transaction((lexemeId) => {
  // Remove every relationship where this lexeme is either
  // the parent or the daughter.
  db.prepare(`
    DELETE FROM lexeme_relations
    WHERE source_lexeme_id = ?
       OR target_lexeme_id = ?
  `).run(lexemeId, lexemeId);

  // Remove all glosses belonging to the lexeme.
  db.prepare(`
    DELETE FROM glosses
    WHERE lexeme_id = ?
  `).run(lexemeId);

  // Finally remove the lexeme itself.
  db.prepare(`
    DELETE FROM lexemes
    WHERE id = ?
  `).run(lexemeId);
});

app.delete("/api/lexemes/:id", (req, res) => {
  const lexemeId = parsePositiveInteger(req.params.id);

  if (!lexemeId) {
    return res.status(400).json({
      error: "Invalid lexeme ID.",
    });
  }

  const existingLexeme = db
    .prepare(`
      SELECT id, lemma
      FROM lexemes
      WHERE id = ?
    `)
    .get(lexemeId);

  if (!existingLexeme) {
    return res.status(404).json({
      error: "Lexeme not found.",
    });
  }

  try {
    deleteLexemeTransaction(lexemeId);

    return res.json({
      id: lexemeId,
      lemma: existingLexeme.lemma,
      message: "Lexeme deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete lexeme:", error);

    return res.status(500).json({
      error: "The lexeme could not be deleted.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Lexicon server running at http://localhost:${PORT}`);
});