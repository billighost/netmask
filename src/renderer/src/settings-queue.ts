// Keep persisted values separate from optimistic UI values. All native writes
// run in order, so a failed intermediate write cannot overwrite a newer choice.
export function createSettingsQueue<T extends object>(
  initial: T,
  persist: <K extends keyof T>(key: K, value: T[K]) => Promise<unknown>,
  rollback: <K extends keyof T>(key: K, value: T[K]) => void,
  reportError: (error: unknown) => void
) {
  let confirmed = { ...initial }
  let sequence = 0
  let tail: Promise<unknown> = Promise.resolve()
  const pending = new Map<keyof T, { sequence: number; value: T[keyof T] }>()
  return {
    initialize(values: T): T {
      confirmed = { ...values }
      const optimistic = { ...values }
      for (const [key, request] of pending) optimistic[key] = request.value
      return optimistic
    },
    write<K extends keyof T>(key: K, value: T[K]): Promise<boolean> {
      const request = { sequence: ++sequence, value }
      pending.set(key, request)
      const result = tail.then(async () => {
        try {
          await persist(key, value)
          confirmed = { ...confirmed, [key]: value }
          if (pending.get(key)?.sequence === request.sequence) pending.delete(key)
          return true
        } catch (error) {
          if (pending.get(key)?.sequence === request.sequence) {
            pending.delete(key)
            rollback(key, confirmed[key])
          }
          reportError(error)
          return false
        }
      })
      tail = result
      return result
    }
  }
}
