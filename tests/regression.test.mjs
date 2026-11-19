// Local macOS regression tests, 2026-11-19. Only synthetic temporary data.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const main = await fs.readFile(new URL("../src/main.js", import.meta.url), "utf8");

async function loadModule(relative, dependencies, globals = {}) {
    const context = vm.createContext({TextEncoder, structuredClone, crypto: globalThis.crypto, ...globals});
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

test("names containing markup or ampersands retain every character when escaped", async () => {
    const {htmlEscape, formattedHtmlEscape} = await loadModule("../src/core/utils/TextUtil.js", {});
    for (const escape of [htmlEscape, formattedHtmlEscape]) {
        assert.equal(escape("A&B"), "A&amp;B");
        assert.equal(escape("A<B"), "A&lt;B");
        assert.equal(escape("<img>"), "&lt;img&gt;");
        assert.equal(escape('A"B'), "A&quot;B");
        assert.equal(escape("Plain Name"), "Plain Name");
    }
});

function functionSource(name) {
    const start = main.indexOf(`async function ${name}(`);
    assert.ok(start >= 0, name);
    const end = main.indexOf("\n}", start) + 2;
    return main.slice(start, end);
}

test("main setup retains the upstream Settings and Discord header actions", async () => {
    const callbacks = new Map();
    const urls = [];
    let panels = 0;
    const start = main.indexOf("function bindHeaderControls()");
    const end = main.indexOf("\n}", start) + 2;
    const context = vm.createContext({Hud: {onClick: (id, action) => callbacks.set(id, action)},
        openUrl: async url => urls.push(url), PROGRAM_DISCORD: "https://example.invalid/fixture",
        OptionsPanel: class { constructor() { panels++; } }});
    vm.runInContext(main.slice(start, end), context);
    context.bindHeaderControls();
    await callbacks.get("discord-show")();
    callbacks.get("settings-show")();
    assert.deepEqual(urls, ["https://example.invalid/fixture"]);
    assert.equal(panels, 1);
    assert.match(functionSource("setupHTMListeners"), /bindHeaderControls\(\)/,
        "Full startup must call the header bindings, not only define them");
});

test("cancelling the native image dialog has no file or UI mutations", async () => {
    const context = vm.createContext({importingImages: false,
        open: async () => null,
        addImagesToLibrary: () => assert.fail("cancel must not import"),
        Logger: {warn: () => assert.fail("cancel is not an error")},
        sendAlertAsync: () => assert.fail("cancel must not show an error")});
    vm.runInContext(functionSource("selectImageFiles"), context);
    await context.selectImageFiles();
    assert.equal(context.importingImages, false);
});

test("custom cover metadata stores a stable filename and retains the relative executable", async () => {
    const start = main.indexOf("let saveModData = async () => {");
    const end = main.indexOf("\n    };", start) + "\n    };".length;
    assert.ok(start >= 0 && end > start);
    let written;
    const config = {coverId: 6, executable: "DDLC.app/Contents/MacOS/DDLC", time: 123};
    const context = vm.createContext({structuredClone, configData: config,
        configPath: "/synthetic/Mod/.ddmm.config.json",
        coverIdToShortMap: new Map([[6, "image-stable.svg"]]),
        writeTextFile: async (target, contents) => { written = {target, data: JSON.parse(contents)}; }});
    vm.runInContext(main.slice(start, end) + "\nglobalThis.save = saveModData;", context);
    await context.save();
    assert.equal(written.data.coverId, "image-stable.svg");
    assert.equal(written.data.executable, config.executable);
    assert.equal(written.data.time, 123);
    assert.equal(config.coverId, 6, "serialization must not mutate live state");
});

async function imageHarness(t, globals) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ddmm-images-"));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const module = await loadModule("../src/core/utils/ImageImport.js", {
        "@tauri-apps/plugin-fs": {mkdir: fs.mkdir, readFile: fs.readFile,
            writeFile: async (target, bytes, options) => {
                assert.equal(options.createNew, true, "imports must not overwrite");
                await fs.writeFile(target, bytes, {flag: "wx"});
            }},
        "./ImageFormat.js": {imageMimeType: name => /\.(png|jpg|svg)$/i.test(name) ? "image/test" : undefined,
            decodeImage: async bytes => {
                if (bytes[0] !== 137) throw new Error("invalid image");
            }}
    }, globals);
    return {root, importImages: module.importImages};
}

