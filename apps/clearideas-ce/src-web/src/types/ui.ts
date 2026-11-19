/** Shared UI-level types that are not part of the API domain model. */

/**
 * The subset of a Pinia store that `StatusIcon` subscribes to. Declared with method syntax so
 * that any Pinia store (whose listener context is a superset) is assignable.
 */
export interface ActionStore {
  $onAction(
    callback: (context: {
      name: string
      after: (callback: () => void) => void
      onError: (callback: (error: unknown) => void) => void
    }) => void,
  ): () => void
}

/** Visual role of a button; maps to colour + variant in `BaseButton`. */
export type ButtonIntent = 'primary' | 'secondary' | 'tertiary' | 'danger'
