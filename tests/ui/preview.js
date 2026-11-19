// Local macOS UI regression fixture, 2026-11-19. All file I/O stays in memory.
import {createApp} from "vue";
import App from "../../src/App.vue";
import Desktop from "../../src/Desktop.vue";
import {CLIENT_VERSION} from "../../src/core/VersionHandler.js";
import {descriptionHtml, updateModDescription} from "../../src/core/utils/ModDescription.js";
import "../../src/styles.css";
import source from "../../src/main.js?raw";
import * as images from "../../src/core/utils/ImageUtils.js";
import {decodeImage, imageMimeType} from "../../src/core/utils/ImageFormat.js";
import {applyCoverFrame, normalizeFrame, updateModCover, homeFrames, updateHomeFrames} from "../../src/core/utils/CoverFrame.js";
import programData from "../../src/core/utils/ConfigDataHelper.js";
import {CoverCropEditor} from "../../src/core/utils/CoverCropEditor.js";
import {importImages} from "../../src/core/utils/ImageImport.js";
import {open} from "@tauri-apps/plugin-dialog";
import Hud from "../../src/core/utils/HTMLHelper.js";
import DOMBatch from "../../src/core/fragment/DOMBatch.js";
import {OptionsPanel} from "../../src/core/interface/uikit/Options.js";
import {TranslationUtil as realTranslation} from "../../src/core/utils/TranslationUtil.js";

const files = new Map();
const messages = [];
let dialogSelection = null;
let selectedCover = null;
const loadedModData = {coverId: 0, executable: "DDLC.app/Contents/MacOS/DDLC", time: 123};
window.__TAURI_INTERNALS__ = {invoke: async (command, args, options) => {
    if (command === "plugin:dialog|open") return dialogSelection;
    if (command === "plugin:fs|mkdir") return;
    if (command === "plugin:fs|read_file") {
        if (!files.has(args.path)) throw new Error("Fixture file not found");
        return Array.from(files.get(args.path));
    }
    if (command === "plugin:fs|write_file") {
        const path = decodeURIComponent(options.headers.path);
        if (!JSON.parse(options.headers.options).createNew) throw new Error("Overwrite forbidden");
        if (files.has(path)) throw new Error("File exists");
        files.set(path, new Uint8Array(args));
        return;
    }
    throw new Error("Unexpected fixture IPC: " + command);
}};

const fixtureApp = createApp(App);
fixtureApp.mount("#app");
document.documentElement.setAttribute("os-type", "linux");
document.documentElement.setAttribute("mac-type", "mac");
Hud.hide("loader");
Hud.show("main");
Hud.ofId("warn").remove();
for (const id of ["cove", "modtitle", "modinfo", "play", "path", "delete-save", "info", "setinfo-header"]) Hud.show(id);
Hud.hide("covers");
Hud.ofId("info").classList.add("expanded");
Hud.ofId("setinfo-header").style.left = "16rem";
Hud.ofId("modtitle").value = "Synthetic Mod With A Long Editable Name";
Hud.ofId("modinfo").textContent = "Synthetic fixture — no installed mods loaded";

programData.init();
realTranslation.setLanguage("en");
const homeConfig = programData.map({coverId: "DefaultCovers/house.webp", totalTime: 123,
    version: CLIENT_VERSION, tutorial: true, language: "en", bg_offset: 35, user_name: "FixtureUser", sound: false, extra: {keep: true}});
