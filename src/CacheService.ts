import { Effect, Option, Ref } from "effect"

export class CacheService extends Effect.Service<CacheService>()("CacheService", {
  effect: Effect.gen(function*() {
    const cacheRef = yield* Ref.make(new Map<string, { data: any; timestamp: number }>())
    const TTL = 5 * 60 * 1000 // 5 minutes

    return {
      get: (key: string) =>
        Effect.gen(function*() {
          const cache = yield* Ref.get(cacheRef)
          const item = cache.get(key)
          if (item && Date.now() - item.timestamp < TTL) {
            return Option.some(item.data)
          }
          return Option.none
        }),

      set: (key: string, data: any) => Ref.update(cacheRef, (cache) => cache.set(key, { data, timestamp: Date.now() })),

      clear: () => Ref.set(cacheRef, new Map())
    }
  })
}) {}
