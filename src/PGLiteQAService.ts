import { EmbeddingModel, LanguageModel } from "@effect/ai"
import { Effect, Schedule } from "effect"
import { MockDatabaseService, type Order, type Product, type User } from "./MockDatabaseService.js"
import { In, type Out, PGLiteVectorOps } from "./PGLiteVectorOps.js"
import { PGLiteVectorService } from "./PGLiteVectorService.js"

export class PGLiteQAService extends Effect.Service<PGLiteQAService>()("PGLiteQAService", {
  effect: Effect.gen(function*() {
    type StructuredData = { users?: Array<User>; orders?: Array<Order>; products?: Array<Product> }

    const db = yield* MockDatabaseService
    const vectorOps = yield* PGLiteVectorOps
    const languageModel = yield* LanguageModel.LanguageModel
    const embeddingModel = yield* EmbeddingModel.EmbeddingModel

    const answerQuestion = (question: string) =>
      Effect.gen(function*() {
        // Step 1: Generate real embedding for the question
        const questionEmbedding = yield* embeddingModel.embed(question).pipe(
          Effect.catchTag("HttpRequestError", Effect.die),
          Effect.catchTag("HttpResponseError", Effect.die),
          Effect.catchTag("MalformedInput", Effect.die),
          Effect.catchTag("MalformedOutput", Effect.die),
          Effect.catchTag("UnknownError", Effect.die)
        )

        // Step 2: Semantic search in PGLite
        const inferEntityTypeFromQuestion = inferEntityType(question)
        const relevantContext = yield* vectorOps.semanticSearch(
          questionEmbedding,
          {
            similarityThreshold: 0.3,
            filters: { ...(inferEntityTypeFromQuestion ? { type: inferEntityTypeFromQuestion } : {}) }
          }
        )

        // Step 3: Extract entity IDs for precise data lookup
        const entityIds = relevantContext
          .map((ctx) => ctx.entity_id)
          .filter(Boolean)

        // Step 4: Get fresh structured data from main DB
        const structuredData = yield* fetchStructuredData(question, entityIds)

        // Step 5: Generate answer using LanguageModel
        const answer = yield* generateAnswer(question, relevantContext, structuredData)

        return answer
      })

    const inferEntityType = (question: string): string | undefined => {
      const lowerQuestion = question.toLowerCase()
      if (lowerQuestion.includes("user") || lowerQuestion.includes("customer")) return "user"
      if (lowerQuestion.includes("order") || lowerQuestion.includes("sale")) return "order"
      if (lowerQuestion.includes("product")) return "product"
      return undefined
    }

    const fetchStructuredData = (question: string, entityIds: Array<string>) =>
      Effect.gen(function*() {
        if (entityIds.length === 0) {
          // If no specific entities, try to infer from question
          const entityType = inferEntityType(question)

          if (entityType === "user") {
            return { users: yield* db.getUsers() }
          } else if (entityType === "order") {
            return { orders: yield* db.getOrders() }
          } else if (entityType === "product") {
            return { products: yield* db.getProducts() }
          }

          // Return all data if no specific type inferred
          const [users, orders, products] = yield* Effect.all([
            db.getUsers(),
            db.getOrders(),
            db.getProducts()
          ], { concurrency: 3 })

          return { users, orders, products } as StructuredData
        }

        // Filter by specific entity IDs
        const entityType = inferEntityType(question)

        const data: StructuredData = {}

        if (entityType === "user" || !entityType) {
          data.users = yield* db.getUsers({ ids: entityIds })
        }

        if (entityType === "order" || !entityType) {
          data.orders = yield* db.getOrders({ ids: entityIds })
        }

        if (entityType === "product" || !entityType) {
          data.products = yield* db.getProducts({ ids: entityIds })
        }

        return data
      })

    const generateAnswer = (
      question: string,
      context: Array<Out>,
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
${JSON.stringify(structuredData, null, 2)}

Guidelines:
- Be accurate and factual
- If information conflicts, prefer structured data from database
- If data doesn't contain the answer, be honest about limitations
- Format responses clearly with bullet points when helpful
- Include specific numbers and details when available

Question: ${question}`
        }).pipe(
          Effect.catchTag("HttpRequestError", Effect.die),
          Effect.catchTag("HttpResponseError", Effect.die),
          Effect.catchTag("MalformedInput", Effect.die),
          Effect.catchTag("MalformedOutput", Effect.die),
          Effect.catchTag("UnknownError", Effect.die)
        )

        return response.text
      })

    // Data synchronization with real embeddings
    // In PGLiteQAService.ts - Replace individual embedding calls
    const syncDataToVectorStore = () =>
      Effect.gen(function*() {
        const [users, orders, products] = yield* Effect.all([
          db.getUsers(),
          db.getOrders(),
          db.getProducts()
        ], { concurrency: 3 })

        // Batch process embeddings
        const allTexts = [
          ...users.map((user) =>
            `User ID: ${user.id}, User: ${user.name}, User Email: ${user.email}, User Role: ${user.role}, User Department: ${user.department}`
          ),
          ...orders.map((order) =>
            `Order ID: ${order.id}, Order Description: ${order.description}, Order Status: ${order.status}, Order Customer ID: ${order.customer_id}, Order Amount: $${order.amount}, Created: ${
              order.created_at.toISOString().split("T")[0]
            }`
          ),
          ...products.map((product) =>
            `Product ID: ${product.id}, Product Description: ${product.description}, Product Name: ${product.name}, Product Category: ${product.category}, Product Price: $${product.price}`
          )
        ]

        const allEmbeddings = yield* embeddingModel.embedMany(allTexts).pipe(
          Effect.retry({ times: 2, schedule: Schedule.fixed("100 millis") })
        ).pipe(
          Effect.catchTag("HttpRequestError", Effect.die),
          Effect.catchTag("HttpResponseError", Effect.die),
          Effect.catchTag("MalformedInput", Effect.die),
          Effect.catchTag("MalformedOutput", Effect.die),
          Effect.catchTag("UnknownError", Effect.die)
        )

        // Create batch items
        const batchItems: Array<In> = []
        let embeddingIndex = 0

        users.forEach((user) => {
          batchItems.push(In.make({
            id: `user_${user.id}`,
            content: allTexts[embeddingIndex],
            embedding: allEmbeddings[embeddingIndex],
            type: "user",
            entity_id: user.id.toString(),
            metadata: user
          }))
          embeddingIndex++
        })

        orders.forEach((order) => {
          batchItems.push(In.make({
            id: `order_${order.id}`,
            content: allTexts[embeddingIndex],
            embedding: allEmbeddings[embeddingIndex],
            type: "order",
            entity_id: order.id.toString(),
            metadata: order
          }))
          embeddingIndex++
        })

        products.forEach((product) => {
          batchItems.push(In.make({
            id: `product_${product.id}`,
            content: allTexts[embeddingIndex],
            embedding: allEmbeddings[embeddingIndex],
            type: "product",
            entity_id: product.id.toString(),
            metadata: product
          }))
          embeddingIndex++
        })

        yield* vectorOps.storeEmbeddingBatch(batchItems)

        return {
          users: users.length,
          orders: orders.length,
          products: products.length
        }
      })

    // Batch embedding generation with error handling
    const generateBatchEmbeddings = (texts: Array<string>) =>
      Effect.gen(function*() {
        if (texts.length === 0) {
          return []
        }

        // Use embedMany directly - it returns Array<Array<number>>
        const embeddings = yield* embeddingModel.embedMany(texts).pipe(
          Effect.catchTag("HttpRequestError", Effect.die),
          Effect.catchTag("HttpResponseError", Effect.die),
          Effect.catchTag("MalformedInput", Effect.die),
          Effect.catchTag("MalformedOutput", Effect.die),
          Effect.catchTag("UnknownError", Effect.die)
        ).pipe(
          Effect.retry({ times: 2, schedule: Schedule.fixed("100 millis") })
        )

        return embeddings
      })

    // Enhanced semantic search with query expansion
    const enhancedSemanticSearch = (question: string) =>
      Effect.gen(function*() {
        // Generate multiple query variations for better search
        const queryVariations = [...yield* generateQueryVariations(question), question]

        const allResults = yield* Effect.all(
          queryVariations.map((variation) =>
            Effect.gen(function*() {
              const embedding = yield* embeddingModel.embed(variation).pipe(
                Effect.catchTag("HttpRequestError", Effect.die),
                Effect.catchTag("HttpResponseError", Effect.die),
                Effect.catchTag("MalformedInput", Effect.die),
                Effect.catchTag("MalformedOutput", Effect.die),
                Effect.catchTag("UnknownError", Effect.die)
              )
              return yield* vectorOps.semanticSearch(
                embedding,
                { limit: 3, similarityThreshold: 0.3 }
              )
            })
          ),
          { concurrency: "unbounded" }
        )

        // Deduplicate and rank results
        const uniqueResults = allResults
          .flat()
          .filter((result, index, self) => index === self.findIndex((r) => r.id === result.id))
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 10)

        return uniqueResults
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
          Effect.catchTag("HttpRequestError", Effect.die),
          Effect.catchTag("HttpResponseError", Effect.die),
          Effect.catchTag("MalformedInput", Effect.die),
          Effect.catchTag("MalformedOutput", Effect.die),
          Effect.catchTag("UnknownError", Effect.die)
        )

        return yield* Effect.try(() => JSON.parse(response.text) as Array<string>).pipe(
          Effect.catchAll(() => Effect.succeed([question])) // Fallback to original question
        )
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
          Effect.catchTag("HttpRequestError", Effect.die),
          Effect.catchTag("HttpResponseError", Effect.die),
          Effect.catchTag("MalformedInput", Effect.die),
          Effect.catchTag("MalformedOutput", Effect.die),
          Effect.catchTag("UnknownError", Effect.die)
        )

        return JSON.parse(response.text)
      })

    const clearVectorStore = () =>
      Effect.gen(function*() {
        const pglite = yield* PGLiteVectorService
        yield* Effect.tryPromise(() => pglite.db.query<void>("DELETE FROM embeddings")).pipe(
          Effect.catchTag("UnknownException", Effect.die)
        )
      })

    const advancedRecommendations = (customer_id: number) =>
      Effect.gen(function*() {
        // Get user's recent orders
        const userOrders = yield* db.getOrders({ customer_id })
        const orderIds = userOrders.map((order) => `order_${order.id}`)

        // if (orderIds.length === 0) {
        //   // If no orders, use popular products
        //   return yield* getPopularProducts()
        // }

        // Calculate user's preference profile (average of their orders)
        const userProfiles = yield* vectorOps.averageEmbedding(orderIds)

        // Find products similar to user's preference profile
        const similarToProfile = yield* vectorOps.semanticSearch(
          userProfiles.map((userProfile) => userProfile.avg_embedding)[0],
          { filters: { type: "product" } }
        )

        // Also find products similar to their most recent order
        const latestOrderId = `order_${userOrders[userOrders.length - 1].id}`
        const similarToLatest = yield* vectorOps.findSimilar(latestOrderId)

        // Combine and deduplicate results
        const allRecommendations = [...similarToProfile, ...similarToLatest]
          .filter((item, index, self) => index === self.findIndex((value) => value.entity_id === item.entity_id))
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 10)

        return allRecommendations
      })

    return {
      answerQuestion,
      clearVectorStore,
      enhancedSemanticSearch,
      generateBatchEmbeddings,
      getQuestionAnalysis,
      hybridSearch: vectorOps.hybridSearch,
      semanticSearch: vectorOps.semanticSearch,
      syncDataToVectorStore,
      advancedRecommendations
    }
  })
}) {}
