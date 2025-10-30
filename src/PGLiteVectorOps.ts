import { Effect } from "effect"
import { PGLiteVectorService } from "./PGLiteVectorService.js"

export class PGLiteVectorOps extends Effect.Service<PGLiteVectorOps>()("PGLiteVectorOps", {
  effect: Effect.gen(function*() {
    const pglite = yield* PGLiteVectorService

    const hybridSearch = (query: string, queryEmbedding: Array<number>, options?: {
      limit?: number
      similarityThreshold?: number
      filters?: { type?: string }
    }) =>
      Effect.gen(function*() {
        const { filters = {}, limit = 10, similarityThreshold = 0.7 } = options || {}

        const params: Array<any> = [queryEmbedding, similarityThreshold]
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
          pglite.db.query<{
            id: string
            content: string
            embedding: Array<number>
            type: "order" | "product" | "user"
            entity_id: string
            metadata?: Record<string, any>
            similarity: number
          }>(
            `SELECT 
                id,
                content,
                type,
                entity_id,
                metadata,
                1 - (embedding <=> $1) as similarity
              FROM embeddings
              WHERE ${whereConditions.join(" AND ")}
                AND (1 - (embedding <=> $1)) >= $2
              ORDER BY embedding <=> $1
              LIMIT $${params.length}
            `,
            params
          )
        )

        return results.rows
      })

    const semanticSearch = (queryEmbedding: Array<number>, options: {
      limit?: number
      similarityThreshold?: number
      filters?: { type?: string; entity_id?: string }
    } = {}) =>
      Effect.gen(function*() {
        const { filters = {}, limit = 10, similarityThreshold = 0.7 } = options

        const whereConditions = ["1 <= 2"] // Always true base condition
        const params: any[] = [queryEmbedding, similarityThreshold]

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
          pglite.db.query<{
            id: string
            content: string
            embedding: Array<number>
            type: "order" | "product" | "user"
            entity_id: string
            metadata?: Record<string, any>
            similarity: number
          }>(
            `SELECT 
                id,
                content,
                type,
                entity_id,
                metadata,
                1 - (embedding <=> $1) as similarity
              FROM embeddings
              WHERE ${whereConditions.join(" AND ")}
                AND (1 - (embedding <=> $1)) >= $2
              ORDER BY embedding <=> $1
              LIMIT $${params.length}
            `,
            params
          )
        )

        return results.rows
      })

    const storeEmbedding = (data: {
      id: string
      content: string
      embedding: Array<number>
      type: "order" | "product" | "user"
      entity_id: string
      metadata?: Record<string, any>
    }) =>
      Effect.tryPromise(() =>
        pglite.db.query(
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
            data.embedding,
            data.type,
            data.entity_id,
            JSON.stringify(data.metadata || {})
          ]
        )
      )

    // Advanced vector operations
    const storeEmbeddingBatch = (
      items: Array<{
        id: string
        content: string
        embedding: Array<number>
        type: string
        entity_id: string
        metadata?: Record<string, any>
      }>
    ) =>
      Effect.tryPromise(() =>
        pglite.db.query(
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
            item.embedding,
            item.type,
            item.entity_id,
            JSON.stringify(item.metadata || {})
          ])
        )
      )

    return {
      hybridSearch,
      semanticSearch,
      storeEmbedding,
      storeEmbeddingBatch
    }
  })
}) {}
