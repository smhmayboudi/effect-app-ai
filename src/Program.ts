import { OpenAiClient, OpenAiEmbeddingModel, OpenAiLanguageModel } from "@effect/ai-openai"
import { NodeHttpClient } from "@effect/platform-node"
import { Config, Layer, pipe } from "effect"
import * as Effect from "effect/Effect"
import { AIServiceError, DatabaseError, EmbeddingError, VectorStoreError } from "./Errors.js"
import { LoggerLive } from "./Logging.js"
import { MockDatabaseService } from "./MockDatabaseService.js"
import { PGLiteQAService } from "./PGLiteQAService.js"
import { PGLiteVectorOps } from "./PGLiteVectorOps.js"
import { PGLiteVectorService } from "./PGLiteVectorService.js"

// Example program with real embeddings
const realEmbeddingsProgram = Effect.gen(function*() {
  const qaService = yield* PGLiteQAService

  console.log("📊 Initializing Q&A Service with Real Embeddings...")

  // Sync data with real embeddings
  console.log("🔄 Syncing data with real embeddings...")
  const syncResult = yield* qaService.syncDataToVectorStore().pipe(
    Effect.catchAll((error) => {
      if (error instanceof DatabaseError) {
        console.error("Database error during sync:", error.message)
        return Effect.die(error)
      } else if (error instanceof EmbeddingError) {
        console.error("Embedding error during sync:", error.message)
        return Effect.die(error)
      } else if (error instanceof VectorStoreError) {
        console.error("Vector store error during sync:", error.message)
        return Effect.die(error)
      }
      console.error("Unexpected error during sync:", error)
      return Effect.die(error)
    })
  )
  console.log(`✅ Synced: ${syncResult.users} users, ${syncResult.orders} orders, ${syncResult.products} products`)

  // Test questions that benefit from semantic search
  const testQuestions = [
    "Who are our administrative users?",
    "Show me successful completed transactions",
    "What software products do we offer?",
    "Find people working in sales",
    "What are our expensive orders?",
    "Users with management roles"
  ]

  for (const question of testQuestions) {
    console.log(`\n❓ Question: ${question}`)

    // Use enhanced semantic search for better results
    const enhancedResults = yield* qaService.enhancedSemanticSearch(question).pipe(
      Effect.catchAll((error) => {
        if (error instanceof AIServiceError) {
          console.error(`AI service error for question "${question}":`, error.message)
          return Effect.succeed([])
        } else if (error instanceof EmbeddingError) {
          console.error(`Embedding error for question "${question}":`, error.message)
          return Effect.succeed([])
        } else if (error instanceof VectorStoreError) {
          console.error(`Vector store error for question "${question}":`, error.message)
          return Effect.succeed([])
        }
        console.error(`Unexpected error for question "${question}":`, error)
        return Effect.succeed([])
      })
    )
    console.log(`🔍 Found ${enhancedResults.length} relevant items via semantic search`)

    const answer = yield* qaService.answerQuestion(question).pipe(
      Effect.catchAll((error) => {
        if (error instanceof AIServiceError) {
          console.error(`AI service error generating answer for "${question}":`, error.message)
          return Effect.succeed("I'm sorry, I couldn't generate an answer for that question.")
        } else if (error instanceof DatabaseError) {
          console.error(`Database error generating answer for "${question}":`, error.message)
          return Effect.succeed("I'm sorry, there was an issue accessing the data for that question.")
        } else if (error instanceof EmbeddingError) {
          console.error(`Embedding error generating answer for "${question}":`, error.message)
          return Effect.succeed("I'm sorry, there was an issue processing your question.")
        }
        console.error(`Unexpected error generating answer for "${question}":`, error)
        return Effect.succeed("I'm sorry, an unexpected error occurred.")
      })
    )
    console.log(`🤖 Answer: ${answer}\n`)

    // yield* Effect.sleep("1 seconds") // Rate limiting for API
  }

  const recommendations = yield* qaService.advancedRecommendations(1).pipe(
    Effect.catchAll((error) => {
      if (error instanceof DatabaseError) {
        console.error("Database error getting recommendations:", error.message)
        return Effect.succeed([])
      } else if (error instanceof VectorStoreError) {
        console.error("Vector store error getting recommendations:", error.message)
        return Effect.succeed([])
      }
      console.error("Unexpected error getting recommendations:", error)
      return Effect.succeed([])
    })
  )
  console.log(`😇 Recommendations for customer id 1:`, recommendations)

  return "🎉 Real embeddings demonstration completed successfully!"
})

// Create the base OpenAI client layer
const OpenAi = OpenAiClient.layerConfig({
  apiKey: Config.redacted("OPENAI_API_KEY")
})

const OpenAiWithHttp = Layer.provide(OpenAi, NodeHttpClient.layerUndici)

// Create the complete AI layers by providing the OpenAI client
const EmbeddingModelLayer = Layer.provide(
  OpenAiEmbeddingModel.model("text-embedding-3-small", { mode: "batched" }),
  OpenAiWithHttp
)
const LanguageModelLayer = Layer.provide(
  OpenAiLanguageModel.model("gpt-5-nano"),
  OpenAiWithHttp
)

// Create the AI layers
const AiLayers = Layer.merge(
  EmbeddingModelLayer,
  LanguageModelLayer
)

// Create the core application layers
const CoreLayers = Layer.mergeAll(
  MockDatabaseService.Default,
  PGLiteVectorOps.Default.pipe(
    Layer.provide(PGLiteVectorService.Default)
  ),
  LoggerLive
)

// Create the complete application layer by merging all dependencies
const AppLayer = Layer.provide(
  PGLiteQAService.Default,
  CoreLayers
)

// Run with real embeddings
pipe(
  realEmbeddingsProgram,
  Effect.provide(AppLayer),
  Effect.provide(AiLayers),
  Effect.tapBoth({
    onFailure: (error) => Effect.sync(() => console.error("💥 Error:", error)),
    onSuccess: (result) => Effect.sync(() => console.log(result))
  }),
  Effect.runPromise
)
