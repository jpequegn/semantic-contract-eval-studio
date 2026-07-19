import { buildApp } from "./app";

const app = await buildApp();

try {
  await app.listen({
    host: "127.0.0.1",
    port: Number(process.env.PORT ?? 8787),
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
