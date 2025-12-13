/**
 * @since 1.0.0
 * @category models
 */

import { Effect, Option, Ref } from "effect"

/**
 * @since 1.0.0
 * @category models
 * @description Service for managing in-memory cache with TTL (Time To Live) functionality.
 */
export class CacheService extends Effect.Service<CacheService>()("CacheService", {
  effect: Effect.gen(function*() {
    const cacheRef = yield* Ref.make(new Map<string, { data: any; timestamp: number }>())
    const TTL = 5 * 60 * 1000 // 5 minutes

    return {
      /**
       * @description Retrieves a value from the cache by key if it exists and hasn't expired
       * @param key The cache key to retrieve
       * @returns An Option containing the cached value if found and not expired, otherwise None
       */
      get: (key: string) =>
        Effect.gen(function*() {
          const cache = yield* Ref.get(cacheRef)
          const item = cache.get(key)
          if (item && Date.now() - item.timestamp < TTL) {
            return Option.some(item.data)
          }
          return Option.none
        }),

      /**
       * @description Sets a value in the cache with the current timestamp
       * @param key The cache key to set
       * @param data The data to store in the cache
       */
      set: (key: string, data: any) => Ref.update(cacheRef, (cache) => cache.set(key, { data, timestamp: Date.now() })),

      /**
       * @description Clears all entries from the cache
       */
      clear: () => Ref.set(cacheRef, new Map())
    }
  })
}) {}
