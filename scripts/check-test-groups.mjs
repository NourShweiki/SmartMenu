// Proves that every test is in exactly ONE area of test-groups.json, so CI (which runs the areas one by one) never
// skips a test. Fails with the list of files to fix. Run: `npm run test:groups`.
// With `--matrix`, also prints the areas as JSON lines for the CI matrix (see .github/workflows/ci.yml).
import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const { groups } = JSON.parse(readFileSync(resolve(root, "test-groups.json"), "utf8"));
const problems = [];

// ── Vitest files (unit + integration): which project(s) does Vitest itself put each file in? ──
const listed = JSON.parse(
  execFileSync(process.execPath, [resolve(root, "node_modules/vitest/vitest.mjs"), "list", "--filesOnly", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }),
);
const areasOf = new Map();
for (const { file, projectName } of listed) {
  const path = relative(root, file).replaceAll("\\", "/");
  areasOf.set(path, [...(areasOf.get(path) ?? []), projectName]);
}
for (const file of walk(resolve(root, "src")).filter((f) => f.endsWith(".test.ts"))) {
  const areas = areasOf.get(file) ?? [];
  if (areas.length === 0) problems.push(`${file} is in no area: add it to an area's "unit" list`);
  if (areas.length > 1) problems.push(`${file} is in ${areas.length} areas (${areas.join(", ")}): keep it in one`);
}
// A plain path (no *) that matches nothing is a typo or a deleted file.
for (const group of groups) {
  for (const pattern of group.unit) {
    if (!pattern.includes("*") && !areasOf.has(pattern)) problems.push(`${group.id}: "${pattern}" does not exist`);
  }
}

// ── pgTAP files ──
const sqlDir = resolve(root, "supabase/tests/database");
const sqlFiles = readdirSync(sqlDir).filter((f) => f.endsWith(".test.sql")).map((f) => f.replace(/\.test\.sql$/, ""));
for (const name of sqlFiles) {
  const areas = groups.filter((g) => g.database.includes(name)).map((g) => g.id);
  if (areas.length === 0) problems.push(`supabase/tests/database/${name}.test.sql is in no area: add "${name}" to an area's "database" list`);
  if (areas.length > 1) problems.push(`supabase/tests/database/${name}.test.sql is in ${areas.length} areas (${areas.join(", ")})`);
}
for (const group of groups) {
  for (const name of group.database) {
    if (!sqlFiles.includes(name)) problems.push(`${group.id}: database test "${name}" does not exist`);
  }
}

if (problems.length > 0) {
  console.error(`test-groups.json is out of date (${problems.length}):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
const counts = groups.map((g) => {
  const unit = [...areasOf.values()].filter((areas) => areas[0] === g.id).length;
  return `${g.name}: ${unit} test files, ${g.database.length} database files`;
});
console.log(`Every test is in exactly one area.\n  ${counts.join("\n  ")}`);

if (process.argv.includes("--matrix")) {
  // For the CI matrix: every area for unit tests, only areas with database or integration tests for the database job.
  const unit = groups.map(({ id, name }) => ({ id, name }));
  const database = groups
    .filter((g) => g.database.length > 0 || [...areasOf].some(([f, a]) => a[0] === g.id && f.includes(".integration.")))
    .map(({ id, name, database: files }) => ({ id, name, files: files.map((f) => `supabase/tests/database/${f}.test.sql`).join(" ") }));
  const out = `unit=${JSON.stringify(unit)}\ndatabase=${JSON.stringify(database)}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out);
  else console.log(out);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [relative(root, path).replaceAll("\\", "/")];
  });
}
