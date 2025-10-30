import { EmbeddingModel, LanguageModel } from "@effect/ai"
import { Effect, Schedule } from "effect"
import { MockDatabaseService } from "./MockDatabaseService.js"
import { PGLiteVectorOps } from "./PGLiteVectorOps.js"
import { PGLiteVectorService } from "./PGLiteVectorService.js"

export class PGLiteQAService extends Effect.Service<PGLiteQAService>()("PGLiteQAService", {
  effect: Effect.gen(function*() {
    const db = yield* MockDatabaseService
    const vectorOps = yield* PGLiteVectorOps

    const answerQuestion = (question: string) =>
      Effect.gen(function*() {
        // Step 1: Generate real embedding for the question
        const embeddingModel = yield* EmbeddingModel.EmbeddingModel
        const questionEmbedding = yield* embeddingModel.embed(question)

        // Step 2: Semantic search in PGLite
        const ietQ = inferEntityType(question)
        const relevantContext = yield* vectorOps.semanticSearch(
          questionEmbedding,
          {
            limit: 5,
            similarityThreshold: 0.8,
            filters: { ...(ietQ ? { type: ietQ } : {}) }
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

          return { users, orders, products }
        }

        // Filter by specific entity IDs
        const entityType = inferEntityType(question)

        const data: any = {}

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

    const generateAnswer = (question: string, context: any[], structuredData: any) =>
      Effect.gen(function*() {
        const response = yield* LanguageModel.generateText({
          prompt:
            `You are a helpful business assistant. Use the semantic context and structured data to answer the question accurately.

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
        })

        return response.text
      })

    // Data synchronization with real embeddings
    const syncDataToVectorStore = () =>
      Effect.gen(function*() {
        const embeddingModel = yield* EmbeddingModel.EmbeddingModel
        const [users, orders, products] = yield* Effect.all([
          db.getUsers(),
          db.getOrders(),
          db.getProducts()
        ], { concurrency: 3 })

        // Prepare embeddings data with real embeddings
        const usersData = yield* Effect.all(
          users.map((user) => prepareUserEmbedding(user, embeddingModel)),
          { concurrency: 2 }
        )

        const ordersData = yield* Effect.all(
          orders.map((order) => prepareOrderEmbedding(order, embeddingModel)),
          { concurrency: 2 }
        )

        const productsData = yield* Effect.all(
          products.map((product) => prepareProductEmbedding(product, embeddingModel)),
          { concurrency: 2 }
        )

        // Batch insert into PGLite
        yield* vectorOps.batchStoreEmbeddings([
          ...usersData,
          ...ordersData,
          ...productsData
        ])

        return {
          users: usersData.length,
          orders: ordersData.length,
          products: productsData.length
        }
      })

    const prepareUserEmbedding = (user: any, embeddingModel: EmbeddingModel.Service) =>
      Effect.gen(function*() {
        const content = `User: ${user.name}, Email: ${user.email}, Role: ${user.role}, Department: ${user.department}`
        const embedding = yield* embeddingModel.embed(content)

        return {
          id: `user_${user.id}`,
          content,
          embedding,
          type: "user",
          entity_id: user.id.toString(),
          metadata: user
        }
      })

    const prepareOrderEmbedding = (order: any, embeddingModel: EmbeddingModel.Service) =>
      Effect.gen(function*() {
        const content =
          `Order #${order.id}: ${order.description}, Amount: $${order.amount}, Status: ${order.status}, Customer ID: ${order.customer_id}, Created: ${
            order.created_at.toISOString().split("T")[0]
          }`
        const embedding = yield* embeddingModel.embed(content)

        return {
          id: `order_${order.id}`,
          content,
          embedding,
          type: "order",
          entity_id: order.id.toString(),
          metadata: order
        }
      })

    const prepareProductEmbedding = (product: any, embeddingModel: EmbeddingModel.Service) =>
      Effect.gen(function*() {
        const content =
          `Product: ${product.name}, Category: ${product.category}, Price: $${product.price}, Description: ${product.description}`
        const embedding = yield* embeddingModel.embed(content)

        return {
          id: `product_${product.id}`,
          content,
          embedding,
          type: "product",
          entity_id: product.id.toString(),
          metadata: product
        }
      })

    // Batch embedding generation with error handling
    const generateBatchEmbeddings = (texts: Array<string>) =>
      Effect.gen(function*() {
        const embeddingModel = yield* EmbeddingModel.EmbeddingModel

        if (texts.length === 0) {
          return []
        }

        // Use embedMany directly - it returns Array<Array<number>>
        const embeddings = yield* embeddingModel.embedMany(texts).pipe(
          Effect.retry({ times: 2, schedule: Schedule.fixed("100 millis") })
        )

        return embeddings
      })

    // Enhanced semantic search with query expansion
    const enhancedSemanticSearch = (question: string) =>
      Effect.gen(function*() {
        const embeddingModel = yield* EmbeddingModel.EmbeddingModel

        // Generate multiple query variations for better search
        const queryVariations = yield* generateQueryVariations(question)

        const allResults = yield* Effect.all(
          queryVariations.map((variation) =>
            Effect.gen(function*() {
              const embedding = yield* embeddingModel.embed(variation)
              return yield* vectorOps.semanticSearch(embedding, {
                limit: 3,
                similarityThreshold: 0.7
              })
            })
          ),
          { concurrency: 2 }
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
        const response = yield* LanguageModel.generateText({
          prompt:
            `Generate 3 different variations of the user's question that might help find relevant information in a database. Return as a JSON array of strings. Original question: "${question}"\n\nGenerate 3 search variations:`
        })

        return yield* Effect.try(() => JSON.parse(response.text) as Array<string>).pipe(
          Effect.catchAll(() => Effect.succeed([question])) // Fallback to original question
        )
      })

    // Additional utility methods
    const getQuestionAnalysis = (question: string) =>
      Effect.gen(function*() {
        const response = yield* LanguageModel.generateText({
          prompt: `Analyze the business question and determine:
          1. What entities are mentioned (users, orders, products)
          2. What filters/conditions are needed
          3. What type of answer is expected
          Return as JSON format. question: ${question}`
        })

        return Effect.try(() => JSON.parse(response.text))
      })

    const clearVectorStore = () =>
      Effect.gen(function*() {
        const pglite = yield* PGLiteVectorService
        yield* Effect.tryPromise(() => pglite.db.query("DELETE FROM embeddings"))
      })

    return {
      answerQuestion,
      syncDataToVectorStore,
      semanticSearch: vectorOps.semanticSearch,
      hybridSearch: vectorOps.hybridSearch,
      enhancedSemanticSearch,
      generateBatchEmbeddings,
      getQuestionAnalysis,
      clearVectorStore
    }
  })
}) {}
