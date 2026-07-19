import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app";

describe("health endpoint", () => {
  it("reports the local evaluation service as ready", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "semantic-contract-eval-studio",
      status: "ok",
    });
    await app.close();
  });
});
