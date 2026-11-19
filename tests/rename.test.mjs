// Local macOS regression tests, 2026-11-19. Only synthetic temporary data.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const main = await fs.readFile(new URL("../src/main.js", import.meta.url), "utf8");
const OS = {TYPE: {WINDOWS: "windows", LINUX: "linux", MAC: "mac"}};

async function loadModule(relative, dependencies, globals = {}) {
    const context = vm.createContext({TextEncoder, crypto: globalThis.crypto, ...globals});
    const module = new vm.SourceTextModule(await fs.readFile(new URL(relative, import.meta.url), "utf8"), {context});
    await module.link(specifier => {
        const exports = dependencies[specifier];
        assert.ok(exports, `Unexpected dependency ${specifier}`);
        return new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        }, {context});
    });
    await module.evaluate();
    return module.namespace;
}

const {validateName} = await loadModule("../src/core/utils/FileSystem.js", {
    "./OSUtil": {OS, getOSType: () => OS.TYPE.MAC}
});

function functionSource(name) {
    const start = main.indexOf(`async function ${name}(`);
    assert.ok(start >= 0, name);
    const end = main.indexOf("\n}", start) + 2;
    return main.slice(start, end);
}

function renameHarness(overrides = {}) {
    const events = [];
    const title = {value: "Fallen Angel"};
    const hidden = new Set(["loader"]);
    const parent = "/synthetic/Mods";
    const launcher = {getFunctions: () => ({
        getName: () => "DDFA fix", getPath: async () => parent,
        leftClick: async () => events.push(["select"])
    })};
    const context = vm.createContext({
        renamingMod: false, currentEntry: "DDFA fix", fileTerminator: "/",
        STRINGS: {isEmpty: value => value === ""}, validateName,
        formatModName: value => value, getLauncher: () => launcher,
        getIsLaunchedFlag: () => false, gotoHomePage: () => events.push(["home"]),
        isExist: async target => { events.push(["exists", target]); return false; },
        invoke: async (...args) => events.push(["invoke", ...args]),
        requestDirectory: async target => events.push(["refresh", target]),
        sendAlertAsync: async message => events.push(["message", message]),
        Logger: {log() {}, warn() {}},
        Hud: {ofId: () => title, show: id => hidden.delete(id), hide: id => hidden.add(id),
            setLoadingSubtitle() {}, setLoadingBar() {}}, ...overrides
    });
    vm.runInContext(functionSource("renameMod"), context);
    return {run: () => context.renameMod(), context, events, hidden, title, parent};
}

test("rename checks the exact sibling path, awaits Rust, refreshes and selects", async () => {
    const h = renameHarness();
    await h.run();
    assert.deepEqual(h.events[0], ["exists", "/synthetic/Mods/Fallen Angel"]);
    assert.equal(h.events[1][1], "rename_dir");
    assert.equal(h.events[1][2].path, "/synthetic/Mods/DDFA fix");
    assert.equal(h.events[1][2].newName, "/synthetic/Mods/Fallen Angel");
    assert.deepEqual(h.events[2], ["refresh", h.parent]);
    assert.deepEqual(h.events[3], ["select"]);
    assert.equal(h.hidden.has("loader"), true);
    assert.equal(h.hidden.has("main"), false);
    assert.equal(h.context.renamingMod, false);
});

test("duplicate target prevents the Rust command and preserves the title", async () => {
    const h = renameHarness({isExist: async () => true});
    await h.run();
    assert.equal(h.events.some(event => event[0] === "invoke"), false);
    assert.match(h.events[0][1], /already exists/);
    assert.equal(h.title.value, "DDFA fix");
});

test("a running game cannot be renamed", async () => {
    const h = renameHarness({getIsLaunchedFlag: () => true});
    await h.run();
    assert.equal(h.events.some(event => event[0] === "invoke"), false);
    assert.match(h.events[0][1], /Close the running game/);
});

test("Rust failure restores the UI without refreshing or reporting success", async () => {
    const h = renameHarness({invoke: async () => { throw new Error("permission denied"); }});
    await h.run();
    assert.equal(h.events.some(event => event[0] === "refresh"), false);
    assert.match(h.events.find(event => event[0] === "message")[1], /permission denied/);
    assert.equal(h.title.value, "DDFA fix");
    assert.equal(h.hidden.has("loader"), true);
    assert.equal(h.hidden.has("main"), false);
});

test("a list refresh failure correctly reports that the disk rename succeeded", async () => {
    const h = renameHarness({requestDirectory: async () => { throw new Error("refresh failed"); }});
    await h.run();
    assert.match(h.events.find(event => event[0] === "message")[1], /was renamed/);
    assert.equal(h.hidden.has("main"), false);
});

test("overlapping blur events cannot invoke two renames", async () => {
    let finish;
    let calls = 0;
    const h = renameHarness({invoke: async () => { calls++; await new Promise(resolve => { finish = resolve; }); }});
    const first = h.run();
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    await h.run();
    assert.equal(calls, 1);
    finish();
    await first;
});

