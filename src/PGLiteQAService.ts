import { EmbeddingModel, LanguageModel } from "@effect/ai"
import { encode } from "@toon-format/toon"
import { Duration, Effect, Schedule } from "effect"
import { AIServiceError, DatabaseError, EmbeddingError, VectorStoreError } from "./Errors.js"
import { LoggerService } from "./Logging.js"
import { MockDatabaseService } from "./MockDatabaseService.js"
import { PGLiteVectorOps } from "./PGLiteVectorOps.js"
import {
  type EmbeddingInput,
  EmbeddingInputSchema,
  type EmbeddingOutput,
  type Order,
  type Product,
  type User
} from "./Schemas.js"

export class PGLiteQAService extends Effect.Service<PGLiteQAService>()("PGLiteQAService", {
  effect: Effect.gen(function*() {
    type StructuredData = {
      users?: Array<User> | undefined
      orders?: Array<Order> | undefined
      products?: Array<Product> | undefined
    }

    const db = yield* MockDatabaseService
    const vectorOps = yield* PGLiteVectorOps
    const languageModel = yield* LanguageModel.LanguageModel
    const embeddingModel = yield* EmbeddingModel.EmbeddingModel
    const logger = yield* LoggerService

    const inferEntityType = (question: string): string | undefined => {
      const lowerQuestion = question.toLowerCase()
      if (lowerQuestion.includes("user") || lowerQuestion.includes("customer")) return "user"
      if (lowerQuestion.includes("order") || lowerQuestion.includes("sale")) return "order"
      if (lowerQuestion.includes("product")) return "product"
      return undefined
    }

    const fetchStructuredData = (question: string, entityIds: Array<string>) =>
      Effect.gen(function*() {
        // Filter by specific entity IDs
        const entityType = inferEntityType(question)

        if (entityIds.length === 0) {
          return yield* Effect.all({
            users: (!entityType || entityType === "user")
              ? db.getUsers().pipe(
                Effect.mapError((error) =>
                  new DatabaseError({
                    message: "Failed to fetch users for structured data",
                    cause: error
                  })
                )
              )
              : Effect.succeed(undefined),
            orders: (!entityType || entityType === "order")
              ? db.getOrders().pipe(
                Effect.mapError((error) =>
                  new DatabaseError({
                    message: "Failed to fetch orders for structured data",
                    cause: error
                  })
                )
              )
              : Effect.succeed(undefined),
            products: (!entityType || entityType === "product")
              ? db.getProducts().pipe(
                Effect.mapError((error) =>
                  new DatabaseError({
                    message: "Failed to fetch products for structured data",
                    cause: error
                  })
                )
              )
              : Effect.succeed(undefined)
          }, {
            concurrency: 3
          })
        }

        return yield* Effect.all({
          users: (!entityType || entityType === "user")
            ? db.getUsers({ ids: entityIds }).pipe(
              Effect.mapError((error) =>
                new DatabaseError({
                  message: "Failed to fetch users by IDs for structured data",
                  cause: error
                })
              )
            )
            : Effect.succeed(undefined),
          orders: (!entityType || entityType === "order")
            ? db.getOrders({ ids: entityIds }).pipe(
              Effect.mapError((error) =>
                new DatabaseError({
                  message: "Failed to fetch orders by IDs for structured data",
                  cause: error
                })
              )
            )
            : Effect.succeed(undefined),
          products: (!entityType || entityType === "product")
            ? db.getProducts({ ids: entityIds }).pipe(
              Effect.mapError((error) =>
                new DatabaseError({
                  message: "Failed to fetch products by IDs for structured data",
                  cause: error
                })
              )
            )
            : Effect.succeed(undefined)
        }, {
          concurrency: 3
        })
      })

    const generateAnswer = (
      question: string,
      context: ReadonlyArray<EmbeddingOutput>,
      structuredData: StructuredData
    ) =>
      Effect.gen(function*() {
        const response = yield* languageModel.generateText({
          prompt: `
You are a helpful business assistant. Use the semantic context and structured data to answer the question accurately.

SEMANTIC CONTEXT (from vector search): ${
            context.length > 0
              ? context.map((ctx) => `- ${ctx.content} (similarity: ${(ctx.similarity * 100).toFixed(1)}%)`).join(
                "\n"
              )
              : "No relevant context found from semantic search."
          }

STRUCTURED DATA (from database):
${encode(structuredData)}

Guidelines:
- Be accurate and factual
- If information conflicts, prefer structured data from database
- If data doesn't contain the answer, be honest about limitations
- Format responses clearly with bullet points when helpful
- Include specific numbers and details when available

Question: ${question}`
        }).pipe(
          Effect.mapError((error) =>
            new AIServiceError({
              message: "Failed to generate text response from language model",
              cause: error
            })
          )
        )

        return response.text
      })

    const generateQueryVariations = (question: string) =>
      Effect.gen(function*() {
        const response = yield* languageModel.generateText({
          prompt: `
Generate 3 different variations of the user's question that might help find relevant information in a database.
Return as a JSON array of strings.

Question: ${question}
`
        }).pipe(
          Effect.mapError((error) =>
            new AIServiceError({
              message: "Failed to generate query variations using language model",
              cause: error
            })
          )
        )

        return yield* Effect.try({
          try: () => [...JSON.parse(response.text), question] as Array<string>,
          catch: (error) => {
            console.error("⛔️ Failed to parse query variations, using original question:", error)

            return [question]
          }
        })
      })

    const advancedRecommendations = (customer_id: number) =>
      Effect.gen(function*() {
        // Get user's recent orders
        const userOrders = yield* db.getOrders({ customer_id }).pipe(
          Effect.mapError((error) =>
            new DatabaseError({
              message: `Failed to fetch orders for customer ${customer_id}`,
              cause: error
            })
          )
        )

        if (userOrders.length === 0) {
          return []
        }

        const orderIds = userOrders.map((order) => `order_${order.id}`)

        // Calculate user's preference profile (average of their orders)
        const avgEmbedding = yield* vectorOps.averageEmbedding(orderIds).pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: "Failed to calculate user's preference profile",
              cause: error
            })
          )
        )

        // Find products similar to user's preference profile
        if (!avgEmbedding) {
          return []
        }

        const similarToProfile = yield* vectorOps.semanticSearch(
          avgEmbedding,
          { filters: { type: "product" }, limit: 10, similarityThreshold: 0.3 }
        ).pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: "Failed to find products similar to user profile",
              cause: error
            })
          )
        )

        // Also find products similar to their most recent order
        const latestOrderId = `order_${userOrders[userOrders.length - 1].id}`
        const similarToLatest = yield* vectorOps.findSimilar(latestOrderId).pipe(
          Effect.mapError((error) =>
            new VectorStoreError({
              message: `Failed to find items similar to latest order ${latestOrderId}`,
              cause: error
            })
          )
        )

        // Combine and deduplicate results
        const allRecommendations = [...similarToProfile, ...similarToLatest]
          .filter((item, index, self) => index === self.findIndex((value) => value.entity_id === item.entity_id))
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 10)

        return allRecommendations
      })

    const answerQuestion = (question: string) =>
      Effect.gen(function*() {
        yield* logger.info(`Processing question: ${question}`)

        // Step 1: Generate real embedding for the question
        const questionEmbedding = yield* embeddingModel.embed(question).pipe(
          Effect.tap(() => logger.debug("Generated embedding for question")),
          Effect.mapError((error) =>
            new EmbeddingError({
              message: `Failed to generate embedding for question: ${question}`,
              cause: error
            })
          )
        )

        // Step 2: Semantic search in PGLite
        const type = inferEntityType(question)
        yield* logger.debug(`Inferred entity type: ${type || "none"}`)

        const relevantContext = yield* vectorOps.semanticSearch(
          questionEmbedding,
          { filters: { type }, limit: 10, similarityThreshold: 0.3 }
        ).pipe(
          Effect.tap((results) => logger.debug(`Found ${results.length} relevant context items`)),
          Effect.mapError((error) =>
            new VectorStoreError({
              message: "Failed to perform semantic search",
              cause: error
            })
          )
        )

        // Step 3: Extract entity IDs for precise data lookup
        const entityIds = relevantContext
          .map((ctx) => ctx.entity_id)
          .filter(Boolean)

        // Step 4: Get fresh structured data from main DB
        const structuredData = yield* fetchStructuredData(question, entityIds).pipe(
          Effect.tap(() => logger.debug("Fetched structured data for answer generation")),
          Effect.mapError((error) =>
            new DatabaseError({
              message: "Failed to fetch structured data for answer generation",
              cause: error
            })
          )
        )

        // Step 5: Generate answer using LanguageModel
        const answer = yield* generateAnswer(question, relevantContext, structuredData).pipe(
          Effect.tap(() => logger.debug("Generated answer using language model")),
          Effect.mapError((error) =>
            new AIServiceError({
              message: "Failed to generate answer using language model",
              cause: error
            })
          )
        )

        yield* logger.info("Successfully answered question")
        return answer
      })

    // Enhanced semantic search with query expansion
    const enhancedSemanticSearch = (question: string) =>
      Effect.gen(function*() {
        // Generate multiple query variations for better search
        const queryVariations = yield* generateQueryVariations(question)

        const allResults = yield* Effect.all(
          queryVariations.map((variation) =>
            Effect.gen(function*() {
              const embedding = yield* embeddingModel.embed(variation).pipe(
                Effect.mapError((error) =>
                  new EmbeddingError({
                    message: `Failed to generate embedding for variation: ${variation}`,
                    cause: error
                  })
                )
              )
              return yield* vectorOps.semanticSearch(
                embedding,
                { filters: {}, limit: 3, similarityThreshold: 0.3 }
              ).pipe(
                Effect.mapError((error) =>
                  new VectorStoreError({
                    message: "Failed to perform semantic search with query variation",
                    cause: error
                  })
                )
              )
            })
          ),
          { concurrency: "unbounded" }
        ).pipe(
          Effect.mapError((error) =>
            new AIServiceError({
              message: "Failed to perform enhanced semantic search",
              cause: error
            })
          )
        )

        // Deduplicate and rank results
        const uniqueResults = allResults
          .flat()
          .filter((result, index, self) => index === self.findIndex((r) => r.id === result.id))
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 10)

        return uniqueResults
      })

    // Additional utility methods
    const getQuestionAnalysis = (question: string) =>
      Effect.gen(function*() {
        const response = yield* languageModel.generateText({
          prompt: `
Analyze the business question and determine:
1. What entities are mentioned (users, orders, products)
2. What filters/conditions are needed
3. What type of answer is expected
Return as JSON format.

Question: ${question}`
        }).pipe(
          Effect.mapError((error) =>
            new AIServiceError({
              message: "Failed to analyze question using language model",
              cause: error
            })
          )
        )

        return yield* Effect.try({
          try: () => JSON.parse(response.text),
          catch: (error) =>
            new AIServiceError({
              message: "Failed to parse question analysis response",
              cause: error
            })
        })
      })

    // Data synchronization with real embeddings
    const syncDataToVectorStore = () =>
      Effect.gen(function*() {
        yield* logger.info("Starting data synchronization to vector store")

        const [users, orders, products] = yield* Effect.all([
          db.getUsers().pipe(
            Effect.tap(() => logger.debug("Fetched users for sync")),
            Effect.mapError((error) =>
              new DatabaseError({
                message: "Failed to fetch users for embedding sync",
                cause: error
              })
            )
          ),
          db.getOrders().pipe(
            Effect.tap(() => logger.debug("Fetched orders for sync")),
            Effect.mapError((error) =>
              new DatabaseError({
                message: "Failed to fetch orders for embedding sync",
                cause: error
              })
            )
          ),
          db.getProducts().pipe(
            Effect.tap(() => logger.debug("Fetched products for sync")),
            Effect.mapError((error) =>
              new DatabaseError({
                message: "Failed to fetch products for embedding sync",
                cause: error
              })
            )
          )
        ], { concurrency: 3 })

        yield* logger.info(
          `Processing ${users.length} users, ${orders.length} orders, ${products.length} products for embedding`
        )

        // Batch process embeddings
        const texts = [
          ...users.map((user) => JSON.stringify(user)),
          ...orders.map((order) => JSON.stringify(order)),
          ...products.map((product) => JSON.stringify(product))
        ]

        const allEmbeddings = yield* embeddingModel.embedMany(texts).pipe(
          Effect.tap(() => logger.debug(`Generated embeddings for ${texts.length} items`)),
          Effect.retry({ schedule: Schedule.fixed(Duration.millis(100)), times: 2 }),
          Effect.mapError((error) =>
            new EmbeddingError({
              message: `Failed to generate batch embeddings for ${texts.length} texts`,
              cause: error
            })
          )
        )

        // Create batch items
        const batchItems: Array<EmbeddingInput> = []
        let embeddingIndex = 0

        users.forEach((user) => {
          batchItems.push(EmbeddingInputSchema.make({
            content: texts[embeddingIndex],
            embedding: allEmbeddings[embeddingIndex],
            entity_id: user.id.toString(),
            id: `user_${user.id}`,
            metadata: user,
            type: "user"
          }))
          embeddingIndex++
        })

        orders.forEach((order) => {
          batchItems.push(EmbeddingInputSchema.make({
            content: texts[embeddingIndex],
            embedding: allEmbeddings[embeddingIndex],
            entity_id: order.id.toString(),
            id: `order_${order.id}`,
            metadata: order,
            type: "order"
          }))
          embeddingIndex++
        })

        products.forEach((product) => {
          batchItems.push(EmbeddingInputSchema.make({
            content: texts[embeddingIndex],
            embedding: allEmbeddings[embeddingIndex],
            entity_id: product.id.toString(),
            id: `product_${product.id}`,
            metadata: product,
            type: "product"
          }))
          embeddingIndex++
        })

        yield* vectorOps.storeEmbeddingBatch(batchItems).pipe(
          Effect.tap(() => logger.info(`Stored ${batchItems.length} embeddings in vector store`)),
          Effect.mapError((error) =>
            new VectorStoreError({
              message: "Failed to store embeddings in vector store",
              cause: error
            })
          )
        )

        yield* logger.info("Data synchronization completed successfully")
        return {
          users: users.length,
          orders: orders.length,
          products: products.length
        }
      })

    return {
      advancedRecommendations,
      answerQuestion,
      enhancedSemanticSearch,
      getQuestionAnalysis,
      syncDataToVectorStore
    }
  })
}) {}
