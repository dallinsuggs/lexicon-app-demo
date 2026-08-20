const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const { AsyncLocalStorage } = require("async_hooks");

const {
  createSession,
  getSessionDatabase,
  resetSessionDatabase,
} = require("./demoDatabaseManager");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const databasePath = path.join(
  __dirname,
  "..",
  "data",
  "lexicon.db"
);

const schemaPath = path.join(__dirname, "schema.sql");

const vaultPath = path.resolve(
  __dirname,
  "..",
  "..",
  "vault"
);

/*
 * Every API route registered below this point uses
 * the visitor-specific demo database.
 *
 * /api/demo/session is the one exception because it
 * must be accessible before a session exists.
 */
app.use("/api", attachDemoDatabase);
const baseDb = new Database(databasePath);

baseDb.pragma("foreign_keys = ON");

const schema = fs.readFileSync(schemaPath, "utf8");
baseDb.exec(schema);

/*
 * Every API request runs inside an AsyncLocalStorage context.
 * The db facade below resolves to the database selected for that
 * request. This lets the existing route code continue using
 * db.prepare(...), db.transaction(...), etc. without a global
 * mutable database connection that could leak between visitors.
 */
const databaseContext = new AsyncLocalStorage();

function getActiveDatabase() {
  return databaseContext.getStore()?.db || baseDb;
}

const db = {
  prepare(...args) {
    return getActiveDatabase().prepare(...args);
  },

  exec(...args) {
    return getActiveDatabase().exec(...args);
  },

  pragma(...args) {
    return getActiveDatabase().pragma(...args);
  },

  transaction(callback) {
    return (...args) => {
      const activeDb = getActiveDatabase();

      const transaction = activeDb.transaction(
        (...transactionArgs) =>
          callback(...transactionArgs)
      );

      return transaction(...args);
    };
  },
};

function requireDemoSession(
  req,
  res,
  next
) {
  if (!req.demoSessionId || !req.db) {
    return res.status(401).json({
      error:
        "A valid demo session is required.",
    });
  }

  next();
}

function attachDemoDatabase(
  req,
  res,
  next
) {
  /*
   * Session creation must remain reachable even when a browser
   * has no session yet, or is holding an expired session ID.
   */
  if (req.path === "/demo/session") {
    next();
    return;
  }

  const sessionId =
    req.get("X-Demo-Session");

  if (!sessionId) {
    return res.status(401).json({
      error:
        "A demo session is required.",
    });
  }

  const sessionDb =
    getSessionDatabase(sessionId);

  if (!sessionDb) {
    return res.status(401).json({
      error:
        "The demo session is invalid or has expired.",
    });
  }

  req.demoSessionId = sessionId;
  req.db = sessionDb;

  databaseContext.run(
    {
      db: sessionDb,
      sessionId,
    },
    next
  );
}

/* =========================================================
   Helpers
   ========================================================= */

function ensureLexemeReviewColumn() {
  const columns = db
    .prepare(`
      PRAGMA table_info(lexemes)
    `)
    .all();

  const hasNeedsReviewColumn =
    columns.some(
      (column) =>
        column.name === "needs_review"
    );

  if (!hasNeedsReviewColumn) {
    db.exec(`
      ALTER TABLE lexemes
      ADD COLUMN needs_review INTEGER
      NOT NULL DEFAULT 0
      CHECK (needs_review IN (0, 1))
    `);

    console.log(
      "Database migration complete: added lexemes.needs_review."
    );
  }
}

ensureLexemeReviewColumn();

function ensureLexemeClassSchema() {
  /*
   * schema.sql creates lexeme_classes before this
   * migration runs. This check handles the nullable
   * foreign-key column on existing lexemes tables.
   */
  const lexemeColumns = db
    .prepare(`
      PRAGMA table_info(lexemes)
    `)
    .all();

  const hasLexemeClassId =
    lexemeColumns.some(
      (column) =>
        column.name === "lexeme_class_id"
    );

  if (!hasLexemeClassId) {
    db.exec(`
      ALTER TABLE lexemes
      ADD COLUMN lexeme_class_id INTEGER
      REFERENCES lexeme_classes(id)
      ON DELETE SET NULL
    `);

    console.log(
      "Database migration complete: added lexemes.lexeme_class_id."
    );
  }

  /*
   * Create this index only after the column definitely
   * exists. This is safe on every later server launch.
   */
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_lexemes_class
    ON lexemes(lexeme_class_id)
  `);
}

ensureLexemeClassSchema();

function parsePositiveInteger(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

function parseNonNegativeInteger(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
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

function cleanOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const cleanedValue = value.trim();

  return cleanedValue || null;
}

function resolveVaultFile(relativePath) {
  const cleanedPath = cleanRequiredText(relativePath);

  if (!cleanedPath) {
    return null;
  }

  /*
   * Normalize both slash styles so paths copied from Windows
   * and paths written with forward slashes behave consistently.
   */
  const normalizedRelativePath = cleanedPath.replace(
    /[\\/]+/g,
    path.sep
  );

  /*
   * Treat stored paths as vault-relative even if they begin
   * with a slash.
   */
  const pathWithoutLeadingSeparators =
    normalizedRelativePath.replace(
      new RegExp(`^\\${path.sep}+`),
      ""
    );

  const resolvedPath = path.resolve(
    vaultPath,
    pathWithoutLeadingSeparators
  );

  /*
   * The resolved file must remain inside the vault.
   * This blocks paths such as ../../some-file.
   */
  const relativeToVault = path.relative(
    vaultPath,
    resolvedPath
  );

  const escapesVault =
    relativeToVault.startsWith("..") ||
    path.isAbsolute(relativeToVault);

  if (escapesVault) {
    return null;
  }

  return {
    absolutePath: resolvedPath,
    relativePath: relativeToVault
      .split(path.sep)
      .join("/"),
  };
}

const LANGUAGE_STAGE_RELATION_TYPES = [
  {
    code: "continuation",
    name: "Continuation",
    category: "genetic",
    description:
      "The target stage is the primary historical continuation of the source stage.",
  },
  {
    code: "split",
    name: "Branching split",
    category: "genetic",
    description:
      "The target stage developed as a distinct branch from the source stage.",
  },
  {
    code: "descent",
    name: "General descent",
    category: "genetic",
    description:
      "The target descends genetically from the source without a more specific classification.",
  },
  {
    code: "mixed_language_source",
    name: "Mixed-language source",
    category: "genetic",
    description:
      "The source contributed directly to the formation of a new mixed language.",
  },
  {
    code: "pidginization",
    name: "Pidginization source",
    category: "genetic",
    description:
      "The source contributed to the formation of a pidgin or trade language.",
  },
  {
    code: "creolization",
    name: "Creolization source",
    category: "genetic",
    description:
      "The source contributed to the formation or nativization of a creole.",
  },
  {
    code: "koineization",
    name: "Koineization source",
    category: "genetic",
    description:
      "The source contributed to a new leveled or merged koine variety.",
  },
  {
    code: "substrate_influence",
    name: "Substrate influence",
    category: "contact",
    description:
      "The source influenced the target as a socially displaced or underlying language.",
  },
  {
    code: "superstrate_influence",
    name: "Superstrate influence",
    category: "contact",
    description:
      "The source influenced the target from a socially dominant position.",
  },
  {
    code: "adstrate_influence",
    name: "Adstrate influence",
    category: "contact",
    description:
      "The source influenced the target through sustained contact without clear dominance.",
  },
  {
    code: "contact_influence",
    name: "General contact influence",
    category: "contact",
    description:
      "The source influenced the target through language contact.",
  },
  {
    code: "structural_influence",
    name: "Structural influence",
    category: "contact",
    description:
      "The source influenced the target's grammar, phonology, or other structural features.",
  },
];

const LANGUAGE_STAGE_RELATION_TYPE_CODES = new Set(
  LANGUAGE_STAGE_RELATION_TYPES.map((type) => type.code)
);

const LEXEME_RELATION_TYPES = [
  {
    code: "inherited_from",
    name: "Inherited from",
    category: "genetic",
    isSymmetrical: false,
    description:
      "The target lexeme is historically inherited from the source lexeme.",
  },
  {
    code: "derived_from",
    name: "Derived from",
    category: "derivational",
    isSymmetrical: false,
    description:
      "The target lexeme was morphologically or lexically derived from the source.",
  },
  {
    code: "compound_component",
    name: "Compound component",
    category: "derivational",
    isSymmetrical: false,
    description:
      "The source lexeme contributed as a component of the target compound.",
  },
  {
    code: "analogically_remodeled_from",
    name: "Analogically remodeled from",
    category: "derivational",
    isSymmetrical: false,
    description:
      "The target was reshaped through analogy with or from the source.",
  },
  {
    code: "borrowed_from",
    name: "Borrowed from",
    category: "contact",
    isSymmetrical: false,
    description:
      "The target lexeme was borrowed from the source lexeme.",
  },
  {
    code: "calqued_from",
    name: "Calqued from",
    category: "contact",
    isSymmetrical: false,
    description:
      "The target was formed as a loan translation of the source.",
  },
  {
    code: "semantic_influence_from",
    name: "Semantic influence from",
    category: "contact",
    isSymmetrical: false,
    description:
      "The source influenced the target's meaning without necessarily supplying its form.",
  },
  {
    code: "phonological_influence_from",
    name: "Phonological influence from",
    category: "contact",
    isSymmetrical: false,
    description:
      "The source influenced the target's phonological form.",
  },
  {
    code: "cognate_with",
    name: "Cognate with",
    category: "association",
    isSymmetrical: true,
    description:
      "The two lexemes share historical ancestry without one directly descending from the other.",
  },
  {
    code: "related_form",
    name: "Related form",
    category: "association",
    isSymmetrical: true,
    description:
      "The two lexemes are associated, but the precise historical relationship is not otherwise classified.",
  },
];

const LEXEME_RELATION_TYPE_CODES = new Set(
  LEXEME_RELATION_TYPES.map((type) => type.code)
);

const SYMMETRIC_LEXEME_RELATION_TYPE_CODES =
  new Set(
    LEXEME_RELATION_TYPES
      .filter((type) => type.isSymmetrical)
      .map((type) => type.code)
  );

const DIRECTED_LEXEME_RELATION_TYPE_CODES =
  new Set(
    LEXEME_RELATION_TYPES
      .filter((type) => !type.isSymmetrical)
      .map((type) => type.code)
  );

function normalizeLemma(lemma) {
  return lemma.trim().toLocaleLowerCase();
}

function normalizeLexemeClassName(name) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

/*
 * Every API route registered below this point automatically uses
 * the visitor-specific session database when X-Demo-Session is
 * present. Routes without a session temporarily fall back to
 * lexicon.db until the frontend session bootstrap is added.
 */
app.use("/api", attachDemoDatabase);

/* =========================================================
    Demo Session Endpoint
  ========================================================= */

app.post("/api/demo/session", (req, res) => {
  try {
    const sessionId = createSession();

    const sessionDb =
      getSessionDatabase(sessionId);

    if (!sessionDb) {
      throw new Error(
        "Session database could not be opened."
      );
    }

    res.status(201).json({
      sessionId,
    });
  } catch (error) {
    console.error(
      "Failed to create demo session:",
      error
    );

    res.status(500).json({
      error:
        "Demo session could not be created.",
    });
  }
});

app.post(
  "/api/demo/reset",
  requireDemoSession,
  (req, res) => {
    try {
      const wasReset =
        resetSessionDatabase(
          req.demoSessionId
        );

      if (!wasReset) {
        return res.status(404).json({
          error:
            "The demo session could not be found.",
        });
      }

      return res.json({
        message:
          "Demo data restored successfully.",
      });
    } catch (error) {
      console.error(
        "Failed to restore demo data:",
        error
      );

      return res.status(500).json({
        error:
          "The demo data could not be restored.",
      });
    }
  }
);

app.get(
  "/api/demo/session-test",
  requireDemoSession,
  (req, res) => {
    const lexemeCount =
      req.db
        .prepare(`
          SELECT COUNT(*) AS total
          FROM lexemes
        `)
        .get();

    const stageCount =
      req.db
        .prepare(`
          SELECT COUNT(*) AS total
          FROM language_stages
        `)
        .get();

    return res.json({
      sessionId:
        req.demoSessionId,

      lexemeCount:
        lexemeCount.total,

      stageCount:
        stageCount.total,
    });
  }
);

/* =========================================================
   Stage-specific lexeme classes
   ========================================================= */

app.get(
  "/api/stages/:id/lexeme-classes",
  (req, res) => {
    const stageId = parsePositiveInteger(
      req.params.id
    );

    if (!stageId) {
      return res.status(400).json({
        error:
          "A valid language-stage ID is required.",
      });
    }

    const stage = db
      .prepare(`
        SELECT
          id,
          code,
          name
        FROM language_stages
        WHERE id = ?
      `)
      .get(stageId);

    if (!stage) {
      return res.status(404).json({
        error: "Language stage not found.",
      });
    }

    const lexemeClasses = db
      .prepare(`
        SELECT
          lexeme_class.id,
          lexeme_class.language_stage_id,
          lexeme_class.name,
          lexeme_class.normalized_name,
          lexeme_class.description,
          lexeme_class.created_at,
          lexeme_class.updated_at,

          COUNT(lexeme.id) AS lexeme_count

        FROM lexeme_classes AS lexeme_class

        LEFT JOIN lexemes AS lexeme
          ON lexeme.lexeme_class_id =
            lexeme_class.id

        WHERE
          lexeme_class.language_stage_id = ?

        GROUP BY lexeme_class.id

        ORDER BY
          lexeme_class.normalized_name,
          lexeme_class.id
      `)
      .all(stageId);

    return res.json({
      stage,
      classes: lexemeClasses,
    });
  }
);

app.post(
  "/api/stages/:id/lexeme-classes",
  (req, res) => {
    const stageId = parsePositiveInteger(
      req.params.id
    );

    if (!stageId) {
      return res.status(400).json({
        error:
          "A valid language-stage ID is required.",
      });
    }

    const stage = db
      .prepare(`
        SELECT
          id,
          code,
          name
        FROM language_stages
        WHERE id = ?
      `)
      .get(stageId);

    if (!stage) {
      return res.status(404).json({
        error: "Language stage not found.",
      });
    }

    const name = cleanRequiredText(
      req.body.name
    );

    const description = cleanOptionalText(
      req.body.description
    );

    if (!name) {
      return res.status(400).json({
        error:
          "Lexeme-class name is required.",
      });
    }

    const normalizedName =
      normalizeLexemeClassName(name);

    try {
      const result = db
        .prepare(`
          INSERT INTO lexeme_classes (
            language_stage_id,
            name,
            normalized_name,
            description
          )
          VALUES (?, ?, ?, ?)
        `)
        .run(
          stageId,
          name,
          normalizedName,
          description
        );

      const lexemeClass = db
        .prepare(`
          SELECT
            id,
            language_stage_id,
            name,
            normalized_name,
            description,
            created_at,
            updated_at,

            0 AS lexeme_count

          FROM lexeme_classes
          WHERE id = ?
        `)
        .get(
          Number(result.lastInsertRowid)
        );

      return res.status(201).json(
        lexemeClass
      );
    } catch (error) {
      if (
        error.code ===
        "SQLITE_CONSTRAINT_UNIQUE"
      ) {
        return res.status(409).json({
          error:
            "That language stage already has a lexeme class with this name.",
        });
      }

      console.error(
        "Failed to create lexeme class:",
        error
      );

      return res.status(500).json({
        error:
          "The lexeme class could not be created.",
      });
    }
  }
);

app.put(
  "/api/lexeme-classes/:id",
  (req, res) => {
    const lexemeClassId =
      parsePositiveInteger(req.params.id);

    if (!lexemeClassId) {
      return res.status(400).json({
        error:
          "A valid lexeme-class ID is required.",
      });
    }

    const existingClass = db
      .prepare(`
        SELECT
          id,
          language_stage_id,
          name
        FROM lexeme_classes
        WHERE id = ?
      `)
      .get(lexemeClassId);

    if (!existingClass) {
      return res.status(404).json({
        error: "Lexeme class not found.",
      });
    }

    const name = cleanRequiredText(
      req.body.name
    );

    const description = cleanOptionalText(
      req.body.description
    );

    if (!name) {
      return res.status(400).json({
        error:
          "Lexeme-class name is required.",
      });
    }

    const normalizedName =
      normalizeLexemeClassName(name);

    try {
      db.prepare(`
        UPDATE lexeme_classes
        SET
          name = ?,
          normalized_name = ?,
          description = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        name,
        normalizedName,
        description,
        lexemeClassId
      );

      const updatedClass = db
        .prepare(`
          SELECT
            lexeme_class.id,
            lexeme_class.language_stage_id,
            lexeme_class.name,
            lexeme_class.normalized_name,
            lexeme_class.description,
            lexeme_class.created_at,
            lexeme_class.updated_at,

            COUNT(lexeme.id) AS lexeme_count

          FROM lexeme_classes AS lexeme_class

          LEFT JOIN lexemes AS lexeme
            ON lexeme.lexeme_class_id =
              lexeme_class.id

          WHERE lexeme_class.id = ?

          GROUP BY lexeme_class.id
        `)
        .get(lexemeClassId);

      return res.json(updatedClass);
    } catch (error) {
      if (
        error.code ===
        "SQLITE_CONSTRAINT_UNIQUE"
      ) {
        return res.status(409).json({
          error:
            "That language stage already has a lexeme class with this name.",
        });
      }

      console.error(
        "Failed to update lexeme class:",
        error
      );

      return res.status(500).json({
        error:
          "The lexeme class could not be updated.",
      });
    }
  }
);

