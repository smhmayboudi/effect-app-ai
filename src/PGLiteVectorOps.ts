import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { VectorStoreError } from "./Errors.js"
import type { EmbeddingInput, EmbeddingOutput } from "./Schemas.js"

export class PGLiteVectorOps extends Effect.Service<PGLiteVectorOps>()("PGLiteVectorOps", {
  effect: Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    // Multi-stage search with different distance metrics
    const advancedSemanticSearch = (queryEmbedding: Array<number>, options?: {
      filters?: { entity_id?: string; type?: string }
      limit?: number
      similarityThreshold?: number
    }) =>
      Effect.gen(function*() {
        const { limit = 10 } = options || {}
        // Stage 1: Broad search with cosine similarity
        const broadResults = yield* semanticSearch(queryEmbedding, { ...options, limit })
        if (broadResults.length === 0) {
          return []
        }
        // Stage 2: Re-rank using multiple distance metrics
        const formattedEmbedding = JSON.stringify(queryEmbedding)
        const ids = broadResults.map((row) => row.id)

        return yield* sql<
          EmbeddingOutput & { cosine_score: number; l2_score: number; combined_score: number }
        >`SELECT id, content, type, entity_id, metadata, 1 - (embedding <=> ${formattedEmbedding}) as cosine_score, -(embedding <-> ${formattedEmbedding}) as l2_score, (1 - (embedding <=> ${formattedEmbedding})) * 0.7 + (-(embedding <-> ${formattedEmbedding})) * 0.3 as combined_score FROM embeddings WHERE id = ANY(${ids}) ORDER BY combined_score DESC LIMIT ${limit}`
          .pipe(
            Effect.map((rows) => rows.map((row) => ({ ...row, similarity: row.combined_score }))),
            Effect.mapError((error) =>
              new VectorStoreError({
                message: "Failed to perform advanced semantic search",
                cause: error
              })
            )
          )
      })

    // Average embedding for a set of items
    const averageEmbedding = (ids: Array<string>) =>
      Effect.gen(function*() {
        const result = yield* sql<
          { centroid: string }
        >`SELECT AVG(embedding) as centroid FROM embeddings WHERE id = ANY(${ids})`.pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: `Failed to calculate average embedding for ${ids.length} items`,
              cause: error
            })
          )
        )

        return yield* Effect.try({
          try: () => result[0] ? JSON.parse(result[0].centroid) as Array<number> : [],
          catch: (error) =>
            new VectorStoreError({
              message: "Failed to parse average embedding result",
              cause: error
            })
        })
      })

    const clearVectorStore = () =>
      Effect.gen(function*() {
        yield* sql`DELETE FROM embeddings`.pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: "Failed to clear vector store",
              cause: error
            })
          )
        )
      })

    // Cluster analysis using multiple distance metrics
    const clusterAnalysis = () =>
      Effect.gen(function*() {
        // Simple k-means like clustering using distance to centroids
        const segments = ["champions", "loyal", "potential", "at-risk"] as const

        const segmentCentroids = yield* Effect.all(
          segments.map((segment) =>
            Effect.gen(function*() {
              const result = yield* sql<
                { centroid: string }
              >`SELECT AVG(embedding) as centroid FROM embeddings e JOIN users u ON e.entity_id = u.id::text WHERE e.type = 'user' AND u.segment = ${segment}`
                .pipe(
                  Effect.mapError((error) =>
                    new VectorStoreError({
                      message: `Failed to calculate centroid for segment: ${segment}`,
                      cause: error
                    })
                  )
                )
              const centroid = yield* Effect.try({
                try: () => result[0] ? JSON.parse(result[0].centroid) as Array<number> : [],
                catch: (error) =>
                  new VectorStoreError({
                    message: `Failed to parse centroid for segment: ${segment}`,
                    cause: error
                  })
              })

              return { segment, centroid }
            })
          ),
          { concurrency: "unbounded" }
        )

        // Find closest segments for each user
        return yield* sql<
          { user_id: string; segment: string; confidence: number }
        >`WITH centroids AS (SELECT * FROM (VALUES ${
          segmentCentroids.filter((sc) => sc.centroid).map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}::vector)`).join(
            ", "
          )
        }) AS t(segment, centroid)) SELECT e.entity_id as user_id, c.segment, 1 - (e.embedding <=> c.centroid) as confidence FROM embeddings e CROSS JOIN centroids c WHERE e.type = 'user' QUALIFY ROW_NUMBER() OVER (PARTITION BY e.entity_id ORDER BY e.embedding <=> c.centroid) = 1`
          .pipe(
            Effect.mapError((error) =>
              new VectorStoreError({
                message: "Failed to perform cluster analysis",
                cause: error
              })
            )
          )
      })

    // Detect outliers using L2 distance
    const detectAnomalies = (threshold: number = 2.0, options?: {
      limit?: number
    }) =>
      Effect.gen(function*() {
        const { limit = 20 } = options || {}
        // Calculate centroid of all embeddings
        const result = yield* sql<{ centroid: string }>`SELECT AVG(embedding) as centroid FROM embeddings`
          .pipe(
            Effect.mapError((error) =>
              new VectorStoreError({
                message: "Failed to calculate centroid for anomaly detection",
                cause: error
              })
            )
          )
        const centroid = yield* Effect.try({
          try: () => result[0] ? JSON.parse(result[0].centroid) as Array<number> : [],
          catch: (error) =>
            new VectorStoreError({
              message: "Failed to parse centroid for anomaly detection",
              cause: error
            })
        })
        // Find items far from centroid (L2 distance)
        const formattedEmbedding = JSON.stringify(centroid)

        return yield* sql<
          EmbeddingOutput & { distance: number }
        >`SELECT id, content, type, entity_id, metadata, 1 - (embedding <=> ${formattedEmbedding}) as similarity, (embedding <-> ${formattedEmbedding}) as distance FROM embeddings WHERE (embedding <-> ${formattedEmbedding}) > ${threshold} ORDER BY distance DESC LIMIT ${limit}`
          .pipe(
            Effect.mapError((error) =>
              new VectorStoreError({
                message: "Failed to detect anomalies in vector store",
                cause: error
              })
            )
          )
      })

    // Find similar items to a given item
    const findSimilar = (itemId: string, options?: {
      limit?: number
    }) =>
      Effect.gen(function*() {
        const { limit = 5 } = options || {}

        return yield* sql<
          EmbeddingOutput
        >`WITH target AS (SELECT embedding FROM embeddings WHERE id = ${itemId}) SELECT e.id, e.content, e.type, e.entity_id, e.metadata, 1 - (e.embedding <=> t.embedding) as similarity FROM embeddings e, target t WHERE e.id != ${itemId} ORDER BY e.embedding <=> t.embedding LIMIT ${limit}`
      })

    const hybridSearch = (query: string, queryEmbedding: Array<number>, options?: {
      filters?: { type?: string }
      limit?: number
      similarityThreshold?: number
    }) =>
      Effect.gen(function*() {
        const { filters = {}, limit = 10, similarityThreshold = 0.7 } = options || {}
        const formattedEmbedding = JSON.stringify(queryEmbedding)
        const whereConditions = ["1 <= 2"]
        if (filters.type) {
          whereConditions.push(`type = '${filters.type}'`)
        }
        if (query) {
          whereConditions.push(`LOWER(content) ILIKE LOWER('%${query}%')`)
        }

        return yield* sql<
          EmbeddingOutput
        >`SELECT id, content, type, entity_id, metadata, 1 - (embedding <=> ${formattedEmbedding}) as similarity FROM embeddings WHERE ${
          sql.unsafe(whereConditions.join(" AND "))
        } AND (1 - (embedding <=> ${formattedEmbedding})) >= ${similarityThreshold} ORDER BY embedding <=> ${formattedEmbedding} LIMIT ${limit}`
          .pipe(
            Effect.mapError((error) =>
              new VectorStoreError({
                message: "Failed to perform hybrid search",
                cause: error
              })
            )
          )
      })

    // Enhanced semantic search with multiple distance metrics
    const multiMetricSearch = (queryEmbedding: Array<number>, options?: {
      limit?: number
      metric?: "cosine" | "hamming" | "inner_product" | "jaccard" | "l1" | "l2"
    }) =>
      Effect.gen(function*() {
        const { limit = 10, metric = "cosine" } = options || {}
        const formattedEmbedding = JSON.stringify(queryEmbedding)
        const distanceFunctions = {
          cosine: "<=>",
          hamming: "<~>",
          inner_product: "<#>",
          jaccard: "<%>",
          l1: "<+>",
          l2: "<->"
        } as const
        const distanceOp = distanceFunctions[metric]
        return yield* sql<
          EmbeddingOutput & { distance: number }
        >`SELECT id, content, type, entity_id, metadata, 1 - (embedding <=> ${formattedEmbedding}) as similarity, (embedding ${distanceOp} ${formattedEmbedding}) as distance FROM embeddings ORDER BY embedding ${distanceOp} ${formattedEmbedding} LIMIT ${limit}`
          .pipe(
            Effect.mapError((error) =>
              new VectorStoreError({
                message: `Failed to perform multi-metric search with ${metric} distance`,
                cause: error
              })
            )
          )
      })

    const semanticSearch = (queryEmbedding: Array<number>, options?: {
      filters?: { entity_id?: string; type?: string }
      limit?: number
      similarityThreshold?: number
    }) =>
      Effect.gen(function*() {
        const { filters = {}, limit = 10, similarityThreshold = 0.7 } = options || {}
        const formattedEmbedding = JSON.stringify(queryEmbedding)
        const whereConditions = ["1 <= 2"]
        if (filters.type) {
          whereConditions.push(`type = '${filters.type}'`)
        }
        if (filters.entity_id) {
          whereConditions.push(`entity_id = '${filters.entity_id}'`)
        }

        return yield* sql<
          EmbeddingOutput
        >`SELECT id, content, type, entity_id, metadata, 1 - (embedding <=> ${formattedEmbedding}) as similarity FROM embeddings WHERE ${
          sql.unsafe(whereConditions.join(" AND "))
        } AND (1 - (embedding <=> ${formattedEmbedding})) >= ${similarityThreshold} ORDER BY embedding <=> ${formattedEmbedding} LIMIT ${limit}`
          .pipe(
            Effect.mapError((error) =>
              new VectorStoreError({
                message: "Failed to perform semantic search",
                cause: error
              })
            )
          )
      })

    const storeEmbedding = (data: EmbeddingInput) =>
      sql`INSERT INTO embeddings (id, content, embedding, type, entity_id, metadata) VALUES (${data.id}, ${data.content}, ${
        JSON.stringify(data.embedding)
      }, ${data.type}, ${data.entity_id}, ${
        JSON.stringify(data.metadata || {})
      }) ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata, created_at = CURRENT_TIMESTAMP`
        .pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: `Failed to store embedding with ID: ${data.id}`,
              cause: error
            })
          )
        )

    // Advanced vector operations
    const storeEmbeddingBatch = (items: Array<EmbeddingInput>) =>
      sql`INSERT INTO embeddings (id, content, embedding, type, entity_id, metadata) VALUES ${
        sql.unsafe(
          items.map((item) =>
            `('${item.id}', '${item.content}', '${
              JSON.stringify(item.embedding)
            }', '${item.type}', '${item.entity_id}', '${JSON.stringify(item.metadata || {})}')`
          ).join(", ")
        )
      } ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata, created_at = CURRENT_TIMESTAMP`
        .pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: `Failed to store batch of ${items.length} embeddings`,
              cause: error
            })
          )
        )

    return {
      advancedSemanticSearch,
      averageEmbedding,
      clearVectorStore,
      clusterAnalysis,
      detectAnomalies,
      findSimilar,
      hybridSearch,
      multiMetricSearch,
      semanticSearch,
      storeEmbedding,
      storeEmbeddingBatch
    }
  })
}) {}
