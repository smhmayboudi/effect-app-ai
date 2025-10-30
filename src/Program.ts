import { OpenAiClient, OpenAiEmbeddingModel, OpenAiLanguageModel } from "@effect/ai-openai"
import { NodeHttpClient } from "@effect/platform-node"
import { Config, Layer, pipe } from "effect"
import * as Effect from "effect/Effect"
import { MockDatabaseService } from "./MockDatabaseService.js"
import { PGLiteQAService } from "./PGLiteQAService.js"
import { PGLiteVectorOps } from "./PGLiteVectorOps.js"
import { PGLiteVectorService } from "./PGLiteVectorService.js"

// Example program with real embeddings
const realEmbeddingsProgram = Effect.gen(function*() {
  const qaService = yield* PGLiteQAService

  console.log("📊 Initializing Q&A Service with Real Embeddings...")

  try {
    // Sync data with real embeddings
    console.log("🔄 Syncing data with real embeddings...")
    const syncResult = yield* qaService.syncDataToVectorStore()
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
      const enhancedResults = yield* qaService.enhancedSemanticSearch(question)
      console.log(`🔍 Found ${enhancedResults.length} relevant items via semantic search`)

      const answer = yield* qaService.answerQuestion(question)
      console.log(`🤖 Answer: ${answer.substring(0, 200)}...\n`)

      yield* Effect.sleep("1 seconds") // Rate limiting for API
    }

    return "🎉 Real embeddings demonstration completed successfully!"
  } catch (error) {
    console.error("💥 Error:", error)
    return "❌ Demonstration failed"
  }
})

// Create the base OpenAI client layer
const OpenAi = OpenAiClient.layerConfig({
  apiKey: Config.redacted("OPENAI_API_KEY")
})

const OpenAiWithHttp = Layer.provide(OpenAi, NodeHttpClient.layerUndici)

// Create the complete AI layers by providing the OpenAI client
const EmbeddingModelLayer = Layer.provide(
  OpenAiEmbeddingModel.model("text-embedding-ada-002", { mode: "batched" }),
  OpenAiWithHttp
)
const LanguageModelLayer = Layer.provide(
  OpenAiLanguageModel.model("gpt-5-nano"),
  OpenAiWithHttp
)

// Create the AI layers
const AiLayers = Layer.mergeAll(
  EmbeddingModelLayer,
  LanguageModelLayer
)

// Create the core application layers
const CoreLayers = Layer.mergeAll(
  MockDatabaseService.Default,
  Layer.provide(
    PGLiteVectorOps.Default,
    PGLiteVectorService.Default
  )
)

// Create the complete application layer by merging all dependencies
const AppLayer = Layer.provide(
  PGLiteQAService.Default,
  CoreLayers
)

// Run with real embeddings
pipe(
  realEmbeddingsProgram,
  Effect.provide(AiLayers),
  Effect.provide(AppLayer),
  Effect.tapBoth({
    onFailure: (error) => Effect.sync(() => console.error("💥 Error:", error)),
    onSuccess: (result) => Effect.sync(() => console.log(result))
  }),
  Effect.runPromise
)