test("image import copies multiple files and retains source bytes and existing images", async t => {
    const {root, importImages} = await imageHarness(t);
    const library = path.join(root, "library");
    await fs.mkdir(library);
    await fs.writeFile(path.join(library, "keep.png"), "keep");
    const sources = [path.join(root, "my cover.png"), path.join(root, "my cover.JPG")];
    for (const source of sources) await fs.writeFile(source, Buffer.from([137, 0, 255, 42]));
    const result = await importImages(sources, library);
    assert.equal(result.errors.length, 0);
    assert.equal(result.imported.length, 2);
    assert.notEqual(result.imported[0], result.imported[1]);
    for (const target of [...sources, ...result.imported]) assert.deepEqual(await fs.readFile(target), Buffer.from([137, 0, 255, 42]));
    assert.equal(await fs.readFile(path.join(library, "keep.png"), "utf8"), "keep");
});

test("a filename collision never overwrites the existing cover", async t => {
    const {root, importImages} = await imageHarness(t, {crypto: {randomUUID: () => "same-id"}});
    const source = path.join(root, "cover.png");
    const library = path.join(root, "library");
    await fs.writeFile(source, Buffer.from([137, 1, 2]));
    const first = await importImages([source], library);
    await fs.writeFile(source, Buffer.from([137, 9, 9]));
    const second = await importImages([source], library);
    assert.equal(second.imported.length, 0);
    assert.equal(second.errors.length, 1);
    assert.deepEqual(await fs.readFile(first.imported[0]), Buffer.from([137, 1, 2]));
});

test("corrupt and unsupported images are reported without copying them", async t => {
    const {root, importImages} = await imageHarness(t);
    const bad = path.join(root, "broken.png");
    const library = path.join(root, "library");
    await fs.writeFile(bad, "not a png");
    const result = await importImages([bad, path.join(root, "file.exe")], library);
    assert.equal(result.imported.length, 0);
    assert.equal(result.errors.length, 2);
    await assert.rejects(fs.stat(library), {code: "ENOENT"});
    assert.equal(await fs.readFile(bad, "utf8"), "not a png");
});

const textModule = await loadModule("../src/core/utils/TextUtil.js", {});
const descriptions = await loadModule("../src/core/utils/ModDescription.js", {"./TextUtil": {htmlEscape: textModule.htmlEscape}});

test("description save preserves all existing metadata and accepts clearing", async () => {
    const config = {executable: "DDLC.app/Contents/MacOS/DDLC", coverId: "custom.svg", time: 45, extension: {keep: true}};
    const original = structuredClone(config);
    let written;
    await descriptions.updateModDescription(config, "My description\nA&B <tag>", async () => { written = structuredClone(config); });
    assert.deepEqual(written, {...original, description: "My description\nA&B <tag>"});
    await descriptions.updateModDescription(config, "", async () => {});
    assert.equal(config.description, "");
    assert.deepEqual({...config, description: undefined}, {...original, description: undefined});
});

test("description save failure restores the prior value and rejects oversized input", async () => {
    const config = {description: "keep", time: 45};
    await assert.rejects(descriptions.updateModDescription(config, "new", async () => { throw new Error("disk failure"); }));
    assert.equal(config.description, "keep");
    const empty = {time: 45};
    await assert.rejects(descriptions.updateModDescription(empty, "new", async () => { throw new Error("disk failure"); }));
    assert.equal(Object.hasOwn(empty, "description"), false);
    await assert.rejects(descriptions.updateModDescription(config, "x".repeat(10001), () => assert.fail()));
});

test("description text is escaped while the technical details remain available", () => {
    const html = descriptions.descriptionHtml('<img src=x onerror="bad()"> & B', "Ren’Py: synthetic<br>Credits: original author");
    assert.ok(!html.includes("<img"));
    assert.ok(html.includes("&lt;img"));
    assert.ok(html.includes("&amp; B"));
    assert.ok(html.includes("Game details &amp; credits"));
    assert.ok(html.includes("Credits: original author"));
});

test("Updates mode does not tick controls removed from the main view", async () => {
    let ticks = 0;
    const context = vm.createContext({desktopOpen: true, Logger: {tick: () => ticks++}, Hud: {tick: () => assert.fail("main UI is unmounted")}});
    vm.runInContext(functionSource("mainTicker"), context);
    await context.mainTicker();
    assert.equal(ticks, 1);
});

