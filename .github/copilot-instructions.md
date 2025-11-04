## What this repository is

- TypeScript library built with the Effect ecosystem. Sources live in `src/` and the build artifacts are emitted to `build/` (`esm/`, `cjs/`, and `dts/`).
- Primary domain: small AI tooling and vector-based Q&A backed by pglite. Key services: `PGLiteVectorService`, `PGLiteQAService`, `PGLiteVectorOps`, and `MockDatabaseService`.

## Quick commands (authoritative)
- Install: use pnpm (project uses pinned pnpm in `package.json`).
- Typecheck: `pnpm check` (runs `tsc -b tsconfig.json`).
- Build: `pnpm build` — expands to `build-esm`, `build-annotate`, `build-cjs`, then packaging steps.
- Run tests: `pnpm test` (runs `vitest`).
- Run a demo TypeScript file: `pnpm tsx ./src/Program.ts` (project includes `tsx` to run TS directly).

## Big-picture architecture (how things fit together)
- The project is organized as a collection of Effect-based services (Layers). Look at `src/Program.ts` for the canonical wiring: OpenAI client and models are created as Effect Layers and merged with storage/vector layers to form an `AppLayer`.
- Data flow for the QA/demo use case:
  - Database (MockDatabaseService) => vector ops (`PGLiteVectorOps`) => vector store (`PGLiteVectorService`) => QA service (`PGLiteQAService`) => embedding + LLM (from `@effect/ai-*` clients)
  - Embeddings are produced via the configured EmbeddingModelLayer and used for semantic search (see `qaService.syncDataToVectorStore()` and `qaService.enhancedSemanticSearch()` in `src/Program.ts`).

## Project-specific conventions
- Uses Effect Layers extensively. Typical pattern to copy:

```ts
// create layers
const AiLayers = Layer.merge(EmbeddingModelLayer, LanguageModelLayer)
const CoreLayers = Layer.merge(MockDatabaseService.Default, PGLiteVectorService.Default)
// provide and run
pipe(program, Effect.provide(AppLayer), Effect.provide(AiLayers), Effect.runPromise)
```

- ESM-first codebase (see `type: module` in `package.json`) but the build emits both `esm` and `cjs` for distribution. If you change exports, update the build pipeline (`babel` steps and `tsconfig.build.json`).
- The repo uses `@effect/build-utils` and `generateExports` config in `package.json`; adding new top-level TS files may require running the codegen/build-utils steps.

## Search patterns that help when editing or automating
- To find core services: search for `PGLiteQAService`, `PGLiteVectorService`, `MockDatabaseService`, `BusinessIntelligenceService`.
- To find build/test commands: inspect `package.json` scripts (`build`, `build-esm`, `build-cjs`, `test`, `check`).

## Integration & external dependencies
- OpenAI: configured via `OpenAiClient.layerConfig` in `src/Program.ts`. The runtime expects `OPENAI_API_KEY` in the environment (use `.env`/CI secrets). Do NOT hardcode keys in files — the README currently contains apparent API keys and should be cleaned up.
- Vector DB: `@electric-sql/pglite` is used for in-process vector storage.
- Important packages: `@effect/ai`, `@effect/ai-openai`, `effect`, `@electric-sql/pglite`.

## What to watch for when modifying code
- Keep Layer boundaries explicit. When adding a service, follow the existing `Service.Default` + `Layer.provideMerge` pattern.
- When adding public APIs, ensure TypeScript build and `generateExports` config include the new files so the package index is generated.
- Tests use `vitest` and can be run with `pnpm test`. Add a test alongside new modules under `test/`.

## Minimal examples the agent can use as templates
- Wiring an AI client and running: see `src/Program.ts` (look for `OpenAiClient.layerConfig`, `OpenAiEmbeddingModel.model`, and `Effect.runPromise`).
- Vector sync + query: `PGLiteQAService.syncDataToVectorStore()` and `qaService.enhancedSemanticSearch()` in `src/Program.ts` are concrete examples of embedding + semantic search flow.

## Safety & housekeeping notes for the agent
- Do not commit secrets. The repo README currently contains strings that look like API keys — flag these to the human and avoid printing them in PRs or suggestions.
- Prefer small, incremental changes: update Layer wiring, tests, and `package.json` scripts together to keep the build stable.

If anything above is unclear or you'd like me to emphasize different files/patterns, tell me which area to expand and I will iterate. 
