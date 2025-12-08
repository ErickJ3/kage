const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";

const JSON_HEADERS: HeadersInit = { "Content-Type": JSON_CONTENT_TYPE };
const TEXT_HEADERS: HeadersInit = { "Content-Type": TEXT_CONTENT_TYPE };

const JSON_INIT_200: ResponseInit = { headers: JSON_HEADERS };
const TEXT_INIT_200: ResponseInit = { headers: TEXT_HEADERS };

const frozenJsonHeaders = Object.freeze({ "Content-Type": JSON_CONTENT_TYPE });
const frozenJsonInit: ResponseInit = { headers: frozenJsonHeaders };

const smallObject = { id: 1, name: "test" };
const mediumObject = {
  id: 1,
  name: "test",
  email: "test@example.com",
  createdAt: "2024-01-01",
  tags: ["a", "b", "c"],
};
const largeObject = {
  users: Array.from({ length: 100 }, (_, i) => ({
    id: i,
    name: `User ${i}`,
    email: `user${i}@example.com`,
  })),
};

Deno.bench("response - new Response text", () => {
  new Response("Hello World");
});

Deno.bench("response - new Response with headers inline", () => {
  new Response("Hello", { headers: { "Content-Type": "text/plain" } });
});

Deno.bench("response - new Response with cached init", () => {
  new Response("Hello", TEXT_INIT_200);
});

Deno.bench("response - new Response with frozen init", () => {
  new Response("Hello", frozenJsonInit);
});

Deno.bench("response - JSON.stringify small", () => {
  JSON.stringify(smallObject);
});

Deno.bench("response - JSON.stringify medium", () => {
  JSON.stringify(mediumObject);
});

Deno.bench("response - JSON.stringify large", () => {
  JSON.stringify(largeObject);
});

Deno.bench("response - full json small (stringify + Response)", () => {
  new Response(JSON.stringify(smallObject), JSON_INIT_200);
});

Deno.bench("response - full json medium (stringify + Response)", () => {
  new Response(JSON.stringify(mediumObject), JSON_INIT_200);
});

Deno.bench("response - full json large (stringify + Response)", () => {
  new Response(JSON.stringify(largeObject), JSON_INIT_200);
});

Deno.bench("response - Response null 204", () => {
  new Response(null, { status: 204 });
});

Deno.bench("response - Response with status", () => {
  new Response("Not Found", { status: 404 });
});

Deno.bench("response - Response with status and headers", () => {
  new Response("Not Found", { status: 404, headers: TEXT_HEADERS });
});

const binaryData = new Uint8Array(1024);
const largeBinaryData = new Uint8Array(1024 * 100);

Deno.bench("response - binary 1KB", () => {
  new Response(binaryData);
});

Deno.bench("response - binary 100KB", () => {
  new Response(largeBinaryData);
});

Deno.bench("response - Headers constructor", () => {
  new Headers({ "Content-Type": "application/json" });
});

Deno.bench("response - Headers from object literal", () => {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  new Response("", { headers });
});

const prebuiltHeaders = new Headers({ "Content-Type": "application/json" });

Deno.bench("response - reuse Headers instance", () => {
  new Response("", { headers: prebuiltHeaders });
});

Deno.bench("response - redirect 302", () => {
  new Response(null, { status: 302, headers: { Location: "/new" } });
});

Deno.bench("response - Response.redirect", () => {
  Response.redirect("/new", 302);
});

Deno.bench("response - Response.json", () => {
  Response.json(smallObject);
});

Deno.bench("response - Response.json vs manual", () => {
  new Response(JSON.stringify(smallObject), JSON_INIT_200);
});