app.delete(
  "/api/lexeme-classes/:id",
  (req, res) => {
    const lexemeClassId =
      parsePositiveInteger(req.params.id);

    if (!lexemeClassId) {
      return res.status(400).json({
        error:
          "A valid lexeme-class ID is required.",
      });
    }

    const lexemeClass = db
      .prepare(`
        SELECT
          lexeme_class.id,
          lexeme_class.language_stage_id,
          lexeme_class.name,

          stage.code AS stage_code,

          (
            SELECT COUNT(*)
            FROM lexemes
            WHERE lexemes.lexeme_class_id =
              lexeme_class.id
          ) AS lexeme_count

        FROM lexeme_classes AS lexeme_class

        JOIN language_stages AS stage
          ON stage.id =
            lexeme_class.language_stage_id

        WHERE lexeme_class.id = ?
      `)
      .get(lexemeClassId);

    if (!lexemeClass) {
      return res.status(404).json({
        error: "Lexeme class not found.",
      });
    }

    try {
      db.prepare(`
        DELETE FROM lexeme_classes
        WHERE id = ?
      `).run(lexemeClassId);

      return res.json({
        id: lexemeClass.id,
        name: lexemeClass.name,
        stageCode:
          lexemeClass.stage_code,

        unclassifiedLexemeCount:
          lexemeClass.lexeme_count,

        message:
          `"${lexemeClass.name}" was deleted. ` +
          `${lexemeClass.lexeme_count} lexeme` +
          `${
            lexemeClass.lexeme_count === 1
              ? " is"
              : "s are"
          } now unclassified.`,
      });
    } catch (error) {
      console.error(
        "Failed to delete lexeme class:",
        error
      );

      return res.status(500).json({
        error:
          "The lexeme class could not be deleted.",
      });
    }
  }
);

app.get(
  "/api/lexeme-classes/:id",
  (req, res) => {
    const lexemeClassId =
      parsePositiveInteger(req.params.id);

    if (!lexemeClassId) {
      return res.status(400).json({
        error:
          "A valid lexeme-class ID is required.",
      });
    }

    const lexemeClass = db
      .prepare(`
        SELECT
          lexeme_class.id,
          lexeme_class.language_stage_id,
          lexeme_class.name,
          lexeme_class.normalized_name,
          lexeme_class.description,
          lexeme_class.created_at,
          lexeme_class.updated_at,

          stage.code AS stage_code,
          stage.name AS stage_name,

          COUNT(lexeme.id) AS lexeme_count

        FROM lexeme_classes AS lexeme_class

        JOIN language_stages AS stage
          ON stage.id =
            lexeme_class.language_stage_id

        LEFT JOIN lexemes AS lexeme
          ON lexeme.lexeme_class_id =
            lexeme_class.id

        WHERE lexeme_class.id = ?

        GROUP BY lexeme_class.id
      `)
      .get(lexemeClassId);

    if (!lexemeClass) {
      return res.status(404).json({
        error: "Lexeme class not found.",
      });
    }

    return res.json(lexemeClass);
  }
);

/* =========================================================
   Lexeme relationship types
   ========================================================= */

app.get("/api/lexeme-relation-types", (req, res) => {
  res.json(LEXEME_RELATION_TYPES);
});

/* =========================================================
   Lexemes
   ========================================================= */

app.get("/api/lexemes", (req, res) => {
  const includeArchived =
    req.query.includeArchived === "true";

  let needsReview = null;

  if (req.query.needsReview === "true") {
    needsReview = true;
  } else if (req.query.needsReview === "false") {
    needsReview = false;
  }

  let lexemeClassFilter = null;
  let lexemeClassId = null;

  if (
    req.query.lexemeClassId ===
    "unclassified"
  ) {
    lexemeClassFilter = "unclassified";
  } else if (req.query.lexemeClassId) {
    lexemeClassId = parsePositiveInteger(
      req.query.lexemeClassId
    );

    if (!lexemeClassId) {
      return res.status(400).json({
        error:
          "Lexeme class must be a valid ID or unclassified.",
      });
    }

    lexemeClassFilter = "classified";
  }

  let partOfSpeechFilter = null;
  let partOfSpeech = null;

  if (
    req.query.partOfSpeech ===
    "unspecified"
  ) {
    partOfSpeechFilter = "unspecified";
  } else if (
    typeof req.query.partOfSpeech ===
      "string" &&
    req.query.partOfSpeech.trim()
  ) {
    partOfSpeechFilter = "specified";

    partOfSpeech =
      req.query.partOfSpeech.trim();
  }

  const stageId = req.query.stageId
    ? parsePositiveInteger(req.query.stageId)
    : null;

  const lineageId = req.query.lineageId
    ? parsePositiveInteger(req.query.lineageId)
    : null;

  const ageId = req.query.ageId
    ? parsePositiveInteger(req.query.ageId)
    : null;

  const searchText =
    typeof req.query.q === "string"
      ? req.query.q.trim()
      : "";

  const matchMode =
    req.query.matchMode === "exact"
      ? "exact"
      : "contains";

  /*
   * Default to 100 results per request.
   * Cap the maximum at 200 so one request cannot
   * accidentally load the entire lexicon.
   */
  const requestedLimit = req.query.limit
    ? parsePositiveInteger(req.query.limit)
    : 100;

  const limit = Math.min(
    requestedLimit || 100,
    200
  );

  const offset = req.query.offset
    ? parseNonNegativeInteger(req.query.offset)
    : 0;

  if (offset === null) {
    return res.status(400).json({
      error:
        "Offset must be a non-negative integer.",
    });
  }

  const normalizedSearchText =
    searchText.toLocaleLowerCase();

  const searchPattern =
    `%${normalizedSearchText}%`;

  /*
   * These parameters are shared by both:
   *
   * 1. the count query
   * 2. the paginated lexeme query
   */
  const filterParameters = [
    includeArchived ? 1 : 0,

    needsReview === null
      ? null
      : needsReview
        ? 1
        : 0,

    needsReview === null
      ? null
      : needsReview
        ? 1
        : 0,

    stageId,
    stageId,

    lineageId,
    lineageId,

    ageId,
    ageId,

    lexemeClassFilter,
    lexemeClassFilter,
    lexemeClassId,
    lexemeClassFilter,

    partOfSpeechFilter,
    partOfSpeechFilter,
    partOfSpeech,
    partOfSpeechFilter,

    searchText,
    matchMode,
    normalizedSearchText,
    matchMode,
    searchPattern,
    searchPattern,
  ];

  /*
   * First determine how many total lexemes match
   * the active filters.
   *
   * DISTINCT is important because one lexeme may
   * have several gloss rows.
   */
  const totalRow = db
    .prepare(`
      SELECT
        COUNT(DISTINCT lexemes.id) AS total

      FROM lexemes

      JOIN language_stages
        ON lexemes.language_stage_id =
          language_stages.id

      JOIN language_lineages
        ON language_stages.lineage_id =
          language_lineages.id

      JOIN ages
        ON language_stages.age_id = ages.id

      LEFT JOIN glosses
        ON glosses.lexeme_id = lexemes.id

      WHERE
        (
          lexemes.is_archived = 0
          OR ? = 1
        )
        
        AND (
          ? IS NULL
          OR lexemes.needs_review = ?
        )

        AND (
          ? IS NULL
          OR lexemes.language_stage_id = ?
        )

        AND (
          ? IS NULL
          OR language_stages.lineage_id = ?
        )

        AND (
          ? IS NULL
          OR language_stages.age_id = ?
        )
        
        AND (
          ? IS NULL

          OR (
            ? = 'unclassified'
            AND lexemes.lexeme_class_id IS NULL
          )

          OR (
            lexemes.lexeme_class_id = ?
            AND ? = 'classified'
          )
        )

        AND (
          ? IS NULL

          OR (
            ? = 'unspecified'
            AND (
              lexemes.part_of_speech IS NULL
              OR TRIM(
                lexemes.part_of_speech
              ) = ''
            )
          )

          OR (
            LOWER(
              lexemes.part_of_speech
            ) = LOWER(?)
            AND ? = 'specified'
          )
        )

        AND (
          ? = ''

          OR (
            ? = 'exact'
            AND LOWER(lexemes.lemma) = ?
          )

          OR (
            ? = 'contains'
            AND (
              LOWER(lexemes.lemma) LIKE ?

              OR LOWER(
                COALESCE(glosses.gloss, '')
              ) LIKE ?
            )
          )
        )
    `)
    .get(...filterParameters);

  /*
   * Then retrieve only the requested page.
   */
  const lexemes = db
    .prepare(`
      SELECT
        lexemes.id,
        lexemes.lemma,
        lexemes.normalized_lemma,
        lexemes.language_stage_id,
        lexemes.part_of_speech,
        lexemes.lexeme_class_id,
        lexemes.notes,
        lexemes.is_archived,
        lexemes.needs_review,
        lexemes.created_at,
        lexemes.updated_at,

        language_stages.code AS stage_code,
        language_stages.name AS stage_name,

        lexeme_classes.name AS lexeme_class_name,
        lexeme_classes.description AS lexeme_class_description,

        language_lineages.id AS lineage_id,
        language_lineages.code AS lineage_code,
        language_lineages.name AS lineage_name,

        ages.id AS age_id,
        ages.code AS age_code,
        ages.name AS age_name,
        ages.sort_order AS age_sort_order,

        GROUP_CONCAT(
          glosses.gloss,
          ' | '
        ) AS glosses

      FROM lexemes

      JOIN language_stages
        ON lexemes.language_stage_id =
          language_stages.id

      LEFT JOIN lexeme_classes
        ON lexemes.lexeme_class_id =
          lexeme_classes.id

      JOIN language_lineages
        ON language_stages.lineage_id =
          language_lineages.id

      JOIN ages
        ON language_stages.age_id = ages.id

      LEFT JOIN glosses
        ON glosses.lexeme_id = lexemes.id

      WHERE
        (
          lexemes.is_archived = 0
          OR ? = 1
        )
        
        AND (
          ? IS NULL
          OR lexemes.needs_review = ?
        )

        AND (
          ? IS NULL
          OR lexemes.language_stage_id = ?
        )

        AND (
          ? IS NULL
          OR language_stages.lineage_id = ?
        )

        AND (
          ? IS NULL
          OR language_stages.age_id = ?
        )
        
        AND (
          ? IS NULL

          OR (
            ? = 'unclassified'
            AND lexemes.lexeme_class_id IS NULL
          )

          OR (
            lexemes.lexeme_class_id = ?
            AND ? = 'classified'
          )
        )
        
        AND (
          ? IS NULL

          OR (
            ? = 'unspecified'
            AND (
              lexemes.part_of_speech IS NULL
              OR TRIM(
                lexemes.part_of_speech
              ) = ''
            )
          )

          OR (
            LOWER(
              lexemes.part_of_speech
            ) = LOWER(?)
            AND ? = 'specified'
          )
        )

        AND (
          ? = ''

          OR (
            ? = 'exact'
            AND LOWER(lexemes.lemma) = ?
          )

          OR (
            ? = 'contains'
            AND (
              LOWER(lexemes.lemma) LIKE ?

              OR LOWER(
                COALESCE(glosses.gloss, '')
              ) LIKE ?
            )
          )
        )

      GROUP BY lexemes.id

      ORDER BY
        ages.sort_order,
        language_stages.code,
        lexemes.normalized_lemma,
        lexemes.id

      LIMIT ?
      OFFSET ?
    `)
    .all(
      ...filterParameters,
      limit,
      offset
    );

  const total = totalRow.total;

  res.json({
    items: lexemes,
    total,
    limit,
    offset,
    hasMore:
      offset + lexemes.length < total,
  });
});

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
        lexemes.language_stage_id,
        lexemes.part_of_speech,
        lexemes.lexeme_class_id,
        lexemes.notes,
        lexemes.is_archived,
        lexemes.needs_review,
        lexemes.created_at,
        lexemes.updated_at,

        language_stages.code AS stage_code,
        language_stages.name AS stage_name,

        lexeme_classes.name AS lexeme_class_name,
        lexeme_classes.description
          AS lexeme_class_description,

        language_lineages.id AS lineage_id,
        language_lineages.code AS lineage_code,
        language_lineages.name AS lineage_name,

        ages.id AS age_id,
        ages.code AS age_code,
        ages.name AS age_name,
        ages.sort_order AS age_sort_order

      FROM lexemes

      JOIN language_stages
        ON lexemes.language_stage_id =
          language_stages.id

      LEFT JOIN lexeme_classes
        ON lexemes.lexeme_class_id =
          lexeme_classes.id

      JOIN language_lineages
        ON language_stages.lineage_id =
          language_lineages.id

      JOIN ages
        ON language_stages.age_id = ages.id

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
      SELECT
        id,
        gloss,
        sense_order,
        notes,
        created_at,
        updated_at
      FROM glosses
      WHERE lexeme_id = ?
      ORDER BY sense_order, id
    `)
    .all(lexemeId);

  const forms = db
    .prepare(`
      SELECT
        id,
        form_label,
        form,
        form_order,
        notes,
        created_at,
        updated_at
      FROM lexeme_forms
      WHERE lexeme_id = ?
      ORDER BY form_order, id
    `)
    .all(lexemeId);

  const incomingRelations = db
    .prepare(`
      SELECT
        lexeme_relations.id AS relation_id,
        lexeme_relations.relation_type,
        lexeme_relations.notes AS relationship_notes,
        lexeme_relations.created_at,
        lexeme_relations.updated_at,

        source_lexeme.id,
        source_lexeme.lemma,
        source_lexeme.part_of_speech,
        source_lexeme.is_archived,

        source_stage.code AS stage_code,
        source_lineage.code AS lineage_code,
        source_age.code AS age_code,

        GROUP_CONCAT(
          source_gloss.gloss,
          ' | '
        ) AS glosses

      FROM lexeme_relations

      JOIN lexemes AS source_lexeme
        ON lexeme_relations.source_lexeme_id =
          source_lexeme.id

      JOIN language_stages AS source_stage
        ON source_lexeme.language_stage_id =
          source_stage.id

      JOIN language_lineages AS source_lineage
        ON source_stage.lineage_id =
          source_lineage.id

      JOIN ages AS source_age
        ON source_stage.age_id = source_age.id

      LEFT JOIN glosses AS source_gloss
        ON source_gloss.lexeme_id =
          source_lexeme.id

      WHERE lexeme_relations.target_lexeme_id = ?

      GROUP BY lexeme_relations.id

      ORDER BY
        source_age.sort_order,
        source_stage.code,
        source_lexeme.normalized_lemma
    `)
    .all(lexemeId);

  const outgoingRelations = db
    .prepare(`
      SELECT
        lexeme_relations.id AS relation_id,
        lexeme_relations.relation_type,
        lexeme_relations.notes AS relationship_notes,
        lexeme_relations.created_at,
        lexeme_relations.updated_at,

        target_lexeme.id,
        target_lexeme.lemma,
        target_lexeme.part_of_speech,
        target_lexeme.is_archived,

        target_stage.code AS stage_code,
        target_lineage.code AS lineage_code,
        target_age.code AS age_code,

        GROUP_CONCAT(
          target_gloss.gloss,
          ' | '
        ) AS glosses

      FROM lexeme_relations

      JOIN lexemes AS target_lexeme
        ON lexeme_relations.target_lexeme_id =
          target_lexeme.id

      JOIN language_stages AS target_stage
        ON target_lexeme.language_stage_id =
          target_stage.id

      JOIN language_lineages AS target_lineage
        ON target_stage.lineage_id =
          target_lineage.id

      JOIN ages AS target_age
        ON target_stage.age_id = target_age.id

      LEFT JOIN glosses AS target_gloss
        ON target_gloss.lexeme_id =
          target_lexeme.id

      WHERE lexeme_relations.source_lexeme_id = ?

      GROUP BY lexeme_relations.id

      ORDER BY
        target_age.sort_order,
        target_stage.code,
        target_lexeme.normalized_lemma
    `)
    .all(lexemeId);

  const directedIncomingRelations =
    incomingRelations.filter(
      (relation) =>
        !SYMMETRIC_LEXEME_RELATION_TYPE_CODES.has(
          relation.relation_type
        )
    );

  const directedOutgoingRelations =
    outgoingRelations.filter(
      (relation) =>
        !SYMMETRIC_LEXEME_RELATION_TYPE_CODES.has(
          relation.relation_type
        )
    );

  const symmetricRelations = [
    ...incomingRelations.filter((relation) =>
      SYMMETRIC_LEXEME_RELATION_TYPE_CODES.has(
        relation.relation_type
      )
    ),

    ...outgoingRelations.filter((relation) =>
      SYMMETRIC_LEXEME_RELATION_TYPE_CODES.has(
        relation.relation_type
      )
    ),
  ];

  res.json({
    ...lexeme,
    glosses,
    forms,
    incoming_relations:
      directedIncomingRelations,
    outgoing_relations:
      directedOutgoingRelations,
    symmetric_relations: symmetricRelations,
  });
});

const createLexemeTransaction = db.transaction((data) => {
  const lexemeResult = db
    .prepare(`
      INSERT INTO lexemes (
        lemma,
        normalized_lemma,
        language_stage_id,
        part_of_speech,
        lexeme_class_id,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      data.lemma,
      normalizeLemma(data.lemma),
      data.languageStageId,
      data.partOfSpeech,
      data.lexemeClassId,
      data.notes
    );

  const lexemeId = Number(
    lexemeResult.lastInsertRowid
  );

  const insertGloss = db.prepare(`
    INSERT INTO glosses (
      lexeme_id,
      gloss,
      sense_order,
      notes
    )
    VALUES (?, ?, ?, ?)
  `);

  data.glosses.forEach((gloss, index) => {
    insertGloss.run(
      lexemeId,
      gloss.gloss,
      index + 1,
      gloss.notes
    );
  });
  
  const insertForm = db.prepare(`
    INSERT INTO lexeme_forms (
      lexeme_id,
      form_label,
      form,
      form_order,
      notes
    )
    VALUES (?, ?, ?, ?, ?)
  `);

  data.forms.forEach((form, index) => {
    insertForm.run(
      lexemeId,
      form.formLabel,
      form.form,
      index + 1,
      form.notes
    );
  });

  const insertRelationship = db.prepare(`
    INSERT INTO lexeme_relations (
      source_lexeme_id,
      target_lexeme_id,
      relation_type,
      notes
    )
    VALUES (?, ?, ?, ?)
  `);

  data.relationships.forEach((relationship) => {
    let sourceLexemeId;
    let targetLexemeId;

    if (relationship.direction === "incoming") {
      sourceLexemeId = relationship.relatedLexemeId;
      targetLexemeId = lexemeId;
    } else if (
      relationship.direction === "outgoing"
    ) {
      sourceLexemeId = lexemeId;
      targetLexemeId = relationship.relatedLexemeId;
    } else {
      /*
      * Symmetric relationships have no semantic source
      * or target. Store the smaller ID first so A ↔ B and
      * B ↔ A become the same canonical database record.
      */
      sourceLexemeId = Math.min(
        lexemeId,
        relationship.relatedLexemeId
      );

      targetLexemeId = Math.max(
        lexemeId,
        relationship.relatedLexemeId
      );
    }

    insertRelationship.run(
      sourceLexemeId,
      targetLexemeId,
      relationship.relationType,
      relationship.notes
    );
  });

  return lexemeId;
});

