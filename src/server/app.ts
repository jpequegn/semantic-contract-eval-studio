import cors from "@fastify/cors";
import Fastify from "fastify";

export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: false });

  app.get("/api/health", async () => ({
    service: "semantic-contract-eval-studio",
    status: "ok",
  }));

  return app;
}
