const packages = [
  "packages/router/deno.json",
  "packages/core/deno.json",
  "packages/schema/deno.json",
  "packages/dev/deno.json",
];

const version = Deno.args[0];

if (!version) {
  console.error("Usage: deno task version <version>");
  console.error("Example: deno task version 0.1.1");
  Deno.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Invalid version format. Use semver: X.Y.Z");
  Deno.exit(1);
}

for (const path of packages) {
  const content = await Deno.readTextFile(path);
  const json = JSON.parse(content);
  const oldVersion = json.version;
  json.version = version;
  await Deno.writeTextFile(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`${json.name}: ${oldVersion} → ${version}`);
}

console.log(`\nDone! All packages updated to v${version}`);
console.log("\nNext steps:");
console.log(`  git add -A`);
console.log(`  git commit -m "chore: bump version to ${version}"`);
console.log(`  git tag v${version}`);
console.log(`  git push origin main --tags`);
