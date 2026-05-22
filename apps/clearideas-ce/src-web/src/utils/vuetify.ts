export function getVuetifyItemRaw<T>(item: unknown): T {
  if (item != null && typeof item === 'object' && 'raw' in item) {
    return (item as { raw: T }).raw
  }

  return item as T
}
