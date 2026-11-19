/**
 * Message to show the user for a thrown value. `fetchPrivate` throws `Error`s with the API's
 * message; anything else (strings, unknown objects) falls back to the supplied default.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  if (error && typeof error === 'object') {
    const candidate =
      (error as { message?: unknown; error?: unknown }).message ?? (error as { error?: unknown }).error
    if (typeof candidate === 'string' && candidate) return candidate
  }
  return fallback
}