const importInheritedLexiconTransaction =
  db.transaction(
    ({
      sourceStageId,
      targetStageId,
      includeArchived,
    }) => {
      /*
       * Retrieve source lexemes that have not already
       * been imported into this exact target stage.
       */
      const sourceLexemes = db
        .prepare(`
          SELECT
            source_lexeme.id,
            source_lexeme.lemma,
            source_lexeme.normalized_lemma,
            source_lexeme.part_of_speech,
            source_lexeme.notes,
            source_lexeme.is_archived,

            source_class.name
              AS source_class_name,

            source_class.normalized_name
              AS source_class_normalized_name

          FROM lexemes AS source_lexeme

          LEFT JOIN lexeme_classes AS source_class
            ON source_class.id =
              source_lexeme.lexeme_class_id

          WHERE
            source_lexeme.language_stage_id = ?

            AND (
              source_lexeme.is_archived = 0
              OR ? = 1
            )

            AND NOT EXISTS (
              SELECT 1

              FROM lexeme_relations AS relation

              JOIN lexemes AS target_lexeme
                ON target_lexeme.id =
                  relation.target_lexeme_id

              WHERE
                relation.source_lexeme_id =
                  source_lexeme.id

                AND relation.relation_type =
                  'inherited_from'

                AND target_lexeme.language_stage_id = ?
            )

          ORDER BY
            source_lexeme.normalized_lemma,
            source_lexeme.id
        `)
        .all(
          sourceStageId,
          includeArchived ? 1 : 0,
          targetStageId
        );

      const insertLexeme = db.prepare(`
        INSERT INTO lexemes (
          lemma,
          normalized_lemma,
          language_stage_id,
          part_of_speech,
          lexeme_class_id,
          notes,
          is_archived,
          needs_review
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);

      const findTargetClass = db.prepare(`
        SELECT
          id,
          name
        FROM lexeme_classes
        WHERE
          language_stage_id = ?
          AND normalized_name = ?
      `);

      const selectGlosses = db.prepare(`
        SELECT
          gloss,
          sense_order,
          notes
        FROM glosses
        WHERE lexeme_id = ?
        ORDER BY sense_order, id
      `);

      const insertGloss = db.prepare(`
        INSERT INTO glosses (
          lexeme_id,
          gloss,
          sense_order,
          notes
        )
        VALUES (?, ?, ?, ?)
      `);

      const selectForms = db.prepare(`
        SELECT
          form_label,
          form,
          form_order,
          notes
        FROM lexeme_forms
        WHERE lexeme_id = ?
        ORDER BY form_order, id
      `);

      const insertForm = db.prepare(`
        INSERT INTO lexeme_forms (
          lexeme_id,
          form_label,
          form,
          form_order,
          notes
        )
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertRelationship = db.prepare(`
        INSERT INTO lexeme_relations (
          source_lexeme_id,
          target_lexeme_id,
          relation_type,
          notes
        )
        VALUES (?, ?, 'inherited_from', ?)
      `);

      const createdPairs = [];

      for (const sourceLexeme of sourceLexemes) {
        let targetLexemeClassId = null;
        let sourceClassName = null;
        let matchedClassName = null;

        if (
          sourceLexeme
            .source_class_normalized_name
        ) {
          const matchingTargetClass =
            findTargetClass.get(
              targetStageId,
              sourceLexeme
                .source_class_normalized_name
            );

          targetLexemeClassId =
            matchingTargetClass?.id || null;

          sourceClassName =
            sourceLexeme.source_class_name ||
            null;

          matchedClassName =
            matchingTargetClass?.name || null;
        }

        const lexemeResult = insertLexeme.run(
          sourceLexeme.lemma,
          sourceLexeme.normalized_lemma,
          targetStageId,
          sourceLexeme.part_of_speech,
          targetLexemeClassId,
          sourceLexeme.notes,
          sourceLexeme.is_archived
        );

        const targetLexemeId = Number(
          lexemeResult.lastInsertRowid
        );

        const glosses = selectGlosses.all(
          sourceLexeme.id
        );

        for (const gloss of glosses) {
          insertGloss.run(
            targetLexemeId,
            gloss.gloss,
            gloss.sense_order,
            gloss.notes
          );
        }

        const forms = selectForms.all(
          sourceLexeme.id
        );

        for (const form of forms) {
          insertForm.run(
            targetLexemeId,
            form.form_label,
            form.form,
            form.form_order,
            form.notes
          );
        }

        insertRelationship.run(
          sourceLexeme.id,
          targetLexemeId,
          null
        );

        createdPairs.push({
          sourceLexemeId: sourceLexeme.id,
          targetLexemeId,
          lemma: sourceLexeme.lemma,

          sourceClassName,

          targetClassId:
            targetLexemeClassId,

          matchedClassName,

          classWasMatched:
            Boolean(
              sourceClassName &&
              targetLexemeClassId
            ),

          classWasUnmatched:
            Boolean(
              sourceClassName &&
              !targetLexemeClassId
            ),
        });
      }

      return createdPairs;
    }
  );

app.post("/api/lexemes", (req, res) => {
  const lemma = cleanRequiredText(req.body.lemma);

  const languageStageId = parsePositiveInteger(
    req.body.languageStageId
  );

  const partOfSpeech = cleanOptionalText(
    req.body.partOfSpeech
  );

  const lexemeClassId =
    req.body.lexemeClassId
      ? parsePositiveInteger(
          req.body.lexemeClassId
        )
      : null;

  const notes = cleanOptionalText(req.body.notes);

  if (!lemma) {
    return res.status(400).json({
      error: "Lemma is required.",
    });
  }

  if (!languageStageId) {
    return res.status(400).json({
      error: "A valid language-stage ID is required.",
    });
  }

  const stage = db
    .prepare(`
      SELECT id
      FROM language_stages
      WHERE id = ?
    `)
    .get(languageStageId);

  if (!stage) {
    return res.status(404).json({
      error: "Language stage not found.",
    });
  }

  if (
    req.body.lexemeClassId &&
    !lexemeClassId
  ) {
    return res.status(400).json({
      error:
        "A valid lexeme-class ID is required.",
    });
  }

  if (lexemeClassId) {
    const lexemeClass = db
      .prepare(`
        SELECT
          id,
          language_stage_id
        FROM lexeme_classes
        WHERE id = ?
      `)
      .get(lexemeClassId);

    if (!lexemeClass) {
      return res.status(404).json({
        error: "Lexeme class not found.",
      });
    }

    if (
      Number(
        lexemeClass.language_stage_id
      ) !== Number(languageStageId)
    ) {
      return res.status(400).json({
        error:
          "The selected lexeme class does not belong to the selected language stage.",
      });
    }
  }

  if (!Array.isArray(req.body.glosses)) {
    return res.status(400).json({
      error: "Glosses must be an array.",
    });
  }

  const cleanedGlosses = req.body.glosses
    .map((gloss) => {
      if (typeof gloss === "string") {
        return {
          gloss: cleanRequiredText(gloss),
          notes: null,
        };
      }

      if (
        gloss &&
        typeof gloss === "object"
      ) {
        return {
          gloss: cleanRequiredText(gloss.gloss),
          notes: cleanOptionalText(gloss.notes),
        };
      }

      return null;
    })
    .filter(
      (gloss) => gloss && gloss.gloss
    );

  if (cleanedGlosses.length === 0) {
    return res.status(400).json({
      error: "At least one non-empty gloss is required.",
    });
  }

  const submittedForms = req.body.forms ?? [];

if (!Array.isArray(submittedForms)) {
  return res.status(400).json({
    error: "Forms must be an array.",
  });
}

const cleanedForms = [];

for (const submittedForm of submittedForms) {
  if (
    !submittedForm ||
    typeof submittedForm !== "object"
  ) {
    return res.status(400).json({
      error: "Every form must be an object.",
    });
  }

  const formLabel = cleanRequiredText(
    submittedForm.formLabel
  );

  const form = cleanRequiredText(
    submittedForm.form
  );

  const formNotes = cleanOptionalText(
    submittedForm.notes
  );

  /*
   * Completely blank rows may be safely ignored.
   * This also protects against an accidentally submitted
   * blank editor row.
   */
  if (
    !formLabel &&
    !form &&
    !formNotes
  ) {
    continue;
  }

  if (!formLabel || !form) {
    return res.status(400).json({
      error:
        "Every form requires both a form label and a form.",
    });
  }

  cleanedForms.push({
    formLabel,
    form,
    notes: formNotes,
  });
}

  const submittedRelationships =
    req.body.relationships ?? [];

  if (!Array.isArray(submittedRelationships)) {
    return res.status(400).json({
      error: "Relationships must be an array.",
    });
  }

  const cleanedRelationships = [];

  for (const relationship of submittedRelationships) {
    if (
      !relationship ||
      typeof relationship !== "object"
    ) {
      return res.status(400).json({
        error: "Every relationship must be an object.",
      });
    }

    const direction = cleanRequiredText(
      relationship.direction
    );

    const relatedLexemeId = parsePositiveInteger(
      relationship.relatedLexemeId
    );

    const relationType = cleanRequiredText(
      relationship.relationType
    );

    const relationshipNotes = cleanOptionalText(
      relationship.notes
    );

    if (
      direction !== "incoming" &&
      direction !== "outgoing" &&
      direction !== "symmetric"
    ) {
      return res.status(400).json({
        error:
          "Relationship direction must be incoming, outgoing, or symmetric.",
      });
    }

    if (!relatedLexemeId) {
      return res.status(400).json({
        error:
          "Every relationship requires a valid related lexeme.",
      });
    }

    if (
      !relationType ||
      !LEXEME_RELATION_TYPE_CODES.has(relationType)
    ) {
      return res.status(400).json({
        error:
          "Every relationship requires a valid relationship type.",
      });
    }

    const relatedLexeme = db
      .prepare(`
        SELECT id
        FROM lexemes
        WHERE id = ?
      `)
      .get(relatedLexemeId);

    if (!relatedLexeme) {
      return res.status(404).json({
        error:
          "One or more related lexemes do not exist.",
      });
    }

    const isSymmetricType =
      SYMMETRIC_LEXEME_RELATION_TYPE_CODES.has(
        relationType
      );

    if (
      direction === "symmetric" &&
      !isSymmetricType
    ) {
      return res.status(400).json({
        error:
          "The selected relationship type is not symmetric.",
      });
    }

    if (
      direction !== "symmetric" &&
      isSymmetricType
    ) {
      return res.status(400).json({
        error:
          "Symmetric relationship types must use the symmetric direction.",
      });
    }

    cleanedRelationships.push({
      direction,
      relatedLexemeId,
      relationType,
      notes: relationshipNotes,
    });
  }

  const relationshipKeys = new Set();

  for (const relationship of cleanedRelationships) {
    const key = [
      relationship.direction,
      relationship.relatedLexemeId,
      relationship.relationType,
    ].join(":");

    if (relationshipKeys.has(key)) {
      return res.status(409).json({
        error:
          "The same lexical relationship was selected more than once.",
      });
    }

    relationshipKeys.add(key);
  }

  try {
    const lexemeId = createLexemeTransaction({
      lemma,
      languageStageId,
      partOfSpeech,
      lexemeClassId,
      notes,
      glosses: cleanedGlosses,
      forms: cleanedForms,
      relationships: cleanedRelationships,
    });

    const createdLexeme = db
      .prepare(`
        SELECT
          lexemes.id,
          lexemes.lemma,
          lexemes.language_stage_id,
          lexemes.part_of_speech,
          lexemes.lexeme_class_id,
          lexemes.notes,

          language_stages.code AS stage_code,
          lexeme_classes.name AS lexeme_class_name,
          language_lineages.code AS lineage_code,
          ages.code AS age_code

        FROM lexemes

        JOIN language_stages
          ON lexemes.language_stage_id =
            language_stages.id

        LEFT JOIN lexeme_classes
          ON lexemes.lexeme_class_id =
            lexeme_classes.id

        JOIN language_lineages
          ON language_stages.lineage_id =
            language_lineages.id

        JOIN ages
          ON language_stages.age_id = ages.id

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

const updateLexemeTransaction = db.transaction(
  (lexemeId, data) => {
    db.prepare(`
      UPDATE lexemes
        SET
          lemma = ?,
          normalized_lemma = ?,
          language_stage_id = ?,
          part_of_speech = ?,
          lexeme_class_id = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
      data.lemma,
      normalizeLemma(data.lemma),
      data.languageStageId,
      data.partOfSpeech,
      data.lexemeClassId,
      data.notes,
      lexemeId
    );

    db.prepare(`
      DELETE FROM glosses
      WHERE lexeme_id = ?
    `).run(lexemeId);

    const insertGloss = db.prepare(`
      INSERT INTO glosses (
        lexeme_id,
        gloss,
        sense_order,
        notes
      )
      VALUES (?, ?, ?, ?)
    `);

    data.glosses.forEach((gloss, index) => {
      insertGloss.run(
        lexemeId,
        gloss.gloss,
        index + 1,
        gloss.notes
      );
    });

    db.prepare(`
      DELETE FROM lexeme_forms
      WHERE lexeme_id = ?
    `).run(lexemeId);

    const insertForm = db.prepare(`
      INSERT INTO lexeme_forms (
        lexeme_id,
        form_label,
        form,
        form_order,
        notes
      )
      VALUES (?, ?, ?, ?, ?)
    `);

    data.forms.forEach((form, index) => {
      insertForm.run(
        lexemeId,
        form.formLabel,
        form.form,
        index + 1,
        form.notes
      );
    });
  }
);

app.put(
  "/api/lexemes/bulk-review-status",
  (req, res) => {
    if (
      typeof req.body.needsReview !== "boolean"
    ) {
      return res.status(400).json({
        error:
          "needsReview must be true or false.",
      });
    }

    const includeArchived =
      req.body.includeArchived === true;

    let needsReviewFilter = null;

    if (req.body.filterNeedsReview === true) {
      needsReviewFilter = true;
    } else if (
      req.body.filterNeedsReview === false
    ) {
      needsReviewFilter = false;
    }

    let lexemeClassFilter = null;
    let lexemeClassId = null;

    if (
      req.body.lexemeClassId ===
      "unclassified"
    ) {
      lexemeClassFilter = "unclassified";
    } else if (req.body.lexemeClassId) {
      lexemeClassId = parsePositiveInteger(
        req.body.lexemeClassId
      );

      if (!lexemeClassId) {
        return res.status(400).json({
          error:
            "Lexeme class must be a valid ID or unclassified.",
        });
      }

      lexemeClassFilter = "classified";
    }

    let partOfSpeechFilter = null;
    let partOfSpeech = null;

    if (
      req.body.partOfSpeech ===
      "unspecified"
    ) {
      partOfSpeechFilter = "unspecified";
    } else if (
      typeof req.body.partOfSpeech ===
        "string" &&
      req.body.partOfSpeech.trim()
    ) {
      partOfSpeechFilter = "specified";
      partOfSpeech =
        req.body.partOfSpeech.trim();
    }

    const stageId = req.body.stageId
      ? parsePositiveInteger(req.body.stageId)
      : null;

    const lineageId = req.body.lineageId
      ? parsePositiveInteger(
          req.body.lineageId
        )
      : null;

    const ageId = req.body.ageId
      ? parsePositiveInteger(req.body.ageId)
      : null;

    const searchText =
      typeof req.body.q === "string"
        ? req.body.q.trim()
        : "";

    const matchMode =
      req.body.matchMode === "exact"
        ? "exact"
        : "contains";

    const normalizedSearchText =
      searchText.toLocaleLowerCase();

    const searchPattern =
      `%${normalizedSearchText}%`;

    const matchingLexemes = db
      .prepare(`
        SELECT DISTINCT
          lexemes.id

        FROM lexemes

        JOIN language_stages
          ON lexemes.language_stage_id =
            language_stages.id

        JOIN language_lineages
          ON language_stages.lineage_id =
            language_lineages.id

        JOIN ages
          ON language_stages.age_id =
            ages.id

        LEFT JOIN glosses
          ON glosses.lexeme_id =
            lexemes.id

        WHERE
          (
            lexemes.is_archived = 0
            OR ? = 1
          )

          AND (
            ? IS NULL
            OR lexemes.needs_review = ?
          )

          AND (
            ? IS NULL
            OR lexemes.language_stage_id = ?
          )

          AND (
            ? IS NULL
            OR language_stages.lineage_id = ?
          )

          AND (
            ? IS NULL
            OR language_stages.age_id = ?
          )

          AND (
            ? IS NULL

            OR (
              ? = 'unclassified'
              AND lexemes.lexeme_class_id
                IS NULL
            )

            OR (
              lexemes.lexeme_class_id = ?
              AND ? = 'classified'
            )
          )

          AND (
            ? IS NULL

            OR (
              ? = 'unspecified'
              AND (
                lexemes.part_of_speech
                  IS NULL
                OR TRIM(
                  lexemes.part_of_speech
                ) = ''
              )
            )

            OR (
              LOWER(
                lexemes.part_of_speech
              ) = LOWER(?)
              AND ? = 'specified'
            )
          )

          AND (
            ? = ''

            OR (
              ? = 'exact'
              AND LOWER(
                lexemes.lemma
              ) = ?
            )

            OR (
              ? = 'contains'
              AND (
                LOWER(
                  lexemes.lemma
                ) LIKE ?

                OR LOWER(
                  COALESCE(
                    glosses.gloss,
                    ''
                  )
                ) LIKE ?
              )
            )
          )
      `)
      .all(
        includeArchived ? 1 : 0,

        needsReviewFilter === null
          ? null
          : needsReviewFilter
            ? 1
            : 0,

        needsReviewFilter === null
          ? null
          : needsReviewFilter
            ? 1
            : 0,

        stageId,
        stageId,

        lineageId,
        lineageId,

        ageId,
        ageId,

        lexemeClassFilter,
        lexemeClassFilter,
        lexemeClassId,
        lexemeClassFilter,

        partOfSpeechFilter,
        partOfSpeechFilter,
        partOfSpeech,
        partOfSpeechFilter,

        searchText,
        matchMode,
        normalizedSearchText,
        matchMode,
        searchPattern,
        searchPattern
      );

    if (matchingLexemes.length === 0) {
      return res.json({
        matchedCount: 0,
        changedCount: 0,
        message:
          "No lexemes matched the current filters.",
      });
    }

    const lexemeIds =
      matchingLexemes.map(
        (lexeme) => lexeme.id
      );

    const placeholders =
      lexemeIds
        .map(() => "?")
        .join(", ");

    const needsReview =
      req.body.needsReview;

    try {
      const result = db
        .prepare(`
          UPDATE lexemes

          SET
            needs_review = ?,
            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            id IN (${placeholders})

            AND needs_review != ?
        `)
        .run(
          needsReview ? 1 : 0,
          ...lexemeIds,
          needsReview ? 1 : 0
        );

      return res.json({
        matchedCount:
          matchingLexemes.length,

        changedCount:
          result.changes,

        needs_review:
          needsReview ? 1 : 0,

        message:
          `${result.changes} lexeme` +
          `${result.changes === 1 ? "" : "s"} ` +
          `${
            needsReview
              ? "marked as needing review."
              : "marked as reviewed."
          }`,
      });
    } catch (error) {
      console.error(
        "Failed to bulk update review status:",
        error
      );

      return res.status(500).json({
        error:
          "The review statuses could not be updated.",
      });
    }
  }
);

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

  const lemma = cleanRequiredText(req.body.lemma);

  const languageStageId = parsePositiveInteger(
    req.body.languageStageId
  );

  const partOfSpeech = cleanOptionalText(
    req.body.partOfSpeech
  );

  const lexemeClassId =
    req.body.lexemeClassId
      ? parsePositiveInteger(
          req.body.lexemeClassId
        )
      : null;

  const notes = cleanOptionalText(req.body.notes);

  if (!lemma) {
    return res.status(400).json({
      error: "Lemma is required.",
    });
  }

  if (!languageStageId) {
    return res.status(400).json({
      error: "A valid language-stage ID is required.",
    });
  }

  if (
    req.body.lexemeClassId &&
    !lexemeClassId
  ) {
    return res.status(400).json({
      error:
        "A valid lexeme-class ID is required.",
    });
  }

  if (lexemeClassId) {
    const lexemeClass = db
      .prepare(`
        SELECT
          id,
          language_stage_id
        FROM lexeme_classes
        WHERE id = ?
      `)
      .get(lexemeClassId);

    if (!lexemeClass) {
      return res.status(404).json({
        error: "Lexeme class not found.",
      });
    }

    if (
      Number(
        lexemeClass.language_stage_id
      ) !== Number(languageStageId)
    ) {
      return res.status(400).json({
        error:
          "The selected lexeme class does not belong to the selected language stage.",
      });
    }
  }

  const stage = db
    .prepare(`
      SELECT id
      FROM language_stages
      WHERE id = ?
    `)
    .get(languageStageId);

  if (!stage) {
    return res.status(404).json({
      error: "Language stage not found.",
    });
  }

  if (!Array.isArray(req.body.glosses)) {
    return res.status(400).json({
      error: "Glosses must be an array.",
    });
  }

  const cleanedGlosses = req.body.glosses
    .map((gloss) => {
      if (typeof gloss === "string") {
        return {
          gloss: cleanRequiredText(gloss),
          notes: null,
        };
      }

      if (
        gloss &&
        typeof gloss === "object"
      ) {
        return {
          gloss: cleanRequiredText(gloss.gloss),
          notes: cleanOptionalText(gloss.notes),
        };
      }

      return null;
    })
    .filter(
      (gloss) => gloss && gloss.gloss
    );

  if (cleanedGlosses.length === 0) {
    return res.status(400).json({
      error: "At least one non-empty gloss is required.",
    });
  }

  const submittedForms = req.body.forms ?? [];

  if (!Array.isArray(submittedForms)) {
    return res.status(400).json({
      error: "Forms must be an array.",
    });
  }

  const cleanedForms = [];

  for (const submittedForm of submittedForms) {
    if (
      !submittedForm ||
      typeof submittedForm !== "object"
    ) {
      return res.status(400).json({
        error: "Every form must be an object.",
      });
    }

    const formLabel = cleanRequiredText(
      submittedForm.formLabel
    );

    const form = cleanRequiredText(
      submittedForm.form
    );

    const formNotes = cleanOptionalText(
      submittedForm.notes
    );

    // Ignore an accidentally submitted blank editor row.
    if (!formLabel && !form && !formNotes) {
      continue;
    }

    if (!formLabel || !form) {
      return res.status(400).json({
        error:
          "Every form requires both a form label and a form.",
      });
    }

    cleanedForms.push({
      formLabel,
      form,
      notes: formNotes,
    });
  }

  try {
    updateLexemeTransaction(lexemeId, {
      lemma,
      languageStageId,
      partOfSpeech,
      lexemeClassId,
      notes,
      glosses: cleanedGlosses,
      forms: cleanedForms,
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

app.put("/api/lexemes/:id/archive", (req, res) => {
  const lexemeId = parsePositiveInteger(req.params.id);

  if (!lexemeId) {
    return res.status(400).json({
      error: "Invalid lexeme ID.",
    });
  }

  const lexeme = db
    .prepare(`
      SELECT id, lemma
      FROM lexemes
      WHERE id = ?
    `)
    .get(lexemeId);

  if (!lexeme) {
    return res.status(404).json({
      error: "Lexeme not found.",
    });
  }

  const isArchived =
    req.body.isArchived === true ||
    req.body.isArchived === 1;

  db.prepare(`
    UPDATE lexemes
    SET
      is_archived = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(isArchived ? 1 : 0, lexemeId);

  return res.json({
    id: lexemeId,
    is_archived: isArchived ? 1 : 0,
    message: isArchived
      ? "Lexeme archived successfully."
      : "Lexeme restored successfully.",
  });
});

app.put(
  "/api/lexemes/:id/review-status",
  (req, res) => {
    const lexemeId = parsePositiveInteger(
      req.params.id
    );

    if (!lexemeId) {
      return res.status(400).json({
        error: "Invalid lexeme ID.",
      });
    }

    const lexeme = db
      .prepare(`
        SELECT
          id,
          lemma,
          needs_review
        FROM lexemes
        WHERE id = ?
      `)
      .get(lexemeId);

    if (!lexeme) {
      return res.status(404).json({
        error: "Lexeme not found.",
      });
    }

    if (
      typeof req.body.needsReview !== "boolean"
    ) {
      return res.status(400).json({
        error:
          "needsReview must be true or false.",
      });
    }

    const needsReview =
      req.body.needsReview;

    db.prepare(`
      UPDATE lexemes
      SET
        needs_review = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      needsReview ? 1 : 0,
      lexemeId
    );

    return res.json({
      id: lexemeId,
      needs_review:
        needsReview ? 1 : 0,
      message: needsReview
        ? "Lexeme marked as needing review."
        : "Lexeme marked as reviewed.",
    });
  }
);

const deleteLexemeTransaction = db.transaction(
  (lexemeId) => {
    db.prepare(`
      DELETE FROM lexeme_relations
      WHERE source_lexeme_id = ?
         OR target_lexeme_id = ?
    `).run(lexemeId, lexemeId);

    db.prepare(`
      DELETE FROM lexeme_forms
      WHERE lexeme_id = ?
    `).run(lexemeId);

    db.prepare(`
      DELETE FROM glosses
      WHERE lexeme_id = ?
    `).run(lexemeId);

    db.prepare(`
      DELETE FROM lexemes
      WHERE id = ?
    `).run(lexemeId);
  }
);

app.delete("/api/lexemes/:id", (req, res) => {
  const lexemeId = parsePositiveInteger(req.params.id);

  if (!lexemeId) {
    return res.status(400).json({
      error: "Invalid lexeme ID.",
    });
  }

  const lexeme = db
    .prepare(`
      SELECT id, lemma
      FROM lexemes
      WHERE id = ?
    `)
    .get(lexemeId);

  if (!lexeme) {
    return res.status(404).json({
      error: "Lexeme not found.",
    });
  }

  try {
    deleteLexemeTransaction(lexemeId);

    return res.json({
      id: lexemeId,
      lemma: lexeme.lemma,
      message: "Lexeme deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete lexeme:", error);

    return res.status(500).json({
      error: "The lexeme could not be deleted.",
    });
  }
});

/* =========================================================
   Lexeme relationships
   ========================================================= */

app.post("/api/lexeme-relations", (req, res) => {
  let sourceLexemeId = parsePositiveInteger(
    req.body.sourceLexemeId
  );

  let targetLexemeId = parsePositiveInteger(
    req.body.targetLexemeId
  );

  const relationType = cleanRequiredText(
    req.body.relationType
  );

  const notes = cleanOptionalText(req.body.notes);

  if (!sourceLexemeId) {
    return res.status(400).json({
      error: "A valid source lexeme ID is required.",
    });
  }

  if (!targetLexemeId) {
    return res.status(400).json({
      error: "A valid target lexeme ID is required.",
    });
  }

  if (sourceLexemeId === targetLexemeId) {
    return res.status(400).json({
      error:
        "A lexeme cannot have a relationship with itself.",
    });
  }

  if (
    !relationType ||
    !LEXEME_RELATION_TYPE_CODES.has(relationType)
  ) {
    return res.status(400).json({
      error: "A valid lexeme-relationship type is required.",
    });
  }

  const sourceLexeme = db
    .prepare(`
      SELECT id, lemma
      FROM lexemes
      WHERE id = ?
    `)
    .get(sourceLexemeId);

  if (!sourceLexeme) {
    return res.status(404).json({
      error: "Source lexeme not found.",
    });
  }

  const targetLexeme = db
    .prepare(`
      SELECT id, lemma
      FROM lexemes
      WHERE id = ?
    `)
    .get(targetLexemeId);

  if (!targetLexeme) {
    return res.status(404).json({
      error: "Target lexeme not found.",
    });
  }

  if (
    SYMMETRIC_LEXEME_RELATION_TYPE_CODES.has(
      relationType
    )
  ) {
    const lowerLexemeId = Math.min(
      sourceLexemeId,
      targetLexemeId
    );

    const higherLexemeId = Math.max(
      sourceLexemeId,
      targetLexemeId
    );

    sourceLexemeId = lowerLexemeId;
    targetLexemeId = higherLexemeId;
  }

  try {
    const result = db
      .prepare(`
        INSERT INTO lexeme_relations (
          source_lexeme_id,
          target_lexeme_id,
          relation_type,
          notes
        )
        VALUES (?, ?, ?, ?)
      `)
      .run(
        sourceLexemeId,
        targetLexemeId,
        relationType,
        notes
      );

    return res.status(201).json({
      id: Number(result.lastInsertRowid),
      source_lexeme_id: sourceLexemeId,
      source_lemma: sourceLexeme.lemma,
      target_lexeme_id: targetLexemeId,
      target_lemma: targetLexeme.lemma,
      relation_type: relationType,
      notes,
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error:
          "That exact lexeme relationship already exists.",
      });
    }

    console.error(
      "Failed to create lexeme relationship:",
      error
    );

    return res.status(500).json({
      error:
        "The lexeme relationship could not be created.",
    });
  }
});

app.put("/api/lexeme-relations/:id", (req, res) => {
  const relationId = parsePositiveInteger(req.params.id);

  if (!relationId) {
    return res.status(400).json({
      error: "Invalid lexeme-relationship ID.",
    });
  }

  const relation = db
    .prepare(`
      SELECT id
      FROM lexeme_relations
      WHERE id = ?
    `)
    .get(relationId);

  if (!relation) {
    return res.status(404).json({
      error: "Lexeme relationship not found.",
    });
  }

  const relationType = cleanRequiredText(
    req.body.relationType
  );

  const notes = cleanOptionalText(req.body.notes);

  if (
    !relationType ||
    !LEXEME_RELATION_TYPE_CODES.has(relationType)
  ) {
    return res.status(400).json({
      error: "A valid lexeme-relationship type is required.",
    });
  }

  try {
    db.prepare(`
      UPDATE lexeme_relations
      SET
        relation_type = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(relationType, notes, relationId);

    return res.json({
      id: relationId,
      relation_type: relationType,
      notes,
      message:
        "Lexeme relationship updated successfully.",
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error:
          "That exact lexeme relationship already exists.",
      });
    }

    console.error(
      "Failed to update lexeme relationship:",
      error
    );

    return res.status(500).json({
      error:
        "The lexeme relationship could not be updated.",
    });
  }
});

app.delete("/api/lexeme-relations/:id", (req, res) => {
  const relationId = parsePositiveInteger(req.params.id);

  if (!relationId) {
    return res.status(400).json({
      error: "Invalid lexeme-relationship ID.",
    });
  }

  const relation = db
    .prepare(`
      SELECT
        lexeme_relations.id,
        lexeme_relations.relation_type,
        source_lexeme.lemma AS source_lemma,
        target_lexeme.lemma AS target_lemma

      FROM lexeme_relations

      JOIN lexemes AS source_lexeme
        ON lexeme_relations.source_lexeme_id =
          source_lexeme.id

      JOIN lexemes AS target_lexeme
        ON lexeme_relations.target_lexeme_id =
          target_lexeme.id

      WHERE lexeme_relations.id = ?
    `)
    .get(relationId);

  if (!relation) {
    return res.status(404).json({
      error: "Lexeme relationship not found.",
    });
  }

  db.prepare(`
    DELETE FROM lexeme_relations
    WHERE id = ?
  `).run(relationId);

  return res.json({
    id: relationId,
    source_lemma: relation.source_lemma,
    target_lemma: relation.target_lemma,
    relation_type: relation.relation_type,
    message:
      "Lexeme relationship deleted successfully.",
  });
});

/* =========================================================
   Health check
   ========================================================= */

app.get("/api/health", (req, res) => {
  const tables = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)
    .all();

  res.json({
    status: "ok",
    database: "connected",
    tables: tables.map((table) => table.name),
  });
});


/* =========================================================
   Historical ages
   ========================================================= */

app.get("/api/ages", (req, res) => {
  const ages = db
    .prepare(`
      SELECT
        id,
        code,
        name,
        sort_order,
        notes,
        created_at,
        updated_at
      FROM ages
      ORDER BY sort_order, code
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
  const notes = cleanOptionalText(req.body.notes);

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
          sort_order,
          notes
        )
        VALUES (?, ?, ?, ?)
      `)
      .run(code, name, sortOrder, notes);

    const age = db
      .prepare(`
        SELECT
          id,
          code,
          name,
          sort_order,
          notes,
          created_at,
          updated_at
        FROM ages
        WHERE id = ?
      `)
      .get(Number(result.lastInsertRowid));

    return res.status(201).json(age);
  } catch (error) {
    if (
      error.code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return res.status(409).json({
        error:
          "An age with that code or sort order already exists.",
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
  const notes = cleanOptionalText(req.body.notes);

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
        sort_order = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      code,
      name,
      sortOrder,
      notes,
      ageId
    );

    const updatedAge = db
      .prepare(`
        SELECT
          id,
          code,
          name,
          sort_order,
          notes,
          created_at,
          updated_at
        FROM ages
        WHERE id = ?
      `)
      .get(ageId);

    return res.json(updatedAge);
  } catch (error) {
    if (
      error.code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return res.status(409).json({
        error:
          "An age with that code or sort order already exists.",
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
      SELECT
        id,
        code,
        name
      FROM ages
      WHERE id = ?
    `)
    .get(ageId);

  if (!existingAge) {
    return res.status(404).json({
      error: "Age not found.",
    });
  }

  const stageUsage = db
    .prepare(`
      SELECT COUNT(*) AS stage_count
      FROM language_stages
      WHERE age_id = ?
    `)
    .get(ageId);

  if (stageUsage.stage_count > 0) {
    return res.status(409).json({
      error:
        `This age cannot be deleted because ` +
        `${stageUsage.stage_count} language stage` +
        `${stageUsage.stage_count === 1 ? "" : "s"} use it.`,
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

/* =========================================================
   Language lineages
   ========================================================= */

app.get("/api/lineages", (req, res) => {
  const includeArchived =
    req.query.includeArchived === "true";

  const lineages = db
    .prepare(`
      SELECT
        id,
        code,
        name,
        notes,
        is_archived,
        created_at,
        updated_at
      FROM language_lineages
      WHERE is_archived = 0
         OR ? = 1
      ORDER BY code
    `)
    .all(includeArchived ? 1 : 0);

  res.json(lineages);
});

app.get("/api/lineages/:id", (req, res) => {
  const lineageId = parsePositiveInteger(
    req.params.id
  );

  if (!lineageId) {
    return res.status(400).json({
      error: "Invalid lineage ID.",
    });
  }

  const lineage = db
    .prepare(`
      SELECT
        id,
        code,
        name,
        notes,
        is_archived,
        created_at,
        updated_at
      FROM language_lineages
      WHERE id = ?
    `)
    .get(lineageId);

  if (!lineage) {
    return res.status(404).json({
      error: "Language lineage not found.",
    });
  }

  const stages = db
    .prepare(`
      SELECT
        language_stages.id,
        language_stages.code,
        language_stages.name,
        language_stages.grammar_path,
        language_stages.notes,
        language_stages.is_archived,
        ages.id AS age_id,
        ages.code AS age_code,
        ages.name AS age_name,
        ages.sort_order AS age_sort_order
      FROM language_stages
      JOIN ages
        ON language_stages.age_id = ages.id
      WHERE language_stages.lineage_id = ?
      ORDER BY ages.sort_order, language_stages.code
    `)
    .all(lineageId);

  res.json({
    ...lineage,
    stages,
  });
});

app.post("/api/lineages", (req, res) => {
  const code = cleanRequiredText(req.body.code);
  const name = cleanRequiredText(req.body.name);
  const notes = cleanOptionalText(req.body.notes);

  if (!code) {
    return res.status(400).json({
      error: "Lineage code is required.",
    });
  }

  if (!name) {
    return res.status(400).json({
      error: "Lineage name is required.",
    });
  }

  try {
    const result = db
      .prepare(`
        INSERT INTO language_lineages (
          code,
          name,
          notes
        )
        VALUES (?, ?, ?)
      `)
      .run(code, name, notes);

    const lineage = db
      .prepare(`
        SELECT
          id,
          code,
          name,
          notes,
          is_archived,
          created_at,
          updated_at
        FROM language_lineages
        WHERE id = ?
      `)
      .get(Number(result.lastInsertRowid));

    return res.status(201).json(lineage);
  } catch (error) {
    if (
      error.code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return res.status(409).json({
        error:
          "A language lineage with that code already exists.",
      });
    }

    console.error(
      "Failed to create language lineage:",
      error
    );

    return res.status(500).json({
      error:
        "The language lineage could not be created.",
    });
  }
});

app.put("/api/lineages/:id", (req, res) => {
  const lineageId = parsePositiveInteger(
    req.params.id
  );

  if (!lineageId) {
    return res.status(400).json({
      error: "Invalid lineage ID.",
    });
  }

  const existingLineage = db
    .prepare(`
      SELECT id
      FROM language_lineages
      WHERE id = ?
    `)
    .get(lineageId);

  if (!existingLineage) {
    return res.status(404).json({
      error: "Language lineage not found.",
    });
  }

  const code = cleanRequiredText(req.body.code);
  const name = cleanRequiredText(req.body.name);
  const notes = cleanOptionalText(req.body.notes);

  if (!code) {
    return res.status(400).json({
      error: "Lineage code is required.",
    });
  }

  if (!name) {
    return res.status(400).json({
      error: "Lineage name is required.",
    });
  }

  try {
    db.prepare(`
      UPDATE language_lineages
      SET
        code = ?,
        name = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      code,
      name,
      notes,
      lineageId
    );

    const updatedLineage = db
      .prepare(`
        SELECT
          id,
          code,
          name,
          notes,
          is_archived,
          created_at,
          updated_at
        FROM language_lineages
        WHERE id = ?
      `)
      .get(lineageId);

    return res.json(updatedLineage);
  } catch (error) {
    if (
      error.code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return res.status(409).json({
        error:
          "A language lineage with that code already exists.",
      });
    }

    console.error(
      "Failed to update language lineage:",
      error
    );

    return res.status(500).json({
      error:
        "The language lineage could not be updated.",
    });
  }
});

app.put("/api/lineages/:id/archive", (req, res) => {
  const lineageId = parsePositiveInteger(
    req.params.id
  );

  if (!lineageId) {
    return res.status(400).json({
      error: "Invalid lineage ID.",
    });
  }

  const lineage = db
    .prepare(`
      SELECT
        id,
        code,
        is_archived
      FROM language_lineages
      WHERE id = ?
    `)
    .get(lineageId);

  if (!lineage) {
    return res.status(404).json({
      error: "Language lineage not found.",
    });
  }

  const isArchived =
    req.body.isArchived === true ||
    req.body.isArchived === 1;

  db.prepare(`
    UPDATE language_lineages
    SET
      is_archived = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(isArchived ? 1 : 0, lineageId);

  return res.json({
    id: lineageId,
    is_archived: isArchived ? 1 : 0,
    message: isArchived
      ? "Language lineage archived successfully."
      : "Language lineage restored successfully.",
  });
});

app.delete("/api/lineages/:id", (req, res) => {
  const lineageId = parsePositiveInteger(
    req.params.id
  );

  if (!lineageId) {
    return res.status(400).json({
      error: "Invalid lineage ID.",
    });
  }

  const existingLineage = db
    .prepare(`
      SELECT
        id,
        code,
        name
      FROM language_lineages
      WHERE id = ?
    `)
    .get(lineageId);

  if (!existingLineage) {
    return res.status(404).json({
      error: "Language lineage not found.",
    });
  }

  const stageUsage = db
    .prepare(`
      SELECT COUNT(*) AS stage_count
      FROM language_stages
      WHERE lineage_id = ?
    `)
    .get(lineageId);

  if (stageUsage.stage_count > 0) {
    return res.status(409).json({
      error:
        `This lineage cannot be deleted because ` +
        `${stageUsage.stage_count} language stage` +
        `${stageUsage.stage_count === 1 ? "" : "s"} use it.`,
    });
  }

  try {
    db.prepare(`
      DELETE FROM language_lineages
      WHERE id = ?
    `).run(lineageId);

    return res.json({
      id: lineageId,
      code: existingLineage.code,
      name: existingLineage.name,
      message:
        "Language lineage deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Failed to delete language lineage:",
      error
    );

    return res.status(500).json({
      error:
        "The language lineage could not be deleted.",
    });
  }
});

/* =========================================================
   Language stages
   ========================================================= */

app.get("/api/stages", (req, res) => {
  const includeArchived =
    req.query.includeArchived === "true";

  const lineageId = req.query.lineageId
    ? parsePositiveInteger(req.query.lineageId)
    : null;

  const ageId = req.query.ageId
    ? parsePositiveInteger(req.query.ageId)
    : null;

  const stages = db
    .prepare(`
      SELECT
        language_stages.id,
        language_stages.code,
        language_stages.name,
        language_stages.lineage_id,
        language_stages.age_id,
        language_stages.grammar_path,
        language_stages.notes,
        language_stages.is_archived,
        language_stages.created_at,
        language_stages.updated_at,

        language_lineages.code AS lineage_code,
        language_lineages.name AS lineage_name,

        ages.code AS age_code,
        ages.name AS age_name,
        ages.sort_order AS age_sort_order,

        (
          SELECT COUNT(*)
          FROM lexemes
          WHERE lexemes.language_stage_id =
            language_stages.id
        ) AS lexeme_count

      FROM language_stages

      JOIN language_lineages
        ON language_stages.lineage_id =
          language_lineages.id

      JOIN ages
        ON language_stages.age_id = ages.id

      WHERE
        (language_stages.is_archived = 0 OR ? = 1)

        AND (
          ? IS NULL
          OR language_stages.lineage_id = ?
        )

        AND (
          ? IS NULL
          OR language_stages.age_id = ?
        )

      ORDER BY
        ages.sort_order,
        language_lineages.code,
        language_stages.code
    `)
    .all(
      includeArchived ? 1 : 0,
      lineageId,
      lineageId,
      ageId,
      ageId
    );

  res.json(stages);
});


app.get("/api/stages/suggest-code", (req, res) => {
  const lineageId = parsePositiveInteger(
    req.query.lineageId
  );

  const ageId = parsePositiveInteger(
    req.query.ageId
  );

  if (!lineageId) {
    return res.status(400).json({
      error: "A valid lineage ID is required.",
    });
  }

  if (!ageId) {
    return res.status(400).json({
      error: "A valid age ID is required.",
    });
  }

  const lineage = db
    .prepare(`
      SELECT id, code
      FROM language_lineages
      WHERE id = ?
    `)
    .get(lineageId);

  if (!lineage) {
    return res.status(404).json({
      error: "Language lineage not found.",
    });
  }

  const age = db
    .prepare(`
      SELECT id, code
      FROM ages
      WHERE id = ?
    `)
    .get(ageId);

  if (!age) {
    return res.status(404).json({
      error: "Historical age not found.",
    });
  }

  return res.json({
    suggestedCode: `${lineage.code}-${age.code}`,
  });
});


app.get("/api/stages/:id", (req, res) => {
  const stageId = parsePositiveInteger(req.params.id);

  if (!stageId) {
    return res.status(400).json({
      error: "Invalid language-stage ID.",
    });
  }

  const stage = db
    .prepare(`
      SELECT
        language_stages.id,
        language_stages.code,
        language_stages.name,
        language_stages.lineage_id,
        language_stages.age_id,
        language_stages.grammar_path,
        language_stages.notes,
        language_stages.is_archived,
        language_stages.created_at,
        language_stages.updated_at,

        language_lineages.code AS lineage_code,
        language_lineages.name AS lineage_name,

        ages.code AS age_code,
        ages.name AS age_name,
        ages.sort_order AS age_sort_order,

        (
          SELECT COUNT(*)
          FROM lexemes
          WHERE lexemes.language_stage_id =
            language_stages.id
        ) AS lexeme_count

      FROM language_stages

      JOIN language_lineages
        ON language_stages.lineage_id =
          language_lineages.id

      JOIN ages
        ON language_stages.age_id = ages.id

      WHERE language_stages.id = ?
    `)
    .get(stageId);

  if (!stage) {
    return res.status(404).json({
      error: "Language stage not found.",
    });
  }

  const incomingRelations = db
    .prepare(`
      SELECT
        language_stage_relations.id AS relation_id,
        language_stage_relations.relation_type,
        language_stage_relations.notes,
        source_stage.id,
        source_stage.code,
        source_stage.name,
        source_lineage.code AS lineage_code,
        source_age.code AS age_code,
        source_age.sort_order AS age_sort_order

      FROM language_stage_relations

      JOIN language_stages AS source_stage
        ON language_stage_relations.source_stage_id =
          source_stage.id

      JOIN language_lineages AS source_lineage
        ON source_stage.lineage_id =
          source_lineage.id

      JOIN ages AS source_age
        ON source_stage.age_id = source_age.id

      WHERE language_stage_relations.target_stage_id = ?

      ORDER BY
        source_age.sort_order,
        source_stage.code
    `)
    .all(stageId);

  const outgoingRelations = db
    .prepare(`
      SELECT
        language_stage_relations.id AS relation_id,
        language_stage_relations.relation_type,
        language_stage_relations.notes,
        target_stage.id,
        target_stage.code,
        target_stage.name,
        target_lineage.code AS lineage_code,
        target_age.code AS age_code,
        target_age.sort_order AS age_sort_order

      FROM language_stage_relations

      JOIN language_stages AS target_stage
        ON language_stage_relations.target_stage_id =
          target_stage.id

      JOIN language_lineages AS target_lineage
        ON target_stage.lineage_id =
          target_lineage.id

      JOIN ages AS target_age
        ON target_stage.age_id = target_age.id

      WHERE language_stage_relations.source_stage_id = ?

      ORDER BY
        target_age.sort_order,
        target_stage.code
    `)
    .all(stageId);

  res.json({
    ...stage,
    incoming_relations: incomingRelations,
    outgoing_relations: outgoingRelations,
  });
});

app.get(
  "/api/stages/:id/lexicon-deletion-preview",
  (req, res) => {
    const stageId = parsePositiveInteger(
      req.params.id
    );

    if (!stageId) {
      return res.status(400).json({
        error:
          "A valid language-stage ID is required.",
      });
    }

    const stage = db
      .prepare(`
        SELECT
          stage.id,
          stage.code,
          stage.name,

          lineage.code AS lineage_code,
          age.code AS age_code

        FROM language_stages AS stage

        JOIN language_lineages AS lineage
          ON lineage.id = stage.lineage_id

        JOIN ages AS age
          ON age.id = stage.age_id

        WHERE stage.id = ?
      `)
      .get(stageId);

    if (!stage) {
      return res.status(404).json({
        error: "Language stage not found.",
      });
    }

    const lexemeCounts = db
      .prepare(`
        SELECT
          COUNT(*) AS total_count,

          COUNT(
            CASE
              WHEN is_archived = 0
              THEN 1
            END
          ) AS active_count,

          COUNT(
            CASE
              WHEN is_archived = 1
              THEN 1
            END
          ) AS archived_count,

          COUNT(
            CASE
              WHEN needs_review = 1
              THEN 1
            END
          ) AS needs_review_count

        FROM lexemes
        WHERE language_stage_id = ?
      `)
      .get(stageId);

    const relationshipCount = db
      .prepare(`
        SELECT
          COUNT(DISTINCT relation.id)
            AS relationship_count

        FROM lexeme_relations AS relation

        LEFT JOIN lexemes AS source_lexeme
          ON source_lexeme.id =
            relation.source_lexeme_id

        LEFT JOIN lexemes AS target_lexeme
          ON target_lexeme.id =
            relation.target_lexeme_id

        WHERE
          source_lexeme.language_stage_id = ?
          OR target_lexeme.language_stage_id = ?
      `)
      .get(stageId, stageId);

    const formCount = db
      .prepare(`
        SELECT COUNT(*) AS form_count

        FROM lexeme_forms AS form

        JOIN lexemes AS lexeme
          ON lexeme.id = form.lexeme_id

        WHERE lexeme.language_stage_id = ?
      `)
      .get(stageId);

    const glossCount = db
      .prepare(`
        SELECT COUNT(*) AS gloss_count

        FROM glosses AS gloss

        JOIN lexemes AS lexeme
          ON lexeme.id = gloss.lexeme_id

        WHERE lexeme.language_stage_id = ?
      `)
      .get(stageId);

    return res.json({
      stage,

      lexemeCount:
        lexemeCounts.total_count,

      activeLexemeCount:
        lexemeCounts.active_count,

      archivedLexemeCount:
        lexemeCounts.archived_count,

      needsReviewLexemeCount:
        lexemeCounts.needs_review_count,

      relationshipCount:
        relationshipCount.relationship_count,

      formCount:
        formCount.form_count,

      glossCount:
        glossCount.gloss_count,
    });
  }
);

app.delete(
  "/api/stages/:id/lexicon",
  (req, res) => {
    const stageId = parsePositiveInteger(
      req.params.id
    );

    if (!stageId) {
      return res.status(400).json({
        error:
          "A valid language-stage ID is required.",
      });
    }

    const stage = db
      .prepare(`
        SELECT
          id,
          code,
          name
        FROM language_stages
        WHERE id = ?
      `)
      .get(stageId);

    if (!stage) {
      return res.status(404).json({
        error: "Language stage not found.",
      });
    }

    const confirmationCode =
      cleanRequiredText(
        req.body.confirmationCode
      );

    if (confirmationCode !== stage.code) {
      return res.status(400).json({
        error:
          `Type ${stage.code} exactly to confirm deletion.`,
      });
    }

    const lexemeCount = db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM lexemes
        WHERE language_stage_id = ?
      `)
      .get(stageId).total;

    if (lexemeCount === 0) {
      return res.status(409).json({
        error:
          "This language stage has no lexemes to delete.",
      });
    }

    try {
      const deletedLexemeCount =
        deleteStageLexiconTransaction(stageId);

      return res.json({
        stage,
        deletedLexemeCount,

        message:
          `${deletedLexemeCount} lexeme` +
          `${deletedLexemeCount === 1 ? "" : "s"} ` +
          `were deleted from ${stage.code}.`,
      });
    } catch (error) {
      console.error(
        "Failed to delete stage lexicon:",
        error
      );

      return res.status(500).json({
        error:
          "The stage lexicon could not be deleted. No partial changes were saved.",
      });
    }
  }
);

app.post("/api/stages", (req, res) => {
  const code = cleanRequiredText(req.body.code);
  const name = cleanRequiredText(req.body.name);

  const lineageId = parsePositiveInteger(
    req.body.lineageId
  );

  const ageId = parsePositiveInteger(
    req.body.ageId
  );

  const grammarPath = cleanOptionalText(
    req.body.grammarPath
  );

  const notes = cleanOptionalText(req.body.notes);

  if (!code) {
    return res.status(400).json({
      error: "Language-stage code is required.",
    });
  }

  if (!name) {
    return res.status(400).json({
      error: "Language-stage name is required.",
    });
  }

  if (!lineageId) {
    return res.status(400).json({
      error: "A valid lineage ID is required.",
    });
  }

  if (!ageId) {
    return res.status(400).json({
      error: "A valid age ID is required.",
    });
  }

  const lineage = db
    .prepare(`
      SELECT id
      FROM language_lineages
      WHERE id = ?
    `)
    .get(lineageId);

  if (!lineage) {
    return res.status(404).json({
      error: "Language lineage not found.",
    });
  }

  const age = db
    .prepare(`
      SELECT id
      FROM ages
      WHERE id = ?
    `)
    .get(ageId);

  if (!age) {
    return res.status(404).json({
      error: "Historical age not found.",
    });
  }

  try {
    const result = db
      .prepare(`
        INSERT INTO language_stages (
          code,
          name,
          lineage_id,
          age_id,
          grammar_path,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        code,
        name,
        lineageId,
        ageId,
        grammarPath,
        notes
      );

    const stageId = Number(result.lastInsertRowid);

    const createdStage = db
      .prepare(`
        SELECT
          language_stages.id,
          language_stages.code,
          language_stages.name,
          language_stages.lineage_id,
          language_stages.age_id,
          language_stages.grammar_path,
          language_stages.notes,
          language_stages.is_archived,

          language_lineages.code AS lineage_code,
          language_lineages.name AS lineage_name,

          ages.code AS age_code,
          ages.name AS age_name,
          ages.sort_order AS age_sort_order

        FROM language_stages

        JOIN language_lineages
          ON language_stages.lineage_id =
            language_lineages.id

        JOIN ages
          ON language_stages.age_id = ages.id

        WHERE language_stages.id = ?
      `)
      .get(stageId);

    return res.status(201).json(createdStage);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error:
          "A stage with that code already exists, or this lineage already has a stage in the selected age.",
      });
    }

    console.error(
      "Failed to create language stage:",
      error
    );

    return res.status(500).json({
      error: "The language stage could not be created.",
    });
  }
});


app.put("/api/stages/:id", (req, res) => {
  const stageId = parsePositiveInteger(req.params.id);

  if (!stageId) {
    return res.status(400).json({
      error: "Invalid language-stage ID.",
    });
  }

  const existingStage = db
    .prepare(`
      SELECT id
      FROM language_stages
      WHERE id = ?
    `)
    .get(stageId);

  if (!existingStage) {
    return res.status(404).json({
      error: "Language stage not found.",
    });
  }

  const code = cleanRequiredText(req.body.code);
  const name = cleanRequiredText(req.body.name);

  const lineageId = parsePositiveInteger(
    req.body.lineageId
  );

  const ageId = parsePositiveInteger(
    req.body.ageId
  );

  const grammarPath = cleanOptionalText(
    req.body.grammarPath
  );

  const notes = cleanOptionalText(req.body.notes);

  if (!code) {
    return res.status(400).json({
      error: "Language-stage code is required.",
    });
  }

  if (!name) {
    return res.status(400).json({
      error: "Language-stage name is required.",
    });
  }

  if (!lineageId) {
    return res.status(400).json({
      error: "A valid lineage ID is required.",
    });
  }

  if (!ageId) {
    return res.status(400).json({
      error: "A valid age ID is required.",
    });
  }

  const lineage = db
    .prepare(`
      SELECT id
      FROM language_lineages
      WHERE id = ?
    `)
    .get(lineageId);

  if (!lineage) {
    return res.status(404).json({
      error: "Language lineage not found.",
    });
  }

  const age = db
    .prepare(`
      SELECT id
      FROM ages
      WHERE id = ?
    `)
    .get(ageId);

  if (!age) {
    return res.status(404).json({
      error: "Historical age not found.",
    });
  }

  try {
    db.prepare(`
      UPDATE language_stages
      SET
        code = ?,
        name = ?,
        lineage_id = ?,
        age_id = ?,
        grammar_path = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      code,
      name,
      lineageId,
      ageId,
      grammarPath,
      notes,
      stageId
    );

    const updatedStage = db
      .prepare(`
        SELECT
          language_stages.id,
          language_stages.code,
          language_stages.name,
          language_stages.lineage_id,
          language_stages.age_id,
          language_stages.grammar_path,
          language_stages.notes,
          language_stages.is_archived,

          language_lineages.code AS lineage_code,
          language_lineages.name AS lineage_name,

          ages.code AS age_code,
          ages.name AS age_name,
          ages.sort_order AS age_sort_order

        FROM language_stages

        JOIN language_lineages
          ON language_stages.lineage_id =
            language_lineages.id

        JOIN ages
          ON language_stages.age_id = ages.id

        WHERE language_stages.id = ?
      `)
      .get(stageId);

    return res.json(updatedStage);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error:
          "A stage with that code already exists, or this lineage already has a stage in the selected age.",
      });
    }

    console.error(
      "Failed to update language stage:",
      error
    );

    return res.status(500).json({
      error: "The language stage could not be updated.",
    });
  }
});


app.put("/api/stages/:id/archive", (req, res) => {
  const stageId = parsePositiveInteger(req.params.id);

  if (!stageId) {
    return res.status(400).json({
      error: "Invalid language-stage ID.",
    });
  }

  const stage = db
    .prepare(`
      SELECT id, code, is_archived
      FROM language_stages
      WHERE id = ?
    `)
    .get(stageId);

  if (!stage) {
    return res.status(404).json({
      error: "Language stage not found.",
    });
  }

  const isArchived =
    req.body.isArchived === true ||
    req.body.isArchived === 1;

  db.prepare(`
    UPDATE language_stages
    SET
      is_archived = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(isArchived ? 1 : 0, stageId);

  return res.json({
    id: stageId,
    is_archived: isArchived ? 1 : 0,
    message: isArchived
      ? "Language stage archived successfully."
      : "Language stage restored successfully.",
  });
});

const deleteStageLexiconTransaction =
  db.transaction((stageId) => {
    /*
     * Collect the stage's lexeme IDs before deleting
     * anything. These IDs are needed to remove all
     * relationships involving those lexemes.
     */
    const stageLexemes = db
      .prepare(`
        SELECT id
        FROM lexemes
        WHERE language_stage_id = ?
      `)
      .all(stageId);

    const lexemeIds = stageLexemes.map(
      (lexeme) => lexeme.id
    );

    if (lexemeIds.length === 0) {
      return 0;
    }

    /*
     * SQLite placeholders must be created dynamically
     * because the number of lexemes varies by stage.
     */
    const placeholders = lexemeIds
      .map(() => "?")
      .join(", ");

    /*
     * Remove every relationship where one of the
     * deleted stage lexemes is either the source
     * or the target.
     */
    db.prepare(`
      DELETE FROM lexeme_relations
      WHERE source_lexeme_id IN (${placeholders})
         OR target_lexeme_id IN (${placeholders})
    `).run(
      ...lexemeIds,
      ...lexemeIds
    );

    db.prepare(`
      DELETE FROM lexeme_forms
      WHERE lexeme_id IN (${placeholders})
    `).run(...lexemeIds);

    db.prepare(`
      DELETE FROM glosses
      WHERE lexeme_id IN (${placeholders})
    `).run(...lexemeIds);

    const deletionResult = db
      .prepare(`
        DELETE FROM lexemes
        WHERE language_stage_id = ?
      `)
      .run(stageId);

    return deletionResult.changes;
  });


app.delete("/api/stages/:id", (req, res) => {
  const stageId = parsePositiveInteger(req.params.id);

  if (!stageId) {
    return res.status(400).json({
      error: "Invalid language-stage ID.",
    });
  }

  const stage = db
    .prepare(`
      SELECT id, code, name
      FROM language_stages
      WHERE id = ?
    `)
    .get(stageId);

  if (!stage) {
    return res.status(404).json({
      error: "Language stage not found.",
    });
  }

  const lexemeUsage = db
    .prepare(`
      SELECT COUNT(*) AS lexeme_count
      FROM lexemes
      WHERE language_stage_id = ?
    `)
    .get(stageId);

  if (lexemeUsage.lexeme_count > 0) {
    return res.status(409).json({
      error:
        `This stage cannot be deleted because ` +
        `${lexemeUsage.lexeme_count} lexeme` +
        `${lexemeUsage.lexeme_count === 1 ? "" : "s"} use it.`,
    });
  }

  try {
    db.prepare(`
      DELETE FROM language_stages
      WHERE id = ?
    `).run(stageId);

    return res.json({
      id: stageId,
      code: stage.code,
      name: stage.name,
      message: "Language stage deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Failed to delete language stage:",
      error
    );

    return res.status(500).json({
      error: "The language stage could not be deleted.",
    });
  }
});

app.get(
  "/api/stages/:id/inheritance-import-preview",
  (req, res) => {
    const targetStageId = parsePositiveInteger(
      req.params.id
    );

    const sourceStageId = parsePositiveInteger(
      req.query.sourceStageId
    );

    const includeArchived =
      req.query.includeArchived === "true";

    if (!targetStageId) {
      return res.status(400).json({
        error:
          "A valid target language-stage ID is required.",
      });
    }

    if (!sourceStageId) {
      return res.status(400).json({
        error:
          "A valid source language-stage ID is required.",
      });
    }

    if (sourceStageId === targetStageId) {
      return res.status(400).json({
        error:
          "A language stage cannot inherit its lexicon from itself.",
      });
    }

    const sourceStage = db
      .prepare(`
        SELECT
          stage.id,
          stage.code,
          stage.name,
          stage.is_archived,
          lineage.code AS lineage_code,
          age.code AS age_code,
          age.sort_order AS age_sort_order

        FROM language_stages AS stage

        JOIN language_lineages AS lineage
          ON lineage.id = stage.lineage_id

        JOIN ages AS age
          ON age.id = stage.age_id

        WHERE stage.id = ?
      `)
      .get(sourceStageId);

    if (!sourceStage) {
      return res.status(404).json({
        error:
          "Source language stage not found.",
      });
    }

    const targetStage = db
      .prepare(`
        SELECT
          stage.id,
          stage.code,
          stage.name,
          stage.is_archived,
          lineage.code AS lineage_code,
          age.code AS age_code,
          age.sort_order AS age_sort_order

        FROM language_stages AS stage

        JOIN language_lineages AS lineage
          ON lineage.id = stage.lineage_id

        JOIN ages AS age
          ON age.id = stage.age_id

        WHERE stage.id = ?
      `)
      .get(targetStageId);

    if (!targetStage) {
      return res.status(404).json({
        error:
          "Target language stage not found.",
      });
    }

    const sourceCounts = db
      .prepare(`
        SELECT
          COUNT(*) AS total_count,

          COUNT(
            CASE
              WHEN is_archived = 0
              THEN 1
            END
          ) AS active_count,

          COUNT(
            CASE
              WHEN is_archived = 1
              THEN 1
            END
          ) AS archived_count

        FROM lexemes
        WHERE language_stage_id = ?
      `)
      .get(sourceStageId);

    const targetCount = db
      .prepare(`
        SELECT COUNT(*) AS total_count
        FROM lexemes
        WHERE language_stage_id = ?
      `)
      .get(targetStageId);

    /*
     * Count source lexemes already connected to a
     * lexeme in this target stage by inherited_from.
     */
    const alreadyImported = db
      .prepare(`
        SELECT
          COUNT(
            DISTINCT source_lexeme.id
          ) AS imported_count

        FROM lexemes AS source_lexeme

        JOIN lexeme_relations AS relation
          ON relation.source_lexeme_id =
            source_lexeme.id

        JOIN lexemes AS target_lexeme
          ON target_lexeme.id =
            relation.target_lexeme_id

        WHERE
          source_lexeme.language_stage_id = ?

          AND target_lexeme.language_stage_id = ?

          AND relation.relation_type =
            'inherited_from'

          AND (
            source_lexeme.is_archived = 0
            OR ? = 1
          )
      `)
      .get(
        sourceStageId,
        targetStageId,
        includeArchived ? 1 : 0
      );

    const classMatchCounts = db
      .prepare(`
        SELECT
          COUNT(*) AS classified_source_count,

          COUNT(
            CASE
              WHEN target_class.id IS NOT NULL
              THEN 1
            END
          ) AS matched_class_count,

          COUNT(
            CASE
              WHEN target_class.id IS NULL
              THEN 1
            END
          ) AS unmatched_class_count

        FROM lexemes AS source_lexeme

        JOIN lexeme_classes AS source_class
          ON source_class.id =
            source_lexeme.lexeme_class_id

        LEFT JOIN lexeme_classes AS target_class
          ON target_class.language_stage_id = ?
          AND target_class.normalized_name =
            source_class.normalized_name

        WHERE
          source_lexeme.language_stage_id = ?

          AND (
            source_lexeme.is_archived = 0
            OR ? = 1
          )

          AND NOT EXISTS (
            SELECT 1

            FROM lexeme_relations AS relation

            JOIN lexemes AS imported_target
              ON imported_target.id =
                relation.target_lexeme_id

            WHERE
              relation.source_lexeme_id =
                source_lexeme.id

              AND relation.relation_type =
                'inherited_from'

              AND imported_target.language_stage_id = ?
          )
      `)
      .get(
        targetStageId,
        sourceStageId,
        includeArchived ? 1 : 0,
        targetStageId
      );

    const eligibleLexemeCount =
      includeArchived
        ? sourceCounts.total_count
        : sourceCounts.active_count;

    const alreadyImportedCount =
      alreadyImported.imported_count;

    const willCreateCount = Math.max(
      0,
      eligibleLexemeCount -
        alreadyImportedCount
    );

    return res.json({
      sourceStage,
      targetStage,

      sourceLexemeCount:
        sourceCounts.total_count,

      eligibleLexemeCount,

      alreadyImportedCount,

      archivedSkippedCount:
        includeArchived
          ? 0
          : sourceCounts.archived_count,

      targetExistingLexemeCount:
        targetCount.total_count,

      willCreateCount,

      willCreateRelationshipCount:
        willCreateCount,

      classifiedSourceLexemeCount:
        classMatchCounts.classified_source_count,

      matchedClassLexemeCount:
        classMatchCounts.matched_class_count,

      unmatchedClassLexemeCount:
        classMatchCounts.unmatched_class_count,

      includeArchived,

      warnings: {
        targetIsNonempty:
          targetCount.total_count > 0,

        sourceIsArchived:
          sourceStage.is_archived === 1,

        targetIsArchived:
          targetStage.is_archived === 1,

        sourceIsNotEarlier:
          sourceStage.age_sort_order >=
          targetStage.age_sort_order,
      },
    });
  }
);

app.post(
  "/api/stages/:id/inheritance-import",
  (req, res) => {
    const targetStageId = parsePositiveInteger(
      req.params.id
    );

    const sourceStageId = parsePositiveInteger(
      req.body.sourceStageId
    );

    const includeArchived =
      req.body.includeArchived === true;

    const confirmationCode =
      cleanRequiredText(
        req.body.confirmationCode
      );

    if (!targetStageId) {
      return res.status(400).json({
        error:
          "A valid target language-stage ID is required.",
      });
    }

    if (!sourceStageId) {
      return res.status(400).json({
        error:
          "A valid source language-stage ID is required.",
      });
    }

    if (sourceStageId === targetStageId) {
      return res.status(400).json({
        error:
          "A language stage cannot inherit its lexicon from itself.",
      });
    }

    const targetStage = db
      .prepare(`
        SELECT
          id,
          code,
          name
        FROM language_stages
        WHERE id = ?
      `)
      .get(targetStageId);

    if (!targetStage) {
      return res.status(404).json({
        error:
          "Target language stage not found.",
      });
    }

    const sourceStage = db
      .prepare(`
        SELECT
          id,
          code,
          name
        FROM language_stages
        WHERE id = ?
      `)
      .get(sourceStageId);

    if (!sourceStage) {
      return res.status(404).json({
        error:
          "Source language stage not found.",
      });
    }

    if (confirmationCode !== targetStage.code) {
      return res.status(400).json({
        error:
          `Type ${targetStage.code} exactly to confirm the import.`,
      });
    }

    try {
      const createdPairs =
        importInheritedLexiconTransaction({
          sourceStageId,
          targetStageId,
          includeArchived,
        });

      const matchedClassCount =
        createdPairs.filter(
          (pair) => pair.classWasMatched
        ).length;

      const unmatchedClassCount =
        createdPairs.filter(
          (pair) => pair.classWasUnmatched
        ).length;

      return res.status(201).json({
        sourceStage,
        targetStage,
        createdLexemeCount:
          createdPairs.length,
        createdRelationshipCount:
          createdPairs.length,
        matchedClassCount,
        unmatchedClassCount,
        createdPairs,
        message:
          createdPairs.length === 0
            ? "No new inherited lexemes needed to be imported."
            : `${createdPairs.length} inherited lexemes were imported successfully.`,
      });
    } catch (error) {
      console.error(
        "Failed to import inherited lexicon:",
        error
      );

      return res.status(500).json({
        error:
          "The inherited lexicon could not be imported. No partial changes were saved.",
      });
    }
  }
);

app.get("/api/stages/:id/profile", (req, res) => {
  const stageId = parsePositiveInteger(req.params.id);

  if (!stageId) {
    return res.status(400).json({
      error: "A valid language stage ID is required.",
    });
  }

  const stage = db
    .prepare(`
      SELECT
        stage.id,
        stage.code,
        stage.name,
        stage.grammar_path,
        stage.notes,
        stage.is_archived,

        lineage.id AS lineage_id,
        lineage.code AS lineage_code,
        lineage.name AS lineage_name,

        age.id AS age_id,
        age.code AS age_code,
        age.name AS age_name,
        age.sort_order AS age_sort_order,

        COUNT(DISTINCT lexeme.id) AS lexeme_count,
        COUNT(
          DISTINCT CASE
            WHEN lexeme.is_archived = 0
            THEN lexeme.id
          END
        ) AS active_lexeme_count,
        COUNT(
          DISTINCT CASE
            WHEN lexeme.is_archived = 1
            THEN lexeme.id
          END
        ) AS archived_lexeme_count

      FROM language_stages AS stage

      JOIN language_lineages AS lineage
        ON lineage.id = stage.lineage_id

      JOIN ages AS age
        ON age.id = stage.age_id

      LEFT JOIN lexemes AS lexeme
        ON lexeme.language_stage_id = stage.id

      WHERE stage.id = ?

      GROUP BY stage.id
    `)
    .get(stageId);

  if (!stage) {
    return res.status(404).json({
      error: "Language stage not found.",
    });
  }

  const incomingRelations = db
    .prepare(`
      SELECT
        relation.id AS relation_id,
        relation.relation_type,
        relation.notes AS relationship_notes,

        source_stage.id,
        source_stage.code,
        source_stage.name,
        source_stage.is_archived,

        source_lineage.id AS lineage_id,
        source_lineage.code AS lineage_code,
        source_lineage.name AS lineage_name,

        source_age.id AS age_id,
        source_age.code AS age_code,
        source_age.name AS age_name,
        source_age.sort_order AS age_sort_order

      FROM language_stage_relations AS relation

      JOIN language_stages AS source_stage
        ON source_stage.id = relation.source_stage_id

      JOIN language_lineages AS source_lineage
        ON source_lineage.id = source_stage.lineage_id

      JOIN ages AS source_age
        ON source_age.id = source_stage.age_id

      WHERE relation.target_stage_id = ?

      ORDER BY
        source_age.sort_order,
        source_stage.code,
        relation.relation_type
    `)
    .all(stageId);

  const outgoingRelations = db
    .prepare(`
      SELECT
        relation.id AS relation_id,
        relation.relation_type,
        relation.notes AS relationship_notes,

        target_stage.id,
        target_stage.code,
        target_stage.name,
        target_stage.is_archived,

        target_lineage.id AS lineage_id,
        target_lineage.code AS lineage_code,
        target_lineage.name AS lineage_name,

        target_age.id AS age_id,
        target_age.code AS age_code,
        target_age.name AS age_name,
        target_age.sort_order AS age_sort_order

      FROM language_stage_relations AS relation

      JOIN language_stages AS target_stage
        ON target_stage.id = relation.target_stage_id

      JOIN language_lineages AS target_lineage
        ON target_lineage.id = target_stage.lineage_id

      JOIN ages AS target_age
        ON target_age.id = target_stage.age_id

      WHERE relation.source_stage_id = ?

      ORDER BY
        target_age.sort_order,
        target_stage.code,
        relation.relation_type
    `)
    .all(stageId);

  const lexemes = db
    .prepare(`
      SELECT
        lexeme.id,
        lexeme.lemma,
        lexeme.part_of_speech,
        lexeme.lexeme_class_id,
        lexeme_class.name
          AS lexeme_class_name,
        lexeme.is_archived,
        lexeme.needs_review,

        GROUP_CONCAT(
          gloss.gloss,
          ' | '
        ) AS glosses

      FROM lexemes AS lexeme

      LEFT JOIN lexeme_classes AS lexeme_class
        ON lexeme_class.id =
          lexeme.lexeme_class_id

      LEFT JOIN glosses AS gloss
        ON gloss.lexeme_id = lexeme.id

      WHERE lexeme.language_stage_id = ?

      GROUP BY lexeme.id

      ORDER BY
        lexeme.is_archived,
        lexeme.normalized_lemma,
        lexeme.id
    `)
    .all(stageId);

  res.json({
    ...stage,
    incoming_relations: incomingRelations,
    outgoing_relations: outgoingRelations,
    lexemes,
  });
});

app.get("/api/stages/:id/grammar", (req, res) => {
  const stageId = parsePositiveInteger(req.params.id);

  if (!stageId) {
    return res.status(400).json({
      error: "A valid language-stage ID is required.",
    });
  }

  const stage = db
    .prepare(`
      SELECT
        id,
        code,
        grammar_path
      FROM language_stages
      WHERE id = ?
    `)
    .get(stageId);

  if (!stage) {
    return res.status(404).json({
      error: "Language stage not found.",
    });
  }

  if (!stage.grammar_path) {
    return res.status(404).json({
      error:
        "No grammar document is assigned to this language stage.",
    });
  }

  const grammarFile = resolveVaultFile(
    stage.grammar_path
  );

  if (!grammarFile) {
    return res.status(400).json({
      error:
        "The stored grammar path is invalid or points outside the vault.",
    });
  }

  const fileExtension = path
    .extname(grammarFile.absolutePath)
    .toLocaleLowerCase();

  if (
    fileExtension !== ".md" &&
    fileExtension !== ".markdown"
  ) {
    return res.status(415).json({
      error:
        "The assigned grammar document must be a Markdown file.",
    });
  }

  if (!fs.existsSync(grammarFile.absolutePath)) {
    return res.status(404).json({
      error:
        "The grammar document could not be found in the vault.",
      grammar_path: grammarFile.relativePath,
    });
  }

  let fileStats;

  try {
    fileStats = fs.statSync(
      grammarFile.absolutePath
    );
  } catch (error) {
    console.error(
      "Failed to inspect grammar document:",
      error
    );

    return res.status(500).json({
      error:
        "The grammar document could not be inspected.",
    });
  }

  if (!fileStats.isFile()) {
    return res.status(400).json({
      error:
        "The assigned grammar path does not point to a file.",
    });
  }

  try {
    const markdown = fs.readFileSync(
      grammarFile.absolutePath,
      "utf8"
    );

    return res.json({
      stage_id: stage.id,
      stage_code: stage.code,
      grammar_path: grammarFile.relativePath,
      markdown,
      modified_at: fileStats.mtime.toISOString(),
    });
  } catch (error) {
    console.error(
      "Failed to read grammar document:",
      error
    );

    return res.status(500).json({
      error:
        "The grammar document could not be read.",
    });
  }
});

/* =========================================================
   Language-stage relationship types
   ========================================================= */

app.get("/api/stage-relation-types", (req, res) => {
  res.json(LANGUAGE_STAGE_RELATION_TYPES);
});

/* =========================================================
   Language-stage relationships
   ========================================================= */

app.get("/api/stage-relations", (req, res) => {
  const relations = db
    .prepare(`
      SELECT
        language_stage_relations.id,
        language_stage_relations.source_stage_id,
        language_stage_relations.target_stage_id,
        language_stage_relations.relation_type,
        language_stage_relations.notes,
        language_stage_relations.created_at,
        language_stage_relations.updated_at,

        source_stage.code AS source_stage_code,
        source_stage.name AS source_stage_name,
        source_lineage.code AS source_lineage_code,
        source_age.code AS source_age_code,
        source_age.sort_order AS source_age_sort_order,

        target_stage.code AS target_stage_code,
        target_stage.name AS target_stage_name,
        target_lineage.code AS target_lineage_code,
        target_age.code AS target_age_code,
        target_age.sort_order AS target_age_sort_order

      FROM language_stage_relations

      JOIN language_stages AS source_stage
        ON language_stage_relations.source_stage_id =
          source_stage.id

      JOIN language_lineages AS source_lineage
        ON source_stage.lineage_id =
          source_lineage.id

      JOIN ages AS source_age
        ON source_stage.age_id = source_age.id

      JOIN language_stages AS target_stage
        ON language_stage_relations.target_stage_id =
          target_stage.id

      JOIN language_lineages AS target_lineage
        ON target_stage.lineage_id =
          target_lineage.id

      JOIN ages AS target_age
        ON target_stage.age_id = target_age.id

      ORDER BY
        target_age.sort_order,
        target_stage.code,
        source_age.sort_order,
        source_stage.code,
        language_stage_relations.relation_type
    `)
    .all();

  res.json(relations);
});

app.get("/api/stage-relations/:id", (req, res) => {
  const relationId = parsePositiveInteger(req.params.id);

  if (!relationId) {
    return res.status(400).json({
      error: "Invalid stage-relationship ID.",
    });
  }

  const relation = db
    .prepare(`
      SELECT
        language_stage_relations.id,
        language_stage_relations.source_stage_id,
        language_stage_relations.target_stage_id,
        language_stage_relations.relation_type,
        language_stage_relations.notes,
        language_stage_relations.created_at,
        language_stage_relations.updated_at,

        source_stage.code AS source_stage_code,
        source_stage.name AS source_stage_name,
        source_age.code AS source_age_code,
        source_lineage.code AS source_lineage_code,

        target_stage.code AS target_stage_code,
        target_stage.name AS target_stage_name,
        target_age.code AS target_age_code,
        target_lineage.code AS target_lineage_code

      FROM language_stage_relations

      JOIN language_stages AS source_stage
        ON language_stage_relations.source_stage_id =
          source_stage.id

      JOIN language_lineages AS source_lineage
        ON source_stage.lineage_id =
          source_lineage.id

      JOIN ages AS source_age
        ON source_stage.age_id = source_age.id

      JOIN language_stages AS target_stage
        ON language_stage_relations.target_stage_id =
          target_stage.id

      JOIN language_lineages AS target_lineage
        ON target_stage.lineage_id =
          target_lineage.id

      JOIN ages AS target_age
        ON target_stage.age_id = target_age.id

      WHERE language_stage_relations.id = ?
    `)
    .get(relationId);

  if (!relation) {
    return res.status(404).json({
      error: "Language-stage relationship not found.",
    });
  }

  res.json(relation);
});

app.post("/api/stage-relations", (req, res) => {
  const sourceStageId = parsePositiveInteger(
    req.body.sourceStageId
  );

  const targetStageId = parsePositiveInteger(
    req.body.targetStageId
  );

  const relationType = cleanRequiredText(
    req.body.relationType
  );

  const notes = cleanOptionalText(req.body.notes);

  if (!sourceStageId) {
    return res.status(400).json({
      error: "A valid source-stage ID is required.",
    });
  }

  if (!targetStageId) {
    return res.status(400).json({
      error: "A valid target-stage ID is required.",
    });
  }

  if (sourceStageId === targetStageId) {
    return res.status(400).json({
      error:
        "A language stage cannot have a relationship with itself.",
    });
  }

  if (
    !relationType ||
    !LANGUAGE_STAGE_RELATION_TYPE_CODES.has(relationType)
  ) {
    return res.status(400).json({
      error: "A valid stage-relationship type is required.",
    });
  }

  const sourceStage = db
    .prepare(`
      SELECT
        language_stages.id,
        language_stages.code,
        ages.sort_order AS age_sort_order
      FROM language_stages
      JOIN ages
        ON language_stages.age_id = ages.id
      WHERE language_stages.id = ?
    `)
    .get(sourceStageId);

  if (!sourceStage) {
    return res.status(404).json({
      error: "Source language stage not found.",
    });
  }

  const targetStage = db
    .prepare(`
      SELECT
        language_stages.id,
        language_stages.code,
        ages.sort_order AS age_sort_order
      FROM language_stages
      JOIN ages
        ON language_stages.age_id = ages.id
      WHERE language_stages.id = ?
    `)
    .get(targetStageId);

  if (!targetStage) {
    return res.status(404).json({
      error: "Target language stage not found.",
    });
  }

  /*
   * We deliberately do not reject same-age or reverse-age links here.
   *
   * Same-age links may be valid for contact, mixed-language formation,
   * pidginization, or broad age snapshots. Chronological warnings can
   * be added to the frontend later without making the database too rigid.
   */

  try {
    const result = db
      .prepare(`
        INSERT INTO language_stage_relations (
          source_stage_id,
          target_stage_id,
          relation_type,
          notes
        )
        VALUES (?, ?, ?, ?)
      `)
      .run(
        sourceStageId,
        targetStageId,
        relationType,
        notes
      );

    const relationId = Number(result.lastInsertRowid);

    const createdRelation = db
      .prepare(`
        SELECT
          language_stage_relations.id,
          language_stage_relations.source_stage_id,
          language_stage_relations.target_stage_id,
          language_stage_relations.relation_type,
          language_stage_relations.notes,
          language_stage_relations.created_at,
          language_stage_relations.updated_at,

          source_stage.code AS source_stage_code,
          source_stage.name AS source_stage_name,

          target_stage.code AS target_stage_code,
          target_stage.name AS target_stage_name

        FROM language_stage_relations

        JOIN language_stages AS source_stage
          ON language_stage_relations.source_stage_id =
            source_stage.id

        JOIN language_stages AS target_stage
          ON language_stage_relations.target_stage_id =
            target_stage.id

        WHERE language_stage_relations.id = ?
      `)
      .get(relationId);

    return res.status(201).json(createdRelation);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error:
          "That exact language-stage relationship already exists.",
      });
    }

    if (error.code === "SQLITE_CONSTRAINT_CHECK") {
      return res.status(400).json({
        error:
          "A language stage cannot have a relationship with itself.",
      });
    }

    console.error(
      "Failed to create language-stage relationship:",
      error
    );

    return res.status(500).json({
      error:
        "The language-stage relationship could not be created.",
    });
  }
});

app.put("/api/stage-relations/:id", (req, res) => {
  const relationId = parsePositiveInteger(req.params.id);

  if (!relationId) {
    return res.status(400).json({
      error: "Invalid stage-relationship ID.",
    });
  }

  const existingRelation = db
    .prepare(`
      SELECT
        id,
        source_stage_id,
        target_stage_id
      FROM language_stage_relations
      WHERE id = ?
    `)
    .get(relationId);

  if (!existingRelation) {
    return res.status(404).json({
      error: "Language-stage relationship not found.",
    });
  }

  const relationType = cleanRequiredText(
    req.body.relationType
  );

  const notes = cleanOptionalText(req.body.notes);

  if (
    !relationType ||
    !LANGUAGE_STAGE_RELATION_TYPE_CODES.has(relationType)
  ) {
    return res.status(400).json({
      error: "A valid stage-relationship type is required.",
    });
  }

  try {
    db.prepare(`
      UPDATE language_stage_relations
      SET
        relation_type = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(relationType, notes, relationId);

    const updatedRelation = db
      .prepare(`
        SELECT
          language_stage_relations.id,
          language_stage_relations.source_stage_id,
          language_stage_relations.target_stage_id,
          language_stage_relations.relation_type,
          language_stage_relations.notes,
          language_stage_relations.created_at,
          language_stage_relations.updated_at,

          source_stage.code AS source_stage_code,
          source_stage.name AS source_stage_name,

          target_stage.code AS target_stage_code,
          target_stage.name AS target_stage_name

        FROM language_stage_relations

        JOIN language_stages AS source_stage
          ON language_stage_relations.source_stage_id =
            source_stage.id

        JOIN language_stages AS target_stage
          ON language_stage_relations.target_stage_id =
            target_stage.id

        WHERE language_stage_relations.id = ?
      `)
      .get(relationId);

    return res.json(updatedRelation);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error:
          "That exact language-stage relationship already exists.",
      });
    }

    console.error(
      "Failed to update language-stage relationship:",
      error
    );

    return res.status(500).json({
      error:
        "The language-stage relationship could not be updated.",
    });
  }
});

app.delete("/api/stage-relations/:id", (req, res) => {
  const relationId = parsePositiveInteger(req.params.id);

  if (!relationId) {
    return res.status(400).json({
      error: "Invalid stage-relationship ID.",
    });
  }

  const existingRelation = db
    .prepare(`
      SELECT
        language_stage_relations.id,
        language_stage_relations.relation_type,
        source_stage.code AS source_stage_code,
        target_stage.code AS target_stage_code

      FROM language_stage_relations

      JOIN language_stages AS source_stage
        ON language_stage_relations.source_stage_id =
          source_stage.id

      JOIN language_stages AS target_stage
        ON language_stage_relations.target_stage_id =
          target_stage.id

      WHERE language_stage_relations.id = ?
    `)
    .get(relationId);

  if (!existingRelation) {
    return res.status(404).json({
      error: "Language-stage relationship not found.",
    });
  }

  try {
    db.prepare(`
      DELETE FROM language_stage_relations
      WHERE id = ?
    `).run(relationId);

    return res.json({
      id: relationId,
      source_stage_code:
        existingRelation.source_stage_code,
      target_stage_code:
        existingRelation.target_stage_code,
      relation_type: existingRelation.relation_type,
      message:
        "Language-stage relationship deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Failed to delete language-stage relationship:",
      error
    );

    return res.status(500).json({
      error:
        "The language-stage relationship could not be deleted.",
    });
  }
});

/* =========================================================
   Start server
   ========================================================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Lexicon server running on port ${PORT}`
  );
});