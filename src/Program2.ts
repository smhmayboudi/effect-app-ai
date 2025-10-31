import { Config, Effect, Layer, pipe } from "effect"

import { OpenAiClient, OpenAiEmbeddingModel, OpenAiLanguageModel } from "@effect/ai-openai"
import { NodeHttpClient } from "@effect/platform-node"
import { BusinessIntelligenceService } from "./BusinessIntelligenceService.js"
import { MockDatabaseService } from "./MockDatabaseService.js"
import { PGLiteQAService } from "./PGLiteQAService.js"
import { PGLiteVectorOps } from "./PGLiteVectorOps.js"
import { PGLiteVectorService } from "./PGLiteVectorService.js"

const biDemoProgram = Effect.gen(function*() {
  const biService = yield* BusinessIntelligenceService
  const qaService = yield* PGLiteQAService

  console.log("📈 Business Intelligence Demo Starting...")

  // Sync data first
  yield* qaService.syncDataToVectorStore()

  // 1. Get comprehensive dashboard
  console.log("📊 Generating KPI Dashboard...")
  const dashboard = yield* biService.getKPIDashboard()
  console.log("Dashboard Overview:", dashboard.overview)

  // 2. Natural language queries to insights
  const nlQueries = [
    "Show me revenue by customer segment",
    "What are our sales trends this month?",
    "Which products are most profitable?",
    "How are our user demographics distributed?"
  ]

  for (const query of nlQueries) {
    console.log(`\n🗣️  NL Query: "${query}"`)
    const result = yield* biService.naturalLanguageToDashboard(query)
    console.log(`📈 Visualization: ${result.visualization}`)
    console.log(`💡 Insights: ${result.insights}`)
  }

  // 3. Customer segmentation
  console.log("\n👥 Analyzing Customer Segments...")
  const segments = yield* biService.segmentCustomers()
  console.log("Customer Segments:", Object.keys(segments.segments))

  // 4. Automated insights
  console.log("\n🔍 Generating Automated Business Insights...")
  const insights = yield* biService.generateBusinessInsights()
  insights.forEach((insight) => {
    console.log(`\n⚠️  ${insight.title} (${insight.severity})`)
    console.log(`   ${insight.description}`)
    insight.recommendations.forEach((rec) => console.log(`   💡 ${rec}`))
  })

  return "🎯 Business Intelligence demo completed!"
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
const AiLayers = Layer.mergeAll(
  EmbeddingModelLayer,
  LanguageModelLayer
)

// Create the core application layers
const CoreLayers = Layer.merge(
  MockDatabaseService.Default,
  Layer.provideMerge(
    PGLiteVectorOps.Default,
    PGLiteVectorService.Default.pipe(Layer.provide(Layer.scope))
  )
)

const AppLayer = Layer.provideMerge(
  PGLiteQAService.Default,
  CoreLayers
)

// Add to your layer configuration
const BILayer = Layer.provideMerge(
  BusinessIntelligenceService.Default,
  AppLayer
)

// Run the BI demo
pipe(
  biDemoProgram,
  Effect.provide(AiLayers),
  Effect.provide(BILayer),
  Effect.tapBoth({
    onFailure: (error) => Effect.sync(() => console.error("💥 BI Error:", error)),
    onSuccess: (result) => Effect.sync(() => console.log(result))
  }),
  Effect.runPromise
)
