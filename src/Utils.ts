import { Effect } from "effect"
import { PGLiteVectorService } from "./PGLiteVectorService.js"

// Additional vector capabilities
export const advancedVectorOps = Effect.gen(function*() {
  const pglite = yield* PGLiteVectorService

  // Average embedding for a set of items
  const averageEmbedding = (ids: Array<string>) =>
    Effect.tryPromise(() =>
      pglite.db.query<{ avg_embedding: number }>(
        `
          SELECT AVG(embedding) as avg_embedding
          FROM embeddings 
          WHERE id = ANY($1)
        `,
        [ids]
      )
    ).pipe(Effect.catchTag("UnknownException", Effect.die))

  // Find similar items to a given item
  const findSimilar = (itemId: string, limit: number = 5) =>
    Effect.tryPromise(() =>
      pglite.db.query<{
        id: string
        content: string
        // embedding: Array<number>
        type: "order" | "product" | "user"
        // entity_id: string
        // metadata?: Record<string, any>
        similarity: number
      }>(
        `
          WITH target AS (
            SELECT embedding FROM embeddings WHERE id = $1
          )
          SELECT 
            e.id,
            e.content, 
            e.type,
            1 - (e.embedding <=> t.embedding) as similarity
          FROM embeddings e, target t
          WHERE e.id != $1
          ORDER BY e.embedding <=> t.embedding
          LIMIT $2
        `,
        [itemId, limit]
      )
    ).pipe(Effect.catchTag("UnknownException", Effect.die))

  return { averageEmbedding, findSimilar }
})