homeConfig.save = async () => {
    if (window.fixture?.failHomeSave) throw new Error("simulated Home disk failure");
    files.set("/fixture/client-config.json", new TextEncoder().encode(homeConfig.getJSON()));
};
const env = {
    ...images, Hud, DOMBatch, importImages, applyCoverFrame, normalizeFrame, homeFrames, updateHomeFrames, CoverCropEditor, coverEditor: undefined, open, createApp, Desktop, OptionsPanel,
    PROGRAM_DISCORD: "https://discord.com/invite/synthetic-fixture",
    previous_app: fixtureApp, desktopOpen: false, CLIENT_VERSION,
    CLIENT_START: Date.now() - 5000, descriptionHtml,
    descriptionTarget: null, savingDescription: false,
    getLatest: async () => {
        if (window.fixture?.failUpdateCheck) throw new Error("simulated offline");
        return window.fixture?.updateReply ?? CLIENT_VERSION + "\nFixture release notes";
    },
    shouldUpdate: async () => (window.fixture?.updateReply?.split("\n")[0] ?? CLIENT_VERSION) !== CLIENT_VERSION,
    PROGRAM_NAME: "Doki Doki Mod Manager",
    openUrl: async url => messages.push("URL: " + url),
    invoke: async command => messages.push("IPC: " + command),
    localPath: "/fixture", fileTerminator: "/", currentEntry: "synthetic",
    currentBackgroundCover: "DefaultCovers/house.webp", importingImages: false,
    currentBackgroundOffset: 35, totalPlayTime: 123, isTutorialComplete: true, currentUserName: "FixtureUser",
    programData: homeConfig,
    TranslationUtil: {getLanguage: () => "en", of: () => "Cancel"},
    writeTextFile: async (path, text) => {
        if (window.fixture?.failHomeSave) throw new Error("simulated Home disk failure");
        files.set(path, new TextEncoder().encode(text));
    },
    STRINGS: {EMPTY: "", isEmpty: value => value === ""}, terminatePath: path => path.replaceAll("\\", "/"),
    Optional: {readDir: async directory => ({isSome: () => true, getResult: async () =>
        [...files.keys()].filter(path => path.startsWith(directory + "/"))
            .map(path => ({name: path.slice(directory.length + 1), isDirectory: false}))})},
    Logger: {sendEvent: async () => {}, warn: (...args) => messages.push(args.join(" ")), instant: () =>
        Array.from({length: 30}, (_, i) => ({msg: `Synthetic log ${i} — <not markup> ` + "long text ".repeat(10), timestamp: Date.now() - i * 10, isWarn: i % 5 === 0}))},
    sendAlertAsync: async message => messages.push(message),
    AssetsManager: {Sound: {play() {}}},
    getLauncher: () => ({getFunctions: () => ({
        getData: async () => loadedModData,
        setDescription: async text => updateModDescription(loadedModData, text, async () => {
            if (window.fixture?.failDescriptionSave) throw new Error("simulated description write failure");
            files.set("/fixture/mod/.ddmm.config.json", new TextEncoder().encode(JSON.stringify(loadedModData)));
        }),
        leftClick: async () => { Hud.ofId("info").innerHTML = descriptionHtml(loadedModData.description, "Ren’Py: synthetic<br>Credits: original author"); },
        setCover: async (id, frame) => {
            const source = images.coverIdToShortMap.get(id) ?? id;
            await updateModCover(loadedModData, source, frame, async () => {
                if (window.fixture?.failCoverSave) throw new Error("simulated disk failure");
                files.set("/fixture/mod/.ddmm.config.json", new TextEncoder().encode(JSON.stringify(loadedModData)));
            });
            selectedCover = source;
            applyCoverFrame(Hud.ofId("cove"), images.preloadCovers.ofCover(source), normalizeFrame(frame, source));
        }})}),
    getLaunchers: () => ({synthetic: {getFunctions: () => ({getData: async () => loadedModData})}})
};

const names = ["editCover", "openCoverPicker", "bindCoverControls", "bindHeaderControls", "setCover", "saveConfig", "syncCovers", "updateCoverImages", "selectImageFiles", "addImagesToLibrary", "updateClient", "launchDesktop", "openDescriptionEditor", "closeDescriptionEditor", "saveDescription"];
const functions = names.map(name => {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    return source.slice(start, source.indexOf("\n}", start) + 2);
}).join("\n");
const api = new Function("env", `with (env) { ${functions}; return {${names.join(",")}}; }`)(env);
Hud.onClick("importimage", api.selectImageFiles);
Hud.onClick("description-edit", api.openDescriptionEditor);
Hud.onClick("description-cancel", api.closeDescriptionEditor);
Hud.onClick("description-save", api.saveDescription);
Hud.onClick("image-picker-import", api.selectImageFiles);
api.bindCoverControls();
api.bindHeaderControls();
Hud.onClick("image-picker-cancel", () => {
    Hud.ofId("image-picker-bg").classList.remove("image-picker-visible");
    Hud.hide("profile-blur");
});

await api.syncCovers();
await api.updateCoverImages(true);
window.fixture = {
    files, messages, api, images, decodeImage, imageMimeType, loadedModData, homeConfig, version: CLIENT_VERSION,
    goHome: async () => {
        env.currentEntry = "";
        Hud.show("background-adjust"); Hud.show("covers");
        for (const id of ["info", "setinfo-header", "play", "path", "delete-save"]) Hud.hide(id);
        await api.setCover(env.currentBackgroundCover);
    },
    goMod: async () => {
        env.currentEntry = "synthetic";
        Hud.hide("background-adjust"); Hud.hide("covers");
        for (const id of ["info", "setinfo-header", "play", "path", "delete-save"]) Hud.show(id);
        await api.setCover(loadedModData.coverId);
    },
    reloadHome: async () => {
        homeConfig.setJSON(new TextDecoder().decode(files.get("/fixture/client-config.json")));
        env.currentBackgroundCover = homeConfig.get("coverId");
        await api.setCover(env.currentBackgroundCover);
    },
    select: paths => { dialogSelection = paths; },
    selectedCover: () => selectedCover,
    showPicker: () => {
        Hud.show("profile-blur");
        Hud.ofId("image-picker-bg").classList.add("image-picker-visible");
    }
};
window.fixtureReady = true;