test("cancelling description edits does not save or mutate the mod", async () => {
    const input = {value: ""};
    let writes = 0;
    const config = {description: "keep"};
    const context = vm.createContext({currentEntry: "synthetic", savingDescription: false, descriptionTarget: null,
        getLauncher: () => ({getFunctions: () => ({getData: async () => config, setDescription: () => writes++})}),
        Hud: {ofId: () => input, show() {}, hide() {}},});
    input.focus = () => {};
    const start = main.indexOf("function closeDescriptionEditor()");
    const end = main.indexOf("\n}", start) + 2;
    vm.runInContext(functionSource("openDescriptionEditor") + "\n" + main.slice(start, end), context);
    await context.openDescriptionEditor();
    input.value = "discard this";
    context.closeDescriptionEditor();
    assert.equal(config.description, "keep");
    assert.equal(writes, 0);
    assert.equal(context.descriptionTarget, null);
});

const frames = await loadModule("../src/core/utils/CoverFrame.js", {});
test("framing fills or fits a wide image without distorting its aspect ratio", () => {
    const cover = frames.normalizeFrame(null, "wide.png");
    const fill = frames.frameGeometry(180, 240, 800, 400, cover);
    assert.equal(fill.width, 480);
    assert.equal(fill.height, 240);
    assert.equal(fill.left, -150);
    const fit = frames.frameGeometry(180, 240, 800, 400, {...cover, fit: "contain"});
    assert.equal(fit.width, 180);
    assert.equal(fit.height, 90);
    assert.equal(fit.top, 75);
    const moved = frames.frameGeometry(180, 240, 800, 400, {...cover, x: 0, zoom: 2});
    assert.ok(moved.left === 0);
    assert.equal(moved.width / moved.height, 2);
    assert.equal(frames.frameGeometry(0, 240, 800, 400, cover), null);
});

test("framing clamps corrupt metadata and does not reuse a different image's crop", () => {
    const frame = frames.normalizeFrame({source: "a", zoom: Infinity, x: -30, y: 20, fit: "bad"}, "a");
    assert.deepEqual({...frame}, {source: "a", zoom: 1, x: 0, y: 1, fit: "cover"});
    const changed = frames.normalizeFrame({source: "a", zoom: 4, x: 0}, "b");
    assert.deepEqual({...changed}, {source: "b", zoom: 1, x: .5, y: .5, fit: "cover"});
});

test("saving a frame retains every other metadata field and rolls back a failed write", async () => {
    const config = {coverId: "old", time: 123, last_played: -1, executable: "DDLC", description: "keep", credits: "original"};
    const original = structuredClone(config);
    await frames.updateModCover(config, "new", {source: "new", fit: "contain", zoom: 1.25, x: .1, y: .9}, async () => {});
    assert.deepEqual({...config, coverId: "old", coverFrame: undefined}, {...original, coverFrame: undefined});
    const saved = structuredClone(config);
    await assert.rejects(frames.updateModCover(config, "other", null, async () => { throw new Error("disk full"); }));
    assert.deepEqual(structuredClone(config), saved);
    await assert.rejects(frames.updateModCover(original, "other", null, async () => { throw new Error("disk full"); }));
    assert.equal(Object.hasOwn(original, "coverFrame"), false);
    assert.equal(original.coverId, "old");
});

function launchHarness(failAt) {
    const events = [];
    const config = {time: 123, last_played: -1, coverId: "cover", renpy: "6.99"};
    const start = main.indexOf("        open: async () => {", main.indexOf("let launchPending = false"));
    const end = main.indexOf("\n\tget_time:", start);
    const open = main.slice(start, end).replace(/^\s*open: /, "").replace(/,\s*$/, "");
    const context = vm.createContext({
        launchPending: false, getIsLaunchedFlag: () => false, configData: config, gameExePath: "DDLC", modDirectory: "/fixture/mod", fileTerminator: "/", name: "fixture",
        invoke: async command => { events.push(command); if (command === failAt) throw new Error("simulated launch failure"); },
        showContainers: state => events.push(state ? "ui-restored" : "ui-hidden"),
        flagModLaunched: () => events.push("flag-set"), removeModLaunchedFlag: () => events.push("flag-cleared"),
        mainTicker: async () => {}, Hud: {isVoid: value => value == null, show() {}, hide() {}, ofId: () => ({})},
        preloadCovers: {ofCover: () => ({})}, coverIdToShortMap: new Map(), applyCoverFrame() {}, normalizeFrame() {},
        Logger: {sendEvent: async () => {}, warn() {}}, AssetsManager: {Sound: {play() {}}},
        sendAlertAsync: async message => events.push(message), TranslationUtil: {of: () => "unknown"}
    });
    return {run: () => vm.runInContext(`(${open})()`, context), events, config, context};
}

