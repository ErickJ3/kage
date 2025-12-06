const simpleUrl = "http://localhost:8000/users";
const paramUrl = "http://localhost:8000/users/123";
const queryUrl = "http://localhost:8000/users?page=1&limit=10";
const complexUrl =
  "http://localhost:8000/api/v1/users/123/posts/456?include=comments&sort=date#section";
const longPathUrl =
  "http://localhost:8000/api/v1/organizations/abc123/teams/team456/members/member789/roles";

function parsePathManual(urlStr: string): string {
  let i = 0;
  const len = urlStr.length;
  while (i < len && urlStr.charCodeAt(i) !== 58) i++;
  if (i >= len) return "/";
  i += 3;
  while (i < len && urlStr.charCodeAt(i) !== 47) i++;
  if (i >= len) return "/";
  const pathStart = i;
  while (i < len) {
    const c = urlStr.charCodeAt(i);
    if (c === 63 || c === 35) break;
    i++;
  }
  return urlStr.slice(pathStart, i);
}

function parsePathIndexOf(urlStr: string): string {
  const protocolEnd = urlStr.indexOf("://");
  if (protocolEnd === -1) return "/";
  const pathStart = urlStr.indexOf("/", protocolEnd + 3);
  if (pathStart === -1) return "/";
  const queryStart = urlStr.indexOf("?", pathStart);
  const hashStart = urlStr.indexOf("#", pathStart);
  let pathEnd = urlStr.length;
  if (queryStart !== -1 && (hashStart === -1 || queryStart < hashStart)) {
    pathEnd = queryStart;
  } else if (hashStart !== -1) {
    pathEnd = hashStart;
  }
  return urlStr.slice(pathStart, pathEnd);
}

function parsePathNewUrl(urlStr: string): string {
  return new URL(urlStr).pathname;
}

Deno.bench("path - manual charCode simple", () => {
  parsePathManual(simpleUrl);
});

Deno.bench("path - indexOf simple", () => {
  parsePathIndexOf(simpleUrl);
});

Deno.bench("path - new URL simple", () => {
  parsePathNewUrl(simpleUrl);
});

Deno.bench("path - manual charCode with param", () => {
  parsePathManual(paramUrl);
});

Deno.bench("path - indexOf with param", () => {
  parsePathIndexOf(paramUrl);
});

Deno.bench("path - new URL with param", () => {
  parsePathNewUrl(paramUrl);
});

Deno.bench("path - manual charCode with query", () => {
  parsePathManual(queryUrl);
});

Deno.bench("path - indexOf with query", () => {
  parsePathIndexOf(queryUrl);
});

Deno.bench("path - new URL with query", () => {
  parsePathNewUrl(queryUrl);
});

Deno.bench("path - manual charCode complex", () => {
  parsePathManual(complexUrl);
});

Deno.bench("path - indexOf complex", () => {
  parsePathIndexOf(complexUrl);
});

Deno.bench("path - new URL complex", () => {
  parsePathNewUrl(complexUrl);
});

Deno.bench("path - manual charCode long path", () => {
  parsePathManual(longPathUrl);
});

Deno.bench("path - indexOf long path", () => {
  parsePathIndexOf(longPathUrl);
});

Deno.bench("path - new URL long path", () => {
  parsePathNewUrl(longPathUrl);
});

Deno.bench("url - new URL full parse", () => {
  new URL(complexUrl);
});

Deno.bench("url - access pathname after parse", () => {
  const url = new URL(complexUrl);
  url.pathname;
});

Deno.bench("url - access searchParams", () => {
  const url = new URL(queryUrl);
  url.searchParams;
});

Deno.bench("url - searchParams.get", () => {
  const url = new URL(queryUrl);
  url.searchParams.get("page");
  url.searchParams.get("limit");
});

const prebuiltUrl = new URL(queryUrl);

Deno.bench("url - reuse URL searchParams.get", () => {
  prebuiltUrl.searchParams.get("page");
  prebuiltUrl.searchParams.get("limit");
});

Deno.bench("url - URLSearchParams manual", () => {
  const queryStart = queryUrl.indexOf("?");
  if (queryStart !== -1) {
    new URLSearchParams(queryUrl.slice(queryStart + 1));
  }
});
