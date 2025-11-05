import { Effect } from "effect"
import { VectorStoreError } from "./Errors.js"
import { PGLiteVectorService } from "./PGLiteVectorService.js"
import type { EmbeddingInput, EmbeddingOutput } from "./Schemas.js"

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
        ).pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: `Failed to calculate average embedding for ${ids.length} items`,
              cause: error
            })
          )
        )

        const resultRows = yield* Effect.try({
          try: () =>
            result.rows.map((row) => ({
              avg_embedding: JSON.parse(row.avg_embedding) as Array<number>
            })),
          catch: (error) =>
            new VectorStoreError({
              message: "Failed to parse average embedding result",
              cause: error
            })
        })

        return resultRows
      })

    // Find similar items to a given item
    const findSimilar = (itemId: string, options?: {
      limit?: number
    }) =>
      Effect.gen(function*() {
        const { limit = 5 } = options || {}

        const result = yield* Effect.tryPromise(() =>
          pglite.db.query<EmbeddingOutput>(
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
          pglite.db.query<EmbeddingOutput>(
            `SELECT id, content, type, entity_id, metadata, 1 - (embedding <=> $1) as similarity
              FROM embeddings
              WHERE ${whereConditions.join(" AND ")} AND (1 - (embedding <=> $1)) >= $2
              ORDER BY embedding <=> $1
              LIMIT $${params.length}
            `,
            params
          )
        ).pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: "Failed to perform hybrid search",
              cause: error
            })
          )
        )

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
          pglite.db.query<EmbeddingOutput>(
            `SELECT id, content, type, entity_id, metadata, 1 - (embedding <=> $1) as similarity
              FROM embeddings
              WHERE ${whereConditions.join(" AND ")} AND (1 - (embedding <=> $1)) >= $2
              ORDER BY embedding <=> $1
              LIMIT $${params.length}
            `,
            params
          )
        ).pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: "Failed to perform semantic search",
              cause: error
            })
          )
        )

        return results.rows
      })

    const storeEmbedding = (data: EmbeddingInput) =>
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
      ).pipe(
        Effect.mapError((error) =>
          new VectorStoreError({
            message: `Failed to store embedding with ID: ${data.id}`,
            cause: error
          })
        )
      )

    // Advanced vector operations
    const storeEmbeddingBatch = (items: Array<EmbeddingInput>) =>
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
      ).pipe(
        Effect.mapError((error) =>
          new VectorStoreError({
            message: `Failed to store batch of ${items.length} embeddings`,
            cause: error
          })
        )
      )

    // Enhanced semantic search with multiple distance metrics
    const multiMetricSearch = (queryEmbedding: Array<number>, options?: {
      limit?: number
      metric?: "cosine" | "l2" | "inner_product" | "l1"
    }) =>
      Effect.gen(function*() {
        const { limit = 10, metric = "cosine" } = options || {}

        const distanceFunctions = {
          cosine: "<=>",
          l2: "<->",
          inner_product: "<#>",
          l1: "<+>"
        }
        const distanceOp = distanceFunctions[metric]

        const results = yield* Effect.tryPromise(() =>
          pglite.db.query<EmbeddingOutput & { distance: number }>(
            `SELECT id, content, type, entity_id, metadata, 1 - (embedding <=> $1) as similarity, (embedding ${distanceOp} $1) as distance
              FROM embeddings
              ORDER BY embedding ${distanceOp} $1
              LIMIT $2
            `,
            [formatEmbedding(queryEmbedding), limit]
          )
        ).pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: `Failed to perform multi-metric search with ${metric} distance`,
              cause: error
            })
          )
        )

        return results.rows
      })

    // Detect outliers using L2 distance
    const detectAnomalies = (threshold: number = 2.0, options?: {
      limit?: number
    }) =>
      Effect.gen(function*() {
        const { limit = 20 } = options || {}

        // Calculate centroid of all embeddings
        const centroidResult = yield* Effect.tryPromise(() =>
          pglite.db.query<{ centroid: string }>(
            `SELECT AVG(embedding) as centroid FROM embeddings`
          )
        ).pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: "Failed to calculate centroid for anomaly detection",
              cause: error
            })
          )
        )

        const centroid = yield* Effect.try({
          try: () => JSON.parse(centroidResult.rows[0].centroid) as Array<number>,
          catch: (error) =>
            new VectorStoreError({
              message: "Failed to parse centroid for anomaly detection",
              cause: error
            })
        })

        // Find items far from centroid (L2 distance)
        const anomalies = yield* Effect.tryPromise(() =>
          pglite.db.query<EmbeddingOutput & { distance: number }>(
            `SELECT id, content, type, entity_id, metadata, 1 - (embedding <=> $1) as similarity, (embedding <-> $1) as distance
              FROM embeddings
              WHERE (embedding <-> $1) > $2
              ORDER BY distance DESC
              LIMIT $3
            `,
            [formatEmbedding(centroid), threshold, limit]
          )
        ).pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: "Failed to detect anomalies in vector store",
              cause: error
            })
          )
        )

        return anomalies.rows
      })

    // Cluster analysis using multiple distance metrics
    const clusterAnalysis = () =>
      Effect.gen(function*() {
        // Simple k-means like clustering using distance to centroids
        const segments = ["champions", "loyal", "potential", "at-risk"]

        const segmentCentroids = yield* Effect.all(
          segments.map((segment) =>
            Effect.gen(function*() {
              const result = yield* Effect.tryPromise(() =>
                pglite.db.query<{ centroid: string }>(
                  `SELECT AVG(embedding) as centroid 
                    FROM embeddings e
                    JOIN users u ON e.entity_id = u.id::text
                    WHERE e.type = 'user' 
                    AND u.segment = $1
                  `,
                  [segment]
                )
              ).pipe(
                Effect.mapError((error) =>
                  new VectorStoreError({
                    message: `Failed to calculate centroid for segment: ${segment}`,
                    cause: error
                  })
                )
              )

              const centroid = yield* Effect.try({
                try: () => result.rows[0] ? JSON.parse(result.rows[0].centroid) as Array<number> : null,
                catch: (error) =>
                  new VectorStoreError({
                    message: `Failed to parse centroid for segment: ${segment}`,
                    cause: error
                  })
              })

              return { segment, centroid }
            })
          ),
          { concurrency: 4 }
        )

        // Find closest segments for each user
        const userSegments = yield* Effect.tryPromise(() =>
          pglite.db.query<{ user_id: string; segment: string; confidence: number }>(
            `WITH centroids AS (
              SELECT * FROM (VALUES 
                ${
              segmentCentroids.filter((sc) => sc.centroid).map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}::vector)`).join(
                ", "
              )
            }
              ) AS t(segment, centroid)
            )
            SELECT e.entity_id as user_id, c.segment, 1 - (e.embedding <=> c.centroid) as confidence
              FROM embeddings e
              CROSS JOIN centroids c
              WHERE e.type = 'user'
              QUALIFY ROW_NUMBER() OVER (PARTITION BY e.entity_id ORDER BY e.embedding <=> c.centroid) = 1
            `
          )
        ).pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: "Failed to perform cluster analysis",
              cause: error
            })
          )
        )

        return userSegments.rows
      })

    // Multi-stage search with different distance metrics
    const advancedSemanticSearch = (query: string, queryEmbedding: Array<number>, options?: {
      filters?: { entity_id?: string; type?: string }
      limit?: number
      similarityThreshold?: number
    }) =>
      Effect.gen(function*() {
        // Stage 1: Broad search with cosine similarity
        const broadResults = yield* semanticSearch(queryEmbedding, options)

        if (broadResults.length === 0) {
          return []
        }

        // Stage 2: Re-rank using multiple distance metrics
        const formattedEmbedding = formatEmbedding(queryEmbedding)
        const ids = broadResults.map((r) => r.id)

        const rerankedResults = yield* Effect.tryPromise(() =>
          pglite.db.query<EmbeddingOutput & { cosine_score: number; l2_score: number; combined_score: number }>(
            `SELECT 
                id, content, type, entity_id, metadata,
                1 - (embedding <=> $1) as cosine_score,
                - (embedding <-> $1) as l2_score,  -- Negative because lower L2 is better
                (1 - (embedding <=> $1)) * 0.7 + (- (embedding <-> $1)) * 0.3 as combined_score
              FROM embeddings
              WHERE id = ANY($2)
              ORDER BY combined_score DESC
              LIMIT 10
            `,
            [formattedEmbedding, ids]
          )
        ).pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: "Failed to perform advanced semantic search",
              cause: error
            })
          )
        )

        return rerankedResults.rows.map((row) => ({
          ...row,
          similarity: row.combined_score
        }))
      })

    return {
      averageEmbedding,
      findSimilar,
      hybridSearch,
      semanticSearch,
      storeEmbedding,
      storeEmbeddingBatch,
      multiMetricSearch,
      detectAnomalies,
      clusterAnalysis,
      advancedSemanticSearch
    }
  })
}) {}
