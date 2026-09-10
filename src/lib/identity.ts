export interface Identity {
  /**
   * Server-controlled user identifier.
   *
   * This must never be trusted from localStorage.
   */
  id: string;

  /**
   * Display name.
   */
  name: string;

  /**
   * Authenticated account email.
   */
  email: string;

  /**
   * Whether the current server session
   * belongs to a real account.
   */
  authenticated: boolean;
}

const KEY =
  "ia_identity_profile_v2";

export function cleanEmail(
  value: string,
): string {
  return (
    value ||
    ""
  )
    .trim()
    .toLowerCase();
}

export function isRegisteredEmail(
  value: string,
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    cleanEmail(value),
  );
}

/**
 * Gets identity from the server.
 *
 * localStorage is NOT used for authentication.
 */
export async function loadIdentity(): Promise<Identity> {
  const response =
    await fetch(
      "/api/auth/session",
      {
        method: "GET",

        credentials:
          "include",

        cache:
          "no-store",
      },
    );

  if (!response.ok) {
    throw new Error(
      "Could not establish a secure session.",
    );
  }

  const data =
    (await response.json()) as {
      authenticated?: boolean;
      id?: string;
      name?: string;
      email?: string;
    };

  const identity: Identity = {
    id:
      data.id ||
      "",

    name:
      data.name ||
      "Candidate",

    email:
      cleanEmail(
        data.email ||
          "",
      ),

    authenticated:
      data.authenticated ===
      true,
  };

  /*
   * Store only display information.
   *
   * NEVER store/use this as authentication.
   */
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        name:
          identity.name,

        email:
          identity.email,
      }),
    );
  } catch {
    // Ignore storage failures.
  }

  return identity;
}

export function saveIdentity(
  identity: Identity,
): void {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        name:
          identity.name,

        email:
          identity.email,
      }),
    );
  } catch {
    // Ignore storage failures.
  }
}

export function toRegistered(
  _previous: Identity,
  name: string,
  email: string,
): Identity {
  const normalizedEmail =
    cleanEmail(email);

  const identity: Identity = {
    id:
      normalizedEmail,

    name:
      name.trim() ||
      "Candidate",

    email:
      normalizedEmail,

    authenticated:
      true,
  };

  saveIdentity(
    identity,
  );

  return identity;
}