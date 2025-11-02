import { Effect, Schema } from "effect"
import { PGLiteVectorService } from "./PGLiteVectorService.js"

export const In = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  embedding: Schema.Array(Schema.Number),
  type: Schema.Literal("order", "product", "user"),
  entity_id: Schema.String,
  metadata: Schema.optionalWith(
    Schema.Record({ key: Schema.String, value: Schema.Any }),
    { exact: true }
  )
})
export type In = typeof In.Type

export const Out = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  type: Schema.Literal("order", "product", "user"),
  entity_id: Schema.String,
  metadata: Schema.optionalWith(
    Schema.Record({ key: Schema.String, value: Schema.Any }),
    { exact: true }
  ),
  similarity: Schema.Number
})
export type Out = typeof Out.Type

export class PGLiteVectorOps extends Effect.Service<PGLiteVectorOps>()("PGLiteVectorOps", {
  effect: Effect.gen(function*() {
    const pglite = yield* PGLiteVectorService

    // Helper function to format embeddings for PGLite
    const formatEmbedding = (embedding: ReadonlyArray<number>): string => {
      return `[${embedding.join(",")}]`
    }

    // Average embedding for a set of items
    const averageEmbedding = (ids: Array<string>) =>
      Effect.gen(function*() {
        const result = yield* Effect.tryPromise(() =>
          pglite.db.query<{ avg_embedding: string }>(
            `SELECT AVG(embedding) as avg_embedding
              FROM embeddings 
              WHERE id = ANY($1)
            `,
            [ids]
          )
        ).pipe(Effect.catchTag("UnknownException", Effect.die))

        const resultRows = result.rows.map((row) => ({
          avg_embedding: JSON.parse(row.avg_embedding) as Array<number>
        }))

        return resultRows
      })

    // Find similar items to a given item
    const findSimilar = (itemId: string, options?: {
      limit?: number
    }) =>
      Effect.gen(function*() {
        const { limit = 5 } = options || {}

        const result = yield* Effect.tryPromise(() =>
          pglite.db.query<Out>(
            `
              WITH target AS (
                SELECT embedding FROM embeddings WHERE id = $1
              )
              SELECT e.id, e.content, e.type, e.entity_id, e.metadata, 1 - (e.embedding <=> t.embedding) as similarity
                FROM embeddings e, target t
                WHERE e.id != $1
                ORDER BY e.embedding <=> t.embedding
                LIMIT $2
            `,
            [itemId, limit]
          )
        ).pipe(Effect.catchTag("UnknownException", Effect.die))

        return result.rows
      })

    const hybridSearch = (query: string, queryEmbedding: Array<number>, options?: {
      filters?: { type?: string }
      limit?: number
      similarityThreshold?: number
    }) =>
      Effect.gen(function*() {
        const { filters = {}, limit = 10, similarityThreshold = 0.7 } = options || {}

        // Format the query embedding for PGLite
        const formattedEmbedding = formatEmbedding(queryEmbedding)
        const params: Array<any> = [formattedEmbedding, similarityThreshold]
        const whereConditions = ["1 <= 2"]

        if (filters.type) {
          params.push(filters.type)
          whereConditions.push(`type = $${params.length}`)
        }

        if (query) {
          params.push(`%${query}%`)
          whereConditions.push(`content ILIKE $${params.length}`)
        }

        params.push(limit)

        const results = yield* Effect.tryPromise(() =>
          pglite.db.query<Out>(
            `SELECT id, content, type, entity_id, metadata, 1 - (embedding <=> $1) as similarity
              FROM embeddings
              WHERE ${whereConditions.join(" AND ")} AND (1 - (embedding <=> $1)) >= $2
              ORDER BY embedding <=> $1
              LIMIT $${params.length}
            `,
            params
          )
        ).pipe(Effect.catchTag("UnknownException", Effect.die))

        return results.rows
      })

    const semanticSearch = (queryEmbedding: Array<number>, options?: {
      filters?: { entity_id?: string; type?: string }
      limit?: number
      similarityThreshold?: number
    }) =>
      Effect.gen(function*() {
        const { filters = {}, limit = 10, similarityThreshold = 0.7 } = options || {}

        // Format the query embedding for PGLite
        const formattedEmbedding = formatEmbedding(queryEmbedding)
        const params: Array<any> = [formattedEmbedding, similarityThreshold]
        const whereConditions = ["1 <= 2"]

        if (filters.type) {
          params.push(filters.type)
          whereConditions.push(`type = $${params.length}`)
        }

        if (filters.entity_id) {
          params.push(filters.entity_id)
          whereConditions.push(`entity_id = $${params.length}`)
        }

        params.push(limit)

        const results = yield* Effect.tryPromise(() =>
          pglite.db.query<Out>(
            `SELECT id, content, type, entity_id, metadata, 1 - (embedding <=> $1) as similarity
              FROM embeddings
              WHERE ${whereConditions.join(" AND ")} AND (1 - (embedding <=> $1)) >= $2
              ORDER BY embedding <=> $1
              LIMIT $${params.length}
            `,
            params
          )
        ).pipe(Effect.catchTag("UnknownException", Effect.die))

        return results.rows
      })

    const storeEmbedding = (data: In) =>
      Effect.tryPromise(() =>
        pglite.db.query<void>(
          `INSERT INTO embeddings (id, content, embedding, type, entity_id, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
              content = EXCLUDED.content,
              embedding = EXCLUDED.embedding,
              metadata = EXCLUDED.metadata,
              created_at = NOW()
          `,
          [
            data.id,
            data.content,
            formatEmbedding(data.embedding),
            data.type,
            data.entity_id,
            JSON.stringify(data.metadata || {})
          ]
        )
      ).pipe(Effect.catchTag("UnknownException", Effect.die))

    // Advanced vector operations
    const storeEmbeddingBatch = (items: Array<In>) =>
      Effect.tryPromise(() =>
        pglite.db.query<void>(
          `INSERT INTO embeddings (id, content, embedding, type, entity_id, metadata)
            VALUES ${
            items.map((_, i) =>
              `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
            ).join(", ")
          }
          ON CONFLICT (id) DO UPDATE SET
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            metadata = EXCLUDED.metadata,
            created_at = NOW()
        `,
          items.flatMap((item) => [
            item.id,
            item.content,
            formatEmbedding(item.embedding),
            item.type,
            item.entity_id,
            JSON.stringify(item.metadata || {})
          ])
        )
      ).pipe(Effect.catchTag("UnknownException", Effect.die))

    return {
      averageEmbedding,
      findSimilar,
      hybridSearch,
      semanticSearch,
      storeEmbedding,
      storeEmbeddingBatch
    }
  })
}) {}
