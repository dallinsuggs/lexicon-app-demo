const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:3001/api";

const DEMO_SESSION_STORAGE_KEY =
  "lexiconDemoSessionId";

/*
 * If several components make API requests immediately
 * when the app loads, they all share this one promise
 * instead of accidentally creating several sessions.
 */
let sessionCreationPromise = null;

async function createDemoSession() {
  const response = await fetch(
    `${API_BASE_URL}/demo/session`,
    {
      method: "POST",
    }
  );

  const responseData =
    await response.json();

  if (!response.ok) {
    throw new Error(
      responseData.error ||
        "A demo session could not be created."
    );
  }

  const sessionId =
    responseData.sessionId;

  if (!sessionId) {
    throw new Error(
      "The demo server did not return a session ID."
    );
  }

  localStorage.setItem(
    DEMO_SESSION_STORAGE_KEY,
    sessionId
  );

  return sessionId;
}

export async function ensureDemoSession() {
  const existingSessionId =
    localStorage.getItem(
      DEMO_SESSION_STORAGE_KEY
    );

  if (existingSessionId) {
    return existingSessionId;
  }

  if (!sessionCreationPromise) {
    sessionCreationPromise =
      createDemoSession()
        .finally(() => {
          sessionCreationPromise = null;
        });
  }

  return sessionCreationPromise;
}

export function clearDemoSession() {
  localStorage.removeItem(
    DEMO_SESSION_STORAGE_KEY
  );
}

export function getDemoSessionId() {
  return localStorage.getItem(
    DEMO_SESSION_STORAGE_KEY
  );
}

export async function apiFetch(
  endpoint,
  options = {},
  allowSessionRetry = true
) {
  const sessionId =
    await ensureDemoSession();

  const headers = new Headers(
    options.headers || {}
  );

  headers.set(
    "X-Demo-Session",
    sessionId
  );

  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      ...options,
      headers,
    }
  );

  /*
   * An ephemeral hosting service may destroy the
   * visitor's DB while localStorage still remembers
   * the old session ID.
   *
   * If that happens, discard the stale ID, create a
   * fresh demo session, and retry this request once.
   */
  if (
    response.status === 401 &&
    allowSessionRetry
  ) {
    clearDemoSession();

    await ensureDemoSession();

    return apiFetch(
      endpoint,
      options,
      false
    );
  }

  return response;
}

export { API_BASE_URL };