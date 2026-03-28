import fs from "node:fs/promises";
import path from "node:path";

const packageJsonPath = path.resolve("node_modules", "pdf-img-convert", "package.json");

async function main() {
  try {
    const raw = await fs.readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw);

    if (pkg.type !== "module") {
      pkg.type = "module";
      await fs.writeFile(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
      console.log("Patched pdf-img-convert package.json with type=module");
    }
  } catch (error) {
    console.warn(`Skipping pdf-img-convert patch: ${error.message}`);
  }
}

await main();
