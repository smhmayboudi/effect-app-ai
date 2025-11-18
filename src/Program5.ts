import { DuckDBInstance } from "@duckdb/node-api"

const db = await DuckDBInstance.create(":memory:")
const connection = await db.connect()

await connection.run(`
  CREATE TABLE documents (
    id INTEGER,
    title VARCHAR,
    embedding FLOAT[3]
  );
`)
await connection.run(`
  INSERT INTO documents VALUES 
    (1, 'Document A', [0.1, 0.2, 0.3]),
    (2, 'Document B', [0.4, 0.5, 0.6]),
    (3, 'Document C', [0.7, 0.8, 0.9]);
`)

const reader = await connection.runAndReadAll(`
  --     (x, y) -> (x - y) * (x - y)
  SELECT 
    id,
    title,
    embedding,
    array_distance(embedding, [1, 2, 3]::FLOAT[3]) as distance
  FROM documents
  ORDER BY distance ASC
  LIMIT 2;
`)
const rows = reader.getRows()
console.log({ rows })

connection.disconnectSync()
