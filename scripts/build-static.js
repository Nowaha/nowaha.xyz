const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");
const { execSync } = require("child_process");

const SRC = "./public";
const TARGET = "./out/public";
const EXCLUDED_FOLDERS = ["js", "css"];

const resolveGitHash = () => {
    const envHash = process.env.GITHUB_SHA;
    if (envHash) return envHash;

    try {
        return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    } catch {}

    return "dev";
};

const ensureDirExists = (dirPath) => {
    if (fs.existsSync(dirPath)) return false;
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
};

const copy = (src, dst, exclude = []) => {
    const files = [];

    for (const item of fs.readdirSync(src, { withFileTypes: true })) {
        const itemPath = path.join(src, item.name);
        const dstItemPath = path.join(dst, item.name);

        if (exclude.includes(item.name)) continue;

        files.push(dstItemPath);
        if (item.isDirectory()) {
            fs.mkdirSync(dstItemPath, { recursive: true });
            files.push(...copy(itemPath, dstItemPath));
            continue;
        }
        fs.copyFileSync(itemPath, dstItemPath);
    }

    return files;
};

const cleanup = (dst, files, exclude = []) => {
    for (const item of fs.readdirSync(dst, { withFileTypes: true })) {
        const itemPath = path.join(dst, item.name);

        if (exclude.includes(item.name)) continue;

        if (item.isDirectory()) {
            cleanup(itemPath, files);
            if (fs.readdirSync(itemPath).length === 0) fs.rmdirSync(itemPath);
            continue;
        }

        if (files.includes(itemPath)) continue;
        fs.rmSync(itemPath);
        console.log(`[BUILD] Deleted "${itemPath}" as it is no longer within "${SRC}".`);
    }
};

const applyPlaceholders = (files, hash) => {
    let applied = 0;
    for (const file of files) {
        if (!file.endsWith(".html")) continue;

        const contents = fs.readFileSync(file, { encoding: "utf-8" });
        const newContents = contents.replace(/{GIT_HASH}/g, hash);
        if (newContents == contents) continue;

        fs.writeFileSync(file, newContents);
        applied++;
    }
    return applied;
};

const build = () => {
    const gitHash = resolveGitHash();
    console.log(`[BUILD] Using git hash "${gitHash}".`);
    const createdTargetDir = ensureDirExists(TARGET);
    if (createdTargetDir) {
        console.log(`[BUILD] Created target directory ${TARGET}.`);
    } else {
        console.log(`[BUILD] Using existing target directory ${TARGET}.`);
    }
    const copied = copy(SRC, TARGET, EXCLUDED_FOLDERS);
    console.log(`[BUILD] Copied ${copied.length} file${copied.length === 1 ? "" : "s"}.`);
    const placeholders = applyPlaceholders(copied, gitHash);
    console.log(`[BUILD] Applied placeholders to ${placeholders} file${placeholders === 1 ? "" : "s"}.`);
    cleanup(TARGET, copied, EXCLUDED_FOLDERS);
    console.log("[BUILD] Cleanup completed.");
};

build();

const watchMode = process.argv.includes("--watch");

if (watchMode) {
    const watcher = chokidar.watch(SRC, {
        ignored: EXCLUDED_FOLDERS.map((f) => `${SRC}/${f}`),
        ignoreInitial: true,
        persistent: true,
    });

    console.log("[BUILD] Watching for changes...");

    watcher.on("all", (event, pathChanged) => {
        console.log(`\n[WATCH] Detected ${event} on "${pathChanged}"`);
        build();
    });
}
