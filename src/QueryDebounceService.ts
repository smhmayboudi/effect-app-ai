import { type Duration, Effect, Queue, Ref } from "effect"

export class QueryDebounceService extends Effect.Service<QueryDebounceService>()("QueryDebounceService", {
  effect: Effect.gen(function*() {
    const pendingQueries = yield* Ref.make(new Map<string, Queue.Queue<string>>())

    return {
      debounceQuery: <T>(key: string, query: Effect.Effect<T>, delay: Duration.DurationInput = "200 millis") =>
        Effect.gen(function*() {
          const queries = yield* Ref.get(pendingQueries)
          const existing = queries.get(key)

          if (existing) {
            return yield* Queue.take(existing)
          }

          const queue = yield* Queue.unbounded<string>()
          yield* Ref.update(pendingQueries, (map) => map.set(key, queue))

          const result = yield* query
          yield* Effect.sleep(delay)
          yield* Queue.offer(queue, JSON.stringify(result))
          yield* Ref.update(pendingQueries, (map) => {
            map.delete(key)
            return map
          })

          return result
        })
    }
  })
}) {}
