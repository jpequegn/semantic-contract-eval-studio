import { createSeededDatabase } from "../domain/seed";

const database = await createSeededDatabase();
try {
  process.stdout.write(`${JSON.stringify(database.summary, null, 2)}\n`);
} finally {
  database.close();
}
