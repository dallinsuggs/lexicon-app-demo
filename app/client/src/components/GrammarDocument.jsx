import { apiFetch } from "../api";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/*
 * Produces matching IDs for both:
 *
 * Chapter 1 - Typology & Phonotactics
 *
 * and:
 *
 * #chapter-1-typology-phonotactics
 */
function createHeadingId(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/*
 * Extracts plain text from React heading children.
 */
function getTextContent(children) {
  if (
    typeof children === "string" ||
    typeof children === "number"
  ) {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children
      .map(getTextContent)
      .join("");
  }

  if (
    children &&
    typeof children === "object" &&
    "props" in children
  ) {
    return getTextContent(
      children.props.children
    );
  }

  return "";
}

/*
 * Converts standalone Obsidian heading links like:
 *
 * [[C6-L1-A0#Chapter 1 - Typology & Phonotactics]]
 *
 * into:
 *
 * - [Chapter 1 - Typology & Phonotactics](#chapter-1-typology-and-phonotactics)
 */
function prepareGrammarMarkdown(markdown) {
  return markdown
    .split("\n")
    .map((line) => {
      const match = line
        .trim()
        .match(/^\[\[[^#\]]+#([^\]]+)\]\]$/);

      if (!match) {
        return line;
      }

      const headingText = match[1].trim();
      const headingId =
        createHeadingId(headingText);

      return `- [${headingText}](#${headingId})`;
    })
    .join("\n");
}

function MarkdownHeading({
  level,
  children,
}) {
  const headingText =
    getTextContent(children);

  const headingId =
    createHeadingId(headingText);

  const HeadingTag = `h${level}`;

  return (
    <HeadingTag id={headingId}>
      {children}
    </HeadingTag>
  );
}

const markdownComponents = {
  h1: ({ children }) => (
    <MarkdownHeading level={1}>
      {children}
    </MarkdownHeading>
  ),

  h2: ({ children }) => (
    <MarkdownHeading level={2}>
      {children}
    </MarkdownHeading>
  ),

  h3: ({ children }) => (
    <MarkdownHeading level={3}>
      {children}
    </MarkdownHeading>
  ),

  h4: ({ children }) => (
    <MarkdownHeading level={4}>
      {children}
    </MarkdownHeading>
  ),

  h5: ({ children }) => (
    <MarkdownHeading level={5}>
      {children}
    </MarkdownHeading>
  ),

  h6: ({ children }) => (
    <MarkdownHeading level={6}>
      {children}
    </MarkdownHeading>
  ),
};

function GrammarDocument({
  stageId,
  grammarPath,
}) {
  const [isExpanded, setIsExpanded] =
    useState(false);

  const [grammar, setGrammar] =
    useState(null);

  const [isLoading, setIsLoading] =
    useState(false);

  const [loadError, setLoadError] =
    useState("");

  useEffect(() => {
    setIsExpanded(false);
    setGrammar(null);
    setLoadError("");
  }, [stageId, grammarPath]);

  async function loadGrammar() {
    if (grammar) {
      setIsExpanded(true);
      return;
    }

    try {
      setIsLoading(true);
      setLoadError("");

      const response = await apiFetch(
        `/stages/${stageId}/grammar`
      );

      const responseText =
        await response.text();

      let responseData;

      try {
        responseData =
          JSON.parse(responseText);
      } catch {
        throw new Error(
          "The grammar request returned an invalid response."
        );
      }

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "The grammar document could not be loaded."
        );
      }

      setGrammar(responseData);
      setIsExpanded(true);
    } catch (error) {
      console.error(error);
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleToggle() {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    loadGrammar();
  }

  const preparedMarkdown = grammar
    ? prepareGrammarMarkdown(
        grammar.markdown
      )
    : "";

  return (
    <div className="grammar-document">
      <div className="grammar-document-toolbar">
        <div>
          <code>{grammarPath}</code>

          {grammar?.modified_at && (
            <p className="field-help">
              Last modified{" "}
              {new Date(
                grammar.modified_at
              ).toLocaleString()}
            </p>
          )}
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={handleToggle}
          disabled={isLoading}
        >
          {isLoading
            ? "Loading..."
            : isExpanded
              ? "Hide grammar"
              : "View grammar"}
        </button>
      </div>

      {loadError && (
        <p className="error-message grammar-load-error">
          {loadError}
        </p>
      )}

      {isExpanded && grammar && (
        <article className="markdown-document">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {preparedMarkdown}
          </ReactMarkdown>
        </article>
      )}
    </div>
  );
}

export default GrammarDocument;