test("missing Rosetta preflight never starts a game, hides UI, or marks it played", async () => {
    const h = launchHarness("check_launch");
    await h.run();
    assert.equal(h.events.includes("launch"), false);
    assert.equal(h.events.includes("flag-set"), false);
    assert.equal(h.events.includes("ui-hidden"), false);
    assert.equal(h.config.time, 123);
    assert.equal(h.config.last_played, -1);
    assert.equal(h.context.launchPending, false);
});

test("a spawn failure clears playing state and preserves play history", async () => {
    const h = launchHarness("launch");
    await h.run();
    assert.ok(h.events.indexOf("check_launch") < h.events.indexOf("ui-hidden"));
    assert.ok(h.events.includes("flag-cleared") && h.events.includes("ui-restored"));
    assert.ok(h.events.some(event => event.includes("Cannot launch this mod")));
    assert.equal(h.config.last_played, -1);
    assert.equal(h.config.time, 123);
});

test("Home framing separates portrait thumbnail from background and retains legacy position", () => {
    const config = {coverId: "logo.png", bg_offset: 35};
    const result = frames.homeFrames(config, "logo.png");
    assert.equal(result.cover.fit, "contain");
    assert.equal(result.background.fit, "cover");
    assert.equal(result.background.y, .35);
    assert.equal(result.cover.y, .5);
    assert.equal(Object.hasOwn(config, "homeCoverFrame"), false);
    assert.equal(frames.homeFrames(config, "another.png").background.y, .5);
});

test("Home saves independent crops and retains unrelated preferences", async () => {
    const config = {coverId: "old.png", theme: "YURI", extra: {keep: true}, totalTime: 123, bg_offset: 0};
    const crops = frames.homeFrames(config, "new.png");
    crops.background.zoom = 1.8; crops.background.x = .2;
    await frames.updateHomeFrames(config, "new.png", crops, async () => {});
    assert.equal(config.homeCoverFrame.zoom, 1);
    assert.equal(config.homeCoverFrame.fit, "contain");
    assert.equal(config.backgroundFrame.zoom, 1.8);
    assert.equal(config.backgroundFrame.x, .2);
    assert.equal(config.extra.keep, true);
    assert.equal(config.totalTime, 123);
    assert.equal(config.theme, "YURI");
    const reloaded = frames.homeFrames(JSON.parse(JSON.stringify(config)), "new.png");
    assert.equal(reloaded.background.zoom, 1.8);
    assert.equal(reloaded.cover.zoom, 1);
});

test("failed Home saves restore the entire config, including absence of new fields", async () => {
    const config = {coverId: "old.png", theme: "YURI", extra: {keep: true}};
    const before = structuredClone(config);
    await assert.rejects(frames.updateHomeFrames(config, "new.png", frames.homeFrames(config, "new.png"), async () => {
        config.theme = "changed by persist";
        throw new Error("disk full");
    }), /disk full/);
    assert.deepEqual(structuredClone(config), before);
});

async function versionHarness(fetch, timer = setTimeout) {
    return loadModule("../src/core/VersionHandler.js", {
        "./utils/Logger": {default: {warn() {}}},
        "./enum/BRANCHES": {default: {DEV: {PUBLIC: "current_ver_beta.txt"}}}
    }, {fetch, AbortController, setTimeout: timer, clearTimeout});
}

test("update checks retain the author's channel and return its release notes", async () => {
    let requested;
    const handler = await versionHarness(async (url, options) => {
        requested = url; assert.ok(options.signal);
        return {ok: true, text: async () => "1.8.2-beta\nUpstream notes\n"};
    });
    assert.equal(await handler.getLatest({strict: true}), "1.8.2-beta\nUpstream notes");
    assert.equal(requested, "https://raw.githubusercontent.com/BKunzite/DokiModManager/refs/heads/main/current_ver_beta.txt");
    assert.equal(await handler.shouldUpdate(), false);
});

test("offline startup can continue, while an explicit check reports failure", async () => {
    const handler = await versionHarness(async () => {throw new Error("offline");});
    assert.equal(await handler.getLatest(), handler.CLIENT_VERSION);
    await assert.rejects(handler.getLatest({strict: true}), /offline/);
    assert.equal(await handler.shouldUpdate(), false);
});

test("an unresponsive update endpoint is aborted instead of hanging startup", async () => {
    const handler = await versionHarness((url, {signal}) => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true});
    }), callback => setTimeout(callback, 1));
    await assert.rejects(handler.getLatest({strict: true}), /aborted/);
    assert.equal(await handler.getLatest(), handler.CLIENT_VERSION);
});
