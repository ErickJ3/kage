/**
 * Permission-aware routing demonstration.
 *
 * This example shows how Kage's unique permission system works.
 *
 * Run with specific permissions:
 *   deno run --allow-net=api.example.com --allow-env=API_KEY examples/permissions_demo.ts
 *
 * The routes below declare their required permissions, and Kage
 * can validate them at runtime.
 */

import { Context, Kage } from "../mod.ts";

const app = new Kage({
  development: true,
});

// Simple route - no permissions needed
app.get("/", () => ({
  message: "Public endpoint - no permissions required",
}));

// Route that requires network access
app.get("/fetch-data", {
  permissions: ["net:api.example.com"],
  handler: async () => {
    // This route declares it needs network access to api.example.com
    // If run without --allow-net=api.example.com, it would fail
    try {
      const response = await fetch("https://api.example.com/data");
      return {
        success: true,
        data: await response.json(),
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  },
});

// Route that requires environment variables
app.get("/config", {
  permissions: ["env:API_KEY", "env:DATABASE_URL"],
  handler: () => {
    // This route needs access to specific environment variables
    const apiKey = Deno.env.get("API_KEY");
    const dbUrl = Deno.env.get("DATABASE_URL");

    return {
      hasApiKey: !!apiKey,
      hasDbUrl: !!dbUrl,
      // Never expose actual secrets in responses!
      apiKeyLength: apiKey?.length ?? 0,
    };
  },
});

// Route with multiple permission types
app.post("/upload", {
  permissions: ["read:/tmp", "write:/uploads", "net:storage.example.com"],
  handler: (ctx: Context) => {
    // This route needs:
    // - Read access to /tmp (to read uploaded file)
    // - Write access to /uploads (to save file)
    // - Network access to storage.example.com (to upload to cloud)

    return ctx.json({
      message: "File upload would happen here",
      permissions: {
        read: "/tmp",
        write: "/uploads",
        network: "storage.example.com",
      },
    });
  },
});

// Route demonstrating permission validation
app.get("/permissions-info", () => {
  return {
    message: "Permission system demo",
    examples: [
      {
        route: "/fetch-data",
        permissions: ["net:api.example.com"],
        description: "Requires network access to specific host",
      },
      {
        route: "/config",
        permissions: ["env:API_KEY", "env:DATABASE_URL"],
        description: "Requires access to specific environment variables",
      },
      {
        route: "/upload",
        permissions: ["read:/tmp", "write:/uploads", "net:storage.example.com"],
        description: "Requires multiple permission types",
      },
    ],
    howToRun: {
      minimal: "deno run --allow-net examples/permissions_demo.ts",
      withPermissions:
        "deno run --allow-net=api.example.com --allow-env=API_KEY,DATABASE_URL --allow-read=/tmp --allow-write=/uploads examples/permissions_demo.ts",
    },
  };
});

await app.listen({
  port: 8000,
  onListen: ({ hostname, port }) => {
    console.log(`Permission demo server running on http://${hostname}:${port}`);
    console.log("\nEndpoints:");
    console.log("  GET  http://localhost:8000/");
    console.log("  GET  http://localhost:8000/permissions-info");
    console.log("  GET  http://localhost:8000/fetch-data");
    console.log("  GET  http://localhost:8000/config");
    console.log("  POST http://localhost:8000/upload");
    console.log("\nNote: Routes declare their required permissions.");
    console.log(
      "Try running with different --allow-* flags to see permission checks.",
    );
  },
});
