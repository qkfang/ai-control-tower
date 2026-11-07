import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bindingsPath = join(appRoot, ".fabric-bindings.json");
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let configDirectory;

try {
    if (existsSync(bindingsPath)) {
        const { workspaceId, semanticModelId } = JSON.parse(readFileSync(bindingsPath, "utf8"));
        for (const id of [workspaceId, semanticModelId]) {
            if (typeof id !== "string" || !guid.test(id) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(id)) {
                throw new Error("Invalid app bindings. Run script/03_deploy_fabric.ps1 first.");
            }
        }
        configDirectory = mkdtempSync(join(appRoot, ".fabric-config-"));
        writeFileSync(join(configDirectory, "fabric.yaml"), JSON.stringify({
            activeProfile: "default",
            profiles: { default: { semanticModels: { controlTower: { workspaceId, itemId: semanticModelId } } } },
        }));
    } else {
        process.stderr.write("No deployment bindings: building with placeholder data connections.\n");
    }

    execFileSync(process.execPath, [
        join(appRoot, "node_modules", "@microsoft", "fabric-app-data-cli", "dist", "index.js"),
        "generate", "--output", join(appRoot, "src", "fabric.generated.ts"),
    ], { cwd: configDirectory ?? appRoot, stdio: "inherit" });
} finally {
    if (configDirectory) {
        const configPath = join(configDirectory, "fabric.yaml");
        if (existsSync(configPath)) unlinkSync(configPath);
        rmdirSync(configDirectory);
    }
}
