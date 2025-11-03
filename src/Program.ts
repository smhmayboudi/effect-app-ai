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
    console.log(`🤖 Answer: ${answer}\n`)

    // yield* Effect.sleep("1 seconds") // Rate limiting for API
  }

  const recommendations = yield* qaService.advancedRecommendations(1)
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
const CoreLayers = Layer.merge(
  MockDatabaseService.Default,
  Layer.provideMerge(
    PGLiteVectorOps.Default,
    PGLiteVectorService.Default
  )
)

// Create the complete application layer by merging all dependencies
const AppLayer = Layer.provideMerge(
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
