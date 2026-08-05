//// Vue

import {createApp} from "vue";

//// Tauri
import {invoke} from '@tauri-apps/api/core';
import {listen} from "@tauri-apps/api/event";
import {confirm, open} from '@tauri-apps/plugin-dialog';
import {openUrl} from "@tauri-apps/plugin-opener";
import {
    create,
    mkdir,
    readDir,
    readFile,
    readTextFile,
    remove,
    watch,
    writeFile,
    writeTextFile
} from '@tauri-apps/plugin-fs';
import {isDir, isExist, metadata} from "tauri-plugin-fs-pro-api";

//// Internal Pages
import App from "./App.vue";
import Desktop from "./Desktop.vue";

//// Utils
// ----- INTERNAL ------- //
import {
    deref,
    getImage,
    lazyDeref,
    covers,
    preloadCovers,
    preloadImageObject,
    regexImageName
} from "./core/utils/ImageUtils";
import {CLIENT_VERSION, getLatest, shouldUpdate} from "./core/VersionHandler";
import {TranslationUtil, TRANSLATION_ELEMENT_MAP, TRANSLATION_TABLE} from "./core/utils/TranslationUtil"
import {addLauncher, clearLaunchers, getLauncher, getLaunchers, LauncherAbstract} from "./core/Launchers"
import {openWebview} from "./core/utils/WebviewWindowUtil";
import {htmlEscape, formatModName, getTextWidth, linkify, getFormattedDate, STRINGS} from "./core/utils/TextUtil";
import {
    HEART_FULL,
    HEART_EMPTY,
    CLIENT_THEMES,
    CLIENT_THEME_ENUM,
    WARN_GENERIC_DATA_PATHS,
    CURRENT
} from "./core/Constants";
import {getOSType, OS} from "./core/utils/OSUtil";
import {fileTerminator, supportedModPackage, terminatePath} from "./core/utils/FileSystem";
import OSUtil from "./core/utils/OSUtil";
import Logger from "./core/utils/Logger";
import DownloadsManager from "./core/download/DownloadsManager"
import PreventDefaults from "./core/utils/PreventDefaults";
import Hud from "./core/utils/HTMLHelper";
import Units from "./core/utils/Units";
import SeasonsManager from "./core/seasonal/SeasonsManager";
import {ProgramData} from "./core/utils/ConfigDataHelper";

// ----- EXTERNAL ------- //
import {Base64} from 'js-base64';
import {Fzf} from 'fzf';

//// Internal Assets
import sound_beep from './assets/select.ogg';
import sound_boop from './assets/hover.ogg';
import sound_click from './assets/pageflip.ogg';
import dart_sfx from './assets/dart_sfx.mp3';

//// Profile Data

let selectedProfileButton = null;
let selectedProfileName = STRINGS.EMPTY
let currentProfile = STRINGS.EMPTY
let currentProfileData = {}
let concurrentProfileData = {}
let profilePath = STRINGS.EMPTY;
let originalProfile = STRINGS.EMPTY;
let currentGameDataPath = STRINGS.EMPTY;
let renameProfileTarget = STRINGS.EMPTY;

//// Tutorial

let isTutorialComplete = false;
let tutorialStep = 0;
let tutorialPointer = null

//// Config Variables

let currentBackgroundOffset = 0;
let currentBackgroundMaxOffset = 0;
/**
 * @type {{path: string, config: ProgramData}}
 */
let localConfig = {
    path: STRINGS.EMPTY,
    config: null
}
let currentSavePath = STRINGS.EMPTY;
let currentUserName = STRINGS.EMPTY;

//// Misc

let lastInputLength = 0
let start = Date.now();
let currentEntry = STRINGS.EMPTY
let currentBackgroundCover = 0
let totalPlayTime = 0;
let mouseCoverAvailable = false;
let alertPath = undefined
let selectedPath;
let localPath;
let observer;
let reset = false;
let previous_app = null
let tracked_downloads = []
let observer_await = false;
let dragging = false;
let dragStart = 0;

/**
 * Initialize Translations
 *
 * @param {string} lang - Language to load (ex. "en" - english, "fr" - French)
 * @param {boolean} first - First load attempt?
 */

function loadTranslation(lang, first) {
    if (TRANSLATION_TABLE[lang] === undefined) lang = "en";
    if (TranslationUtil.getLanguage() !== lang) {
        sendEvent('language', {
            name: lang
        }).then(_ => {
        })
    }

    TranslationUtil.setLanguage(lang);

    if (!isTutorialComplete) {
        document.getElementById("tutorial-title").textContent = tutorialStep === 0 ? TranslationUtil.of("tutorial-text") : TranslationUtil.sub("tutorial").of(tutorialStep).title;
        document.getElementById("tutorial-context").textContent = tutorialStep === 0 ? TranslationUtil.of("tutorial-context") : TranslationUtil.sub("tutorial").of(tutorialStep).context;
        if (tutorialPointer == null) {
            if (tutorialStep === 8) {
                document.getElementById("tutorial-no").textContent = TranslationUtil.of("end")
            } else {
                document.getElementById("tutorial").textContent = TranslationUtil.of("next")
                document.getElementById("tutorial-no").textContent = TranslationUtil.of("cancel")
            }
        } else {
            document.getElementById("tutorial").textContent = TranslationUtil.of("yes")
            document.getElementById("tutorial-no").textContent = TranslationUtil.of("no")
        }
    }

    for (let i = 0; i < TRANSLATION_ELEMENT_MAP.length; i++) {
        const element = document.getElementById(TRANSLATION_ELEMENT_MAP[i].id);
        if (element) {
            element[TRANSLATION_ELEMENT_MAP[i]["type"]] = TranslationUtil.of(TRANSLATION_ELEMENT_MAP[i].key);
        }
    }

    getImage("Flags/" + TranslationUtil.sub("data").of("flag")).then(url => {
        document.getElementById("language-flag").src = url
    });
    document.getElementById("language-text").textContent = TranslationUtil.sub("data").of("name");

    if (currentEntry === STRINGS.EMPTY) {
        if (!first) {
            gotoHomePage()
        }
    } else {
        getLauncher(currentEntry).getFunctions().leftClick().then(_ => {
        });
    }
}

/**
 * Syncs covers with images stored.
 * @returns {Promise<void>}
 */

async function syncCovers() {
    const imageLocation = terminatePath("\\store\\images")

    covers.reset().add(
        "DefaultCovers/house.webp",
        "DefaultCovers/wallpapers.png",
        "DefaultCovers/natsuki.jpg",
        "DefaultCovers/yuri.jpg",
        "DefaultCovers/sayori.jpg",
        "DefaultCovers/monika.png"
    )

    preloadCovers.reset()

    for (const cover of covers.asList()) {
        preloadCovers.set(cover, await preloadImageObject(cover))
    }

    if (await isDir(localPath + imageLocation)) {
        for (const image of await readDir(localPath + imageLocation)) {
            if (regexImageName(image.name)) {
                const path = localPath + imageLocation + fileTerminator + image.name;
                covers.add(path)
                preloadCovers.set(path, await preloadImageObject(path))
            }
        }
    }
}

/**
 * Loads local config which includes background cover id
 * and the total amount of time you have played mods
 *
 * Also includes whether it has warned you to
 * save downloads to the user's download folder
 * @param path Path To Config File
 */

async function loadConfig(path) {
    let configPath = path + fileTerminator + "client-config.json";
    let hasConfig = await isExist(configPath)
    let hostname = await invoke("get_host_name", {})
    let configData = await new ProgramData(hostname);

    Logger.log("Local Path: " + path)

    localPath = path;

    // Detects Config

    if (!hasConfig) {
        await create(configPath)
        const contents = configData.getJSON()
        await writeTextFile(configPath, contents);
    } else {
        try {
            configData.setJSON(await readTextFile(configPath))
        } catch (e) {
            console.error("Failed to parse config file: " + e);

            Hud.show("changelog")
            document.getElementById("changelog-title").textContent = "Critical Error | Cannot Load Config"
            document.getElementById("changelog-text").textContent = "File: " + configPath + "\n\n" + e + "\n\nData:\n" + (await readTextFile(configPath)).split("\n").map((line, index) => index + "|  " + line).join("\n")
            document.getElementById("changelog-update").textContent = TranslationUtil.of("update")
            document.getElementById("changelog-ignore").textContent = TranslationUtil.of("end")
            document.getElementById("changelog-ignore").style.right = "calc(2rem + " + document.getElementById("changelog-update").getBoundingClientRect().width + "px)"

            let response = await new Promise(resolve => {
                document.getElementById("changelog-update").addEventListener("mouseup", async () => {
                    resolve(true)
                })
                document.getElementById("changelog-ignore").addEventListener("mouseup", async () => {
                    resolve(false)
                })
            });

            Hud.hide("changelog")

            if (response) {
                await invoke("open_path", {
                    path: configPath
                })
            }

            exitProgram();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    configData
        .default("theme", "NATSUKI")
        .default("coverId", 0)
        .default("totalTime", 0)
        .default("tutorial", false)
        .default("version", "0.0.0-release")
        .default("language", STRINGS.EMPTY)
        .default("bg_offset", 0)
        .default("user_name", hostname)
        .post()

    Logger.log("Cover Id: " + configData.get("coverId"))

    localConfig = {
        path: configPath,
        config: configData
    }

    totalPlayTime = configData.get("totalTime");
    currentBackgroundCover = configData.get("coverId");
    isTutorialComplete = configData.get("tutorial");
    currentBackgroundOffset = configData.get("bg_offset");
    currentUserName = configData.get("user_name");

    TranslationUtil.setLanguage(configData.get("language"));

    if (isTutorialComplete) {
        document.getElementById("warn").remove()
    }
}

/**
 * Removes all cover images, then creates all new cover images with
 * their respective aspect ratio.
 *
 * @param {boolean} first_time Scroll To The Left
 * @returns {Promise<void>}
 */

async function updateCoverImages(first_time = false) {
    await syncCovers()
    const images = document.getElementById("images")

    if (!first_time) {
        for (const child of document.querySelectorAll(".image-picker-cover")) {
            child.remove()
        }
    }

    for (const cover in preloadCovers.asList()) {
        let cover_img = preloadCovers.get(cover)
        let x = 1;
        let y = 1;
        let aspect = cover_img.naturalWidth / cover_img.naturalHeight;

        const div = document.createElement("div");
        const img = cover_img.cloneNode(true);

        div.classList.add("image-picker-cover");
        img.alt = covers.indexOf(cover) + " | " + cover
        img.loading = "lazy";
        img.decoding = "async";

        if (aspect > 1.6) {
            x = 2;
            img.classList.add("image-picker-cover-img");
        } else if (aspect > 1.2) {
            x = 2;
            y = 2;
            img.classList.add("image-picker-cover-img-vertical");
        } else if (aspect < 0.9) {
            y = 2;
            img.classList.add("image-picker-cover-img-vertical");
        } else {
            if (aspect > 1) {
                img.classList.add("image-picker-cover-img-vertical");
            } else {
                img.classList.add("image-picker-cover-img");
            }
        }

        img.addEventListener("mouseup", async (e) => {
            if (currentEntry !== STRINGS.EMPTY && e.button === 0) {
                await getLauncher(currentEntry).getFunctions().setCover(covers.indexOf(cover));
            } else if (e.button === 0) {
                currentBackgroundCover = covers.indexOf(cover)
                await setCover(currentBackgroundCover)
            }
            play(sound_beep)
            Hud.hide("profile-blur")
            document.getElementById("image-picker-bg").classList.remove("image-picker-visible");
        })

        div.classList.add("image-" + x + "x" + y);
        div.appendChild(img);
        document.getElementById("image-picker-bg").appendChild(div);
    }

    if (!first_time) {
        for (const cover of document.querySelectorAll(".covers-cover")) {
            cover.remove()
        }
    }

    for (let i = covers.length() - 1; i >= 0; i--) {
        const cover_bg = document.createElement("div");
        const cover_img = preloadCovers.ofCover(i).cloneNode(true);
        const cover_text = document.createElement("button");

        cover_img.classList.add("covers-image");

        cover_bg.classList.add("covers-cover");

        cover_text.classList.add("covers-text");
        cover_text.innerHTML = "&#60450;"

        cover_img.addEventListener("mouseup", () => {
            currentBackgroundCover = i;
            setCover(currentBackgroundCover)
        })

        if (i > 5) {
            cover_text.addEventListener("mouseup", () => {
                remove(covers.get(i));
                covers.splice(i, 1);
                setTimeout(async () => {
                    let scroll = images.scrollLeft;
                    await updateCoverImages()
                    await setCover(currentBackgroundCover);
                    images.scrollTo({
                        left: scroll
                    })
                }, 100)
            })
            cover_bg.appendChild(cover_text);
        }

        cover_bg.appendChild(cover_img);
        images.appendChild(cover_bg);
    }

    if (first_time) {
        images.scrollTo(-images.scrollWidth, 0)
    }
}

/**
 * Saves Current Config (./client-config.json)
 * @returns {Promise<void>}
 */

async function saveConfig() {
    await writeTextFile(localConfig.path,
        localConfig.config.map({
            coverId: currentBackgroundCover,
            totalTime: totalPlayTime,
            version: CLIENT_VERSION,
            tutorial: isTutorialComplete,
            language: TranslationUtil.getLanguage(),
            bg_offset: currentBackgroundOffset,
            user_name: currentUserName
        }).getJSON()
    )
}

// Plays interaction sounds

function play(song) {
    let beep = new Audio(song)
    beep.volume = 0.5;

    beep.play().then(() => {
    })
}

/**
 * Imports A Mod Async
 * @param {String} [path] Location Of The Mod
 * @returns {Promise<void>}
 */

async function importMod(path) {
    let selectedPath = path
    if (selectedPath === undefined) {
        selectedPath = await open({
            directory: false,
            multiple: false,
            filters: [{
                name: 'Zip',
                extensions: ['zip', 'rar']
            }],
            title: 'Select Your Mod\'s Zip File'
        });
        await sendEvent("manual_download", {
            name: selectedPath.split(fileTerminator).pop()
        })
        DownloadsManager.startDownload(selectedPath, selectedPath)
        Hud.show("downloads-list")
    }
    if (selectedPath != null) {
        if (supportedModPackage(selectedPath)) {
            await invoke("import_mod", {
                path: selectedPath
            })
        } else {
            Hud.hide("loader")
            Hud.show("main")
            alertPath = undefined;
            showContainers(true)
            Hud.hide("alert")

            await confirm("Unsupported Format! {Supported: .zip, .rar, .rpa}")
        }
    }
}

/**
 * Sets The Current Cover/Background
 * @param id Index of the cover
 * @returns {Promise<void>}
 */

async function setCover(id) {
    if (id > covers.length() - 1) {
        id = 0;
    }
    let image = preloadCovers.ofCover(id).src;
    if (image === undefined) {
        image = await getImage(id)
    }

    document.getElementById("cove").style.backgroundImage = 'url("' + image + '")';

    if (currentEntry === STRINGS.EMPTY) {
        document.getElementById("bg").style.backgroundImage = 'url("' + image + '")';
        const img = new Image();
        img.src = image;

        img.onload = () => {
            currentBackgroundMaxOffset = img.naturalHeight * (1200 / img.naturalWidth);
            document.getElementById("bg").style.height = (currentBackgroundMaxOffset) + "px";
            document.getElementById("bg").style.backgroundPositionY = ((600 - currentBackgroundMaxOffset) * (currentBackgroundOffset / 100)) + "px";
            img.remove()
        };
        await saveConfig()
    }
}

/**
 * Sets current theme
 * @param {string} name ENUM for current theme
 * @param {boolean} first First Time Setting Theme?
 * @returns {Promise<void>}
 */

async function setTheme(name, first) {
    if (!(name in CLIENT_THEMES)) {
        name = "NATSUKI";
    }

    document.getElementById("chibi").src = await getImage(CLIENT_THEMES[name].image);
    document.body.style.setProperty("--primary-color", CLIENT_THEMES[name].primary_color)
    document.body.style.setProperty("--primary-color-saturated", CLIENT_THEMES[name].primary_color_saturated)

    localConfig.config.set("theme", name)
    if (!first) {
        await saveConfig()
    }
}

/**
 * Exits and Closes the mod manager
 */

function exitProgram() {
    Hud.show("loader")
    Hud.hide("main")
    document.getElementById("loadinghead").textContent = "Closing..."
    document.getElementById("loadingsub").textContent = "Saving Data..."
    Hud.setLoadingBar(0, false)
    Hud.setLoadingBar(100, true)

    setTimeout(async () => {
        await invoke("close");
    }, 1000)
}

/**
 * Creates A Screenshot Div With
 * Lazy Image Loading and
 * Viewable
 *
 * @param {string} src Image Source/URL
 * @param {string} entryName Launcher Name
 * @param {string} dir Directory Of Image
 * @param {string} image Image Name
 * @param {string} entry Launcher Name 2
 * @param {boolean} preload Is This A Preload Image?
 * @returns {HTMLDivElement} Created Div
 */

function createScreenshotDiv(src, entryName, dir, image, entry, preload) {
    const newScreenshot = document.createElement("img")
    const cover_text = document.createElement("button");
    const path_text = document.createElement("button");

    const cover_bg = document.createElement("div");
    newScreenshot.decoding = "async"

    if (!preload) {
        newScreenshot.loading = "lazy"
    } else {
        newScreenshot.onload = () => {
            lazyDeref(src)
        }
    }

    newScreenshot.classList.add("screenshots-image")
    newScreenshot.src = src;

    newScreenshot.addEventListener("mouseup", async () => {
        document.getElementById("view-image").src = await getImage(dir + fileTerminator + image);
        document.getElementById("view-image").classList.add("zoom")
        Hud.show("view-background")
    })

    cover_text.addEventListener("click", async () => {
        await remove(dir + fileTerminator + image);
        await getLauncher(entryName).getFunctions().leftClick();

        if (getLauncher(entry).getFunctions().preload[image]) {
            await getLauncher(entry).getFunctions().preloadImages()
        }
    })

    path_text.addEventListener("click", async () => {
        await getLauncher(entryName).getFunctions().path();
    })

    path_text.classList.add("screenshots-path");
    path_text.innerHTML = "&#60792;"
    cover_text.classList.add("screenshots-text");
    cover_text.innerHTML = "&#60450;"
    cover_bg.appendChild(path_text)
    cover_bg.appendChild(cover_text);
    cover_bg.appendChild(newScreenshot);
    cover_bg.classList.add("screenshots-cover");
    return cover_bg
}

/**
 * Set Install Location Directory
 * OR Loads Mods
 *
 * @param {string} directoryPath Location Of Mods To Load
 * @returns {Promise<void>}
 */

async function requestDirectory(directoryPath = undefined) {
    let chosenPath = undefined;
    if (directoryPath === undefined || !await isExist(directoryPath)) {
        while (Hud.isVoid(chosenPath) || !await isDir(chosenPath)) {
            chosenPath = await open({
                directory: true,
                multiple: false,
                title: 'Select Your DDLC Directory'
            });
        }
        selectedPath = chosenPath;
        await invoke("path_select", {
            path: selectedPath
        })
    } else {
        selectedPath = directoryPath;
    }
    if (chosenPath !== undefined || selectedPath !== undefined) {
        if (chosenPath !== undefined) {
            selectedPath = chosenPath;
        }

        for (const element in getLaunchers()) {
            getLauncher(element).getFunctions().item.remove();
        }

        clearLaunchers()
        const files = await readDir(selectedPath);

        document.getElementById("search").value = STRINGS.EMPTY
        Hud.show("loader")
        Hud.hide("main")
        document.getElementById("nummods").textContent = files.length.toString();

        // Update Mods List

        let finished_mods = 0;
        let mods_to_complete = 0;
        let finished = []

        for (const entry of files) {
            if (entry.isDirectory) {
                mods_to_complete++;
                addMod(entry.name)
                    .then(() => {
                        finished.push(entry.name)
                        finished_mods++;
                    })
                    .catch(err => {
                        finished_mods++;
                        Logger.warn("Failed To Add Mod: " + entry.name + "\n" + err)
                    })
            }
        }

        let interval = setInterval(async () => {
            if (finished_mods === mods_to_complete) {
                Hud.setLoadingBar(100)
                clearInterval(interval)
                Logger.log("Finished Loading DDMM - Enjoy!")
                document.getElementById("loadingsub").textContent = "Loaded Mods | Loading GUI"

                setTimeout(() => {
                    play(sound_click)
                    Hud.hide("loader")
                    Hud.show("main")
                }, 500)
            } else {
                Hud.setLoadingBar((finished_mods / mods_to_complete) * 100)
                document.getElementById("loadingsub").textContent = "Loaded " + finished_mods + "/" + mods_to_complete + " Mods -> " + finished.join(" | ")
                finished = []

            }
        }, 100)

        return new Promise(async (resolve) => {
            setInterval(async () => {
                if (finished_mods === mods_to_complete) {
                    resolve()
                }
            }, 100)
        })

    }

}

/**
 * Add Mods to List
 * @param {string} name Name Of Mod To Add
 * @returns {Promise<void>}
 */

async function addMod(name) {
    if (!await isExist(selectedPath + fileTerminator + name)) {
        Logger.warn("Mod " + name + " Does Not Exist! (path: " + selectedPath + fileTerminator + name + ")")
        return
    }

    // Find Correct Directory

    let dir = selectedPath + fileTerminator + name;
    let isInDir = false;
    const localFiles = await readDir(dir);

    for (const localEntry of localFiles) {
        if (localEntry.name === OS.EXECUTABLE.WINDOWS || localEntry.name === "renpy") {
            isInDir = true;
            break;
        }
    }

    if (!isInDir) {
        dir = selectedPath + fileTerminator + name + fileTerminator + "DDLC-1.1.1-pc"
        if (await isDir(dir)) {
            for (const localEntry of await readDir(dir)) {
                if (localEntry.name === OS.EXECUTABLE.WINDOWS || localEntry.name === "renpy") {
                    isInDir = true;
                    break;
                }
            }
        }
    }

    if (!isInDir) {
        Logger.warn(dir + " Does Not Contain DDLC.exe")
        return;
    }

    // Create SideButton And Load Config

    let hasConfig = false;
    let configPath = selectedPath + fileTerminator + name + fileTerminator + ".ddmm.config.json";
    let configData = {
        author: TranslationUtil.of("unknown"),
        time: 0,
        size: 0,
        favorite: false,
        coverId: 0,
        renpy: undefined,
        executable: undefined,
        credits: undefined,
        pinned: false,
        last_played: -1
    }

    let gameExePath;
    let modCredits;
    let escapedModCredits;
    let saveModData = async () => {
        const contents = JSON.stringify(configData, null, "\t");
        await writeTextFile(configPath, contents);
    };

    let searchGame = async () => {
        gameExePath = undefined;
        for (const localEntry of await readDir(dir)) {
            if (getOSType() === OS.TYPE.WINDOWS) {
                if (localEntry.name.endsWith(".exe") && !localEntry.name.endsWith("-32.exe") && localEntry.name !== OS.EXECUTABLE.WINDOWS && gameExePath === undefined) {
                    gameExePath = localEntry.name;
                }
            } else if (getOSType() === OS.TYPE.LINUX) {
                if (localEntry.name.endsWith(".sh") && !localEntry.name.endsWith("-32.sh") && localEntry.name !== OS.EXECUTABLE.LINUX && localEntry.name !== OS.EXECUTABLE.LINUX_OTHER && gameExePath === undefined) {
                    gameExePath = localEntry.name;
                }
            }

            if (localEntry.name.toLowerCase().includes("credit") && modCredits === undefined) {
                modCredits = await readTextFile(dir + fileTerminator + localEntry.name);
            }
        }

        if (gameExePath === undefined) {
            if (getOSType() === OS.TYPE.WINDOWS) {
                gameExePath = OS.EXECUTABLE.WINDOWS;
            } else if (getOSType() === OS.TYPE.LINUX) {
                gameExePath = await isExist(dir + fileTerminator + OS.EXECUTABLE.LINUX_OTHER) ? OS.EXECUTABLE.LINUX_OTHER : OS.EXECUTABLE.LINUX
            }

            console.warn(
                "No executable found in " + dir + "\n" +
                "Attempting to use " + gameExePath + " as executable"
            )

            if (!await isExist(dir + fileTerminator + gameExePath)) {
                Logger.warn("No functional executable found in " + dir)
                throw new Error("No executable found!\nPath: " + dir + "\nExecutable: " + gameExePath + "\nFiles: " + localFiles.map(v => v.name).join(", "))
            }
        }

        configData.executable = gameExePath;
        configData.credits = modCredits;

        if (modCredits !== undefined) {
            escapedModCredits = htmlEscape(modCredits).replaceAll("\n", "<br>")
        }
        await saveModData();
    }

    for (const localEntry of localFiles) {
        if (localEntry.name === ".ddmm.config.json") {
            hasConfig = true;
            break;
        }
    }

    if (hasConfig) {
        let contents = await readTextFile(configPath);
        try {
            let c = JSON.parse(contents);
            for (const key in c) {
                configData[key] = c[key];
            }
        } catch (e) {
            Logger.warn("Failed To Parse Config File For Mod: " + configPath)
            hasConfig = false;
        }
    }

    if (!hasConfig) {
        await create(configPath)
        const data = await metadata(selectedPath + fileTerminator + name);
        configData.size = data.size;
        await saveModData();
    }

    if (configData.executable === undefined || configData.credits === undefined || configData.executable.length === 0 || !await isExist(dir + fileTerminator + configData.executable)) {
        await searchGame();
    } else {
        gameExePath = configData.executable;
        escapedModCredits = configData.credits !== undefined ? htmlEscape(configData.credits).replaceAll("\n", "<br>") : undefined;
    }

    if (Hud.isVoid(configData.coverId)) {
        configData.coverId = 0;
    }

    let shorthand = formatModName(name)
    const char_code = shorthand.toLowerCase().charCodeAt(0) <= 122 ? shorthand.toLowerCase().charCodeAt(0) : 0
    const sidetext = document.createElement("header");
    const normalText = "<span style=\"font-family: Icon,serif\">&#60810;</span><span style='padding-left: 1vw'></span>" + "<span class='sidebutton-text'>" + shorthand + "</span>";
    const favoriteText = "<span style=\"font-family: Icon,serif\">&#60938;</span><span style='padding-left: 1vw'></span>" + "<span class='sidebutton-text'>" + shorthand + "</span>";
    const pinnedText = "<span style=\"font-family: Icon,serif\">&#61496;</span><span style='padding-left: 1vw'></span>" + "<span class='sidebutton-text'>" + shorthand + "</span>";

    let launch_time = Date.now();
    sidetext.classList.add("sidebutton");
    sidetext.id = shorthand;
    sidetext.style.order = char_code

    if (configData.favorite) {
        sidetext.style.order = char_code - 122
        sidetext.classList.add("favorite")
    } else {
        sidetext.classList.remove("favorite")
    }

    if (configData.pinned) {
        sidetext.classList.add("pinned")
        sidetext.style.order = char_code - 244
    } else {
        sidetext.classList.remove("pinned")
    }

    if (configData.pinned) {
        sidetext.innerHTML = pinnedText
    } else if (configData.favorite) {
        sidetext.innerHTML = favoriteText
    } else {
        sidetext.innerHTML = normalText
    }

    observer.observe(sidetext);
    const launcher = new LauncherAbstract({
        item: sidetext,
        location: selectedPath + fileTerminator + name,
        absolute_location: dir,
        preload: {},
        isFavorite: configData.favorite,
        nameId: name.toLowerCase(),
        getOrder: () => configData.pinned ? char_code - 244 : (configData.favorite ? char_code - 122 : char_code),
        preloadImages: async () => {
            let images = 0;
            getLauncher(name).getFunctions().preload = {}

            for (const localEntry of await readDir(dir)) {
                if (localEntry.name.includes("screenshot")) {
                    getLauncher(name).getFunctions().preload[localEntry.name] = await createScreenshotDiv(await getImage(dir + fileTerminator + localEntry.name), name, dir, localEntry.name, name, true);
                    getLauncher(name).getFunctions().preload[localEntry.name].classList.add("preload-image")
                    images++

                    if (images >= 2) {
                        break
                    }
                }
            }
        },
        getData: async () => {
            return configData
        },
        setAuthor: async (author) => {
            configData.author = author;
            await saveModData();
        },
        getPath: async () => {
            return selectedPath
        },
        getName: async () => {
            return name
        },
        resetOrder: () => {
            sidetext.style.order = getLauncher(name).getFunctions().getOrder()
        },
        setPinned: async (pinnedState) => {
            if (pinnedState === undefined) {
                if (Hud.isVoid(configData.pinned)) {
                    pinnedState = false
                } else {
                    pinnedState = !configData.pinned;
                }
            }

            configData.pinned = pinnedState;
            if (configData.pinned) {
                sidetext.innerHTML = pinnedText
            } else if (configData.favorite) {
                sidetext.innerHTML = favoriteText
            } else {
                sidetext.innerHTML = normalText
            }

            getLauncher(name).getFunctions().resetOrder()
            Hud.setPinned(configData.pinned)

            if (configData.pinned) {
                play(dart_sfx)
            }

            if (configData.pinned) {
                sidetext.classList.add("pinned")
            } else {
                sidetext.classList.remove("pinned")
            }

            await saveModData();
        },
        open: async () => {
            await sendEvent("game_launch", {
                mod: name
            })
            showContainers(false)
            await keepaliveTicker()
            Hud.show("pill")
            Hud.show("pill-files")
            Hud.show("pill-contains")
            if (!Hud.isVoid(covers.get(configData.coverId),  preloadCovers.ofCover(configData.coverId))) {
                document.getElementById("pill-profile").style.backgroundImage = 'url("' + preloadCovers.ofCover(configData.coverId).src + '")';
            } else {
                document.getElementById("pill-profile").style.backgroundImage = 'url("' + preloadCovers.ofCover(0).src + '")';
            }
            setTimeout(async () => {
                play(sound_beep)
                launch_time = Date.now();
                if (Hud.isVoid(configData.renpy)) {
                    configData.renpy = await getRenpy(dir);
                    await saveModData();
                }

                if (Hud.isVoid(gameExePath) || (getOSType() === OS.TYPE.LINUX && !gameExePath.endsWith(".sh")) || (getOSType() === OS.TYPE.WINDOWS && !gameExePath.endsWith(".exe"))) {
                    await searchGame()
                }

                await invoke("launch", {
                    path: dir + fileTerminator + gameExePath,
                    id: name,
                    renpy: configData.renpy || TranslationUtil.of("unknown")
                })
            }, 1000)


        },
        get_time: async () => {
            return Date.now() - launch_time;
        },
        path: async () => {
            await invoke("open_path", {
                path: dir
            })
        },
        setCover: async (coverId) => {
            configData.coverId = coverId;
            await saveModData();
            await setCover(configData.coverId);
        },
        onFavorite: async () => {
            configData.favorite = !configData.favorite;
            sidetext.classList.toggle("favorite", configData.favorite)
            if (configData.pinned) {
                sidetext.innerHTML = pinnedText
            } else if (configData.favorite) {
                sidetext.innerHTML = favoriteText
            } else {
                sidetext.innerHTML = normalText
            }
            getLauncher(name).getFunctions().isFavorite = configData.favorite;
            getLauncher(name).getFunctions().resetOrder()
            await saveModData();
            document.getElementById("covertext").innerHTML = configData.favorite ? HEART_FULL : HEART_EMPTY;
        },
        close: async () => {
            const playTime = Date.now() - launch_time;
            const data = await metadata(selectedPath + fileTerminator + name);

            if (alertPath === undefined) {
                showContainers(true)
            }

            play(sound_click)

            await sendEvent("game_close", {
                mod: name,
                length: Math.floor(playTime / 3600000) + TranslationUtil.of("h") + STRINGS.SPACE + (Math.floor(playTime / 60000) % 60) + TranslationUtil.of("m") + STRINGS.SPACE + (Math.floor(playTime / 1000) % 60) + "s"
            })

            totalPlayTime += playTime;
            configData.time += playTime;
            configData.size = data.size;
            configData.last_played = Date.now();

            Hud.hide("pill")
            Hud.hide("pill-files")
            Hud.hide("pill-contains")

            await saveModData();
            await saveConfig()
            await getLauncher(name).getFunctions().leftClick();
        },
        leftClick: async () => {
            let taskPromise;
            let taskFiles;
            taskPromise = readDir(dir).then((v) => {
                taskFiles = v
                return v
            }).finally(() => {
                taskPromise = null;
            })

            currentEntry = name;
            await setCover(configData.coverId);
            Hud.setPinned(configData.pinned);

            if (Hud.isVoid(gameExePath) || (getOSType() === OS.TYPE.LINUX && !gameExePath.endsWith(".sh")) || (getOSType() === OS.TYPE.WINDOWS && !gameExePath.endsWith(".exe"))) {
                await searchGame()
            }

            if (Hud.isVoid(configData.renpy)) {
                configData.renpy = await getRenpy(dir);
                await saveModData();
            }

            let renpy = configData.renpy || (TranslationUtil.of("unknown") + " (Try Reinstalling; If its still broken, please create a git issue on this)");
            let screenshots = false;
            let images = []
            let lastPlayed = TranslationUtil.of("never");

            const children = Array.from(document.getElementById("screenshots").children);
            const escaped_renpy = htmlEscape(renpy);
            const min = Math.floor(configData.time / 60000);
            const msSinceLastPlayed = Date.now() - configData.last_played;
            const pin_holder = document.getElementById("pin-holder");

            if (!STRINGS.isEmpty(pin_holder.style.top)) {
                pin_holder.style.removeProperty("left")
                pin_holder.style.removeProperty("top")
            }

            for (const child of children) {
                if (!child.classList.contains("preload-image")) {
                    lazyDeref(child.getElementsByClassName("screenshots-image")[0].src);
                    child.getElementsByClassName("screenshots-image")[0].src = STRINGS.EMPTY
                }
                child.remove()
            }

            if (taskPromise !== null) {
                await taskPromise;
            }

            for (const localEntry of taskFiles) {
                if (localEntry.name.startsWith("screenshot")) {
                    screenshots = true;

                    if (getLauncher(name).getFunctions().preload[localEntry.name] !== undefined) {
                        document.getElementById("screenshots").appendChild(getLauncher(name).getFunctions().preload[localEntry.name]);
                        continue;
                    }
                    images.push(
                        localEntry.name
                    )
                }
            }

            renpy = name + "<br>Renpy: " + escaped_renpy + "<br>Custom Exe: " + ((gameExePath !== undefined && !STRINGS.isEmpty(gameExePath) && !gameExePath.toString().endsWith(OS.EXECUTABLE.WINDOWS) && !gameExePath.toString().endsWith(OS.EXECUTABLE.LINUX) && !gameExePath.toString().endsWith(OS.EXECUTABLE.LINUX_OTHER)) ? "Yes | " + gameExePath : "No") + "<br><br>Credits: <br>" + (escapedModCredits !== undefined ? escapedModCredits : "None Found!");
            document.getElementById("covertext").innerHTML = configData.favorite ? HEART_FULL : HEART_EMPTY;

            new Promise(() => {
                play(sound_boop)
            }).then(() => {
            })

            if (configData.last_played !== -1) {
                let date = new Date(configData.last_played).toLocaleString();
                if (msSinceLastPlayed < Units.MillisMap.MINUTE) {
                    lastPlayed = TranslationUtil.of("just-now");
                } else if (msSinceLastPlayed < Units.MillisMap.DAY) {
                    const is_prefix = TranslationUtil.getLanguage() === "es" || TranslationUtil.getLanguage() === "fr";
                    lastPlayed = (is_prefix ? TranslationUtil.of("ago") + STRINGS.SPACE : STRINGS.EMPTY) + (msSinceLastPlayed >= Units.MillisMap.HOUR ? Math.floor(msSinceLastPlayed / Units.MillisMap.HOUR) + TranslationUtil.of("h") + STRINGS.SPACE : STRINGS.EMPTY) + (Math.floor(msSinceLastPlayed / Units.MillisMap.MINUTE) % 60) + TranslationUtil.of("m") + STRINGS.SPACE + (!is_prefix ? TranslationUtil.of("ago") : STRINGS.EMPTY);
                } else if (msSinceLastPlayed < Units.MillisMap.DAY * 2) {
                    lastPlayed = TranslationUtil.of("yesterday");
                } else if (msSinceLastPlayed) {
                    lastPlayed = date
                }
            }

            if (configData.size === 0) {
                updateDisplayInfo(name, configData.author, "Reading...", Math.floor(min / 60) + TranslationUtil.of("h") + STRINGS.SPACE + Math.floor(min % 60) + TranslationUtil.of("m"), renpy, "Never")
                setTimeout(async () => {
                    let data = await metadata(selectedPath + fileTerminator + name);
                    configData.size = data.size;
                    if (currentEntry === name) {
                        updateDisplayInfo(name, configData.author, (configData.size / Units.ByteSizeMap.MB) > 1000 ? (Math.floor(configData.size / Units.ByteSizeMap.GB) + " GB") : (Math.floor(configData.size / Units.ByteSizeMap.MB) + " MB"), Math.floor(min / 60) + TranslationUtil.of("h") + STRINGS.SPACE + Math.floor(min % 60) + TranslationUtil.of("m"), name + "<br>Renpy: " + escaped_renpy + "<br>Custom Exe: " + ((gameExePath !== undefined && gameExePath !== STRINGS.EMPTY && !gameExePath.toString().endsWith(OS.EXECUTABLE.WINDOWS)) ? "Yes | " + gameExePath : "No") + "<br><br>Credits: <br>" + (escapedModCredits !== undefined ? escapedModCredits : "None Found!"), lastPlayed)
                    }
                    data = null
                }, 0)
            } else {
                updateDisplayInfo(name, configData.author, (configData.size / Units.ByteSizeMap.MB) > 1000 ? (Math.round(configData.size / Units.ByteSizeMap.GB) + " GB") : (Math.floor(configData.size / Units.ByteSizeMap.MB) + " MB"), Math.floor(min / 60) + TranslationUtil.of("h") + STRINGS.SPACE + Math.floor(min % 60) + TranslationUtil.of("m"), renpy, lastPlayed)
            }

            if (!screenshots) {
                Hud.hide("screenshots-header")
                Hud.hide("screenshots-parent")
                document.getElementById("info").classList.remove("info")
                document.getElementById("info").classList.add("expanded")
                document.getElementById("setinfo-header").style.left = "16rem";
            } else {
                document.getElementById("screenshots").scrollLeft = 0;
                document.getElementById("screenshots").onscroll = async () => {
                    document.getElementById("screenshots").onscroll = null

                    for (const image_url of images) {
                        let imageS = createScreenshotDiv(await getImage(dir + fileTerminator + image_url, true), name, dir, image_url, name, false)
                        document.getElementById("screenshots").appendChild(
                            imageS
                        );
                        imageS.getElementsByClassName("screenshots-image")[0].decode().then(() => {
                            lazyDeref(imageS.getElementsByClassName("screenshots-image")[0].src);
                            caches.delete(imageS.getElementsByClassName("screenshots-image")[0].src);
                        }).catch(err => {
                            Logger.warn("Failed To Load Image: " + dir + fileTerminator + image_url + " Error: " + err)
                        })
                    }
                }

                Hud.show("screenshots-header")
                Hud.show("screenshots-parent")
                document.getElementById("info").classList.remove("expanded")
                document.getElementById("info").classList.add("info")
                document.getElementById("setinfo-header").style.left = "30rem";
            }

            renpy = null
        }
    })

    addLauncher(name, launcher)
    await launcher.getFunctions().preloadImages();

    sidetext.addEventListener("click", async () => {
        if (currentEntry === name) return;
        await launcher.getFunctions().leftClick();
    })

    document.getElementById("modlist").appendChild(sidetext)
}

/**
 * Gets Ren'Py Version
 *
 * Different Cases
 *
 * \_\_init__.py -> version_tuple = VersionTuple(x, y, z)
 *
 * \_\_init__.py -> version_tuple = (x, y, z, vc_version)
 *
 * vc_version.py -> version_tuple = u'x.y.z'
 *
 * @example ```javascript
 * let renpy_version_string = await getRenpy("C:\\Path\\To\\The\\Mod");
 *
 * Logger.log(renpy_version_string) // 8.0.3
 * ```
 *
 * @param {string} dir Directory Of Ren'Py Mod
 * @returns {Promise<string>}
 */

async function getRenpy(dir) {
    let renpy = undefined;
    const dirFiles = await readDir(dir + fileTerminator + "renpy");
    for (const localEntry of dirFiles) {
        switch (localEntry.name) {
            case "__init__.py": {
                const code = await readTextFile(dir + fileTerminator + "renpy" + fileTerminator + localEntry.name);
                const lines = code.split("\n");
                for (const line of lines) {
                    if (line.startsWith("version_tuple = ") && !line.includes("*")) {
                        renpy = line.replace("version_tuple = (", STRINGS.EMPTY).replace(", vc_version)", STRINGS.EMPTY).replaceAll(", ", ".");
                        break;
                    } else if (line.trim().startsWith("version_tuple = ") && line.trim().includes("(8") && !line.includes("*")) {
                        renpy = line.trim().replace("version_tuple = ", STRINGS.EMPTY).replace("VersionTuple", STRINGS.EMPTY).replace("(", STRINGS.EMPTY).replace(", vc_version)", STRINGS.EMPTY).replaceAll(", ", ".");
                        break;
                    }
                }
                break;
            }
            case "vc_version.py": {
                const code = await readTextFile(dir + fileTerminator + "renpy" + fileTerminator + localEntry.name);
                const lines = code.split("\n");
                for (const line of lines) {
                    if (line.startsWith("version = ")) {
                        renpy = line.replace("version = ", STRINGS.EMPTY).replaceAll("'", STRINGS.EMPTY).replace("u", STRINGS.EMPTY);
                        break;
                    }
                }
                break;
            }
        }
        if (renpy !== undefined) break;
    }
    return renpy
}

/**
 * Hide/Show Container (Main UI)
 * @param {boolean} show Should Show Containers
 */

function showContainers(show) {
    if (show) {
        if (tutorialPointer != null) {
            Hud.show("warn")
            Hud.show("tutorial_pointer")
            document.getElementById("tutorial").dispatchEvent(new MouseEvent("mouseup", {}))
        }
        Hud.show("modlist")
        Hud.show("container-boarder")
        Hud.show("container-shadow")
        Hud.show("search")
        Hud.show("container")
    } else {
        if (tutorialPointer != null) {
            Hud.hide("warn")
            Hud.hideElement(tutorialPointer)
        }

        if (!Hud.isHidden("pill")) {
            Hud.hide("pill")
            Hud.hide("pill-files")
            Hud.hide("pill-contains")
        }

        Hud.hide("modlist")
        Hud.hide("container-boarder")
        Hud.hide("container-shadow")
        Hud.hide("search")
        Hud.hide("container")
    }
}

/**
 * Updates Current UI Displayed Info
 * @example ```javascript
 * let mod_name = "Hello World";
 * let author = "BKunzite";
 * let storage_size = "100 MB";
 * let time_played = "0h 100m";
 * let description = mod_name + "<br>Ren'Py 8.1";
 *
 * updateDisplayInfo(mod_name, author, storage_size, time_played, description);
 * ```
 * @param {string} mod Mod Name
 * @param {string} author Author Name
 * @param {string} space Storage Space Taken
 * @param {string} time Time Played
 * @param {string} renpy Ren'PY Version/Description
 * @param {string} lastTime Last Time Played
 * @returns {void}
 */

function updateDisplayInfo(mod, author, space, time, renpy, lastTime) {
    Hud.show("pin-holder")
    document.getElementById("modtitle").value = formatModName(mod)
    Hud.show("modtitle");
    Hud.show("modinfo");
    Hud.show("cove");
    document.getElementById("language-list").classList.add("language-list-hide");
    Hud.hide("downloads-list")

    if (author.length > 0) {
        currentEntry = mod;
        Hud.hide("covers");
        Hud.show("setinfo-header");
        Hud.show("info");
        if (renpy !== undefined) {
            document.getElementById("info").innerHTML = renpy;
        } else {
            document.getElementById("info").textContent = "No Information Found!";
        }
        Hud.show("delete");
        Hud.show("reset-save");
        Hud.show("path");
        Hud.show("extract");
        Hud.show("delete-save");
        Hud.show("play");
        Hud.hide("optionsmenu");
        Hud.hide("cover-up");
        Hud.hide("cover-down");
        document.getElementById("modinfo").innerHTML = "<span style=\"font-family: Icon,serif;\">&#62038;</span><input class='author-header' autocomplete='off' spellcheck='false' id='authinput' placeholder='" + author + "'><span style=\"font-family: Icon; padding-left: 20px;\">&#60755;</span> " + space + " <span style=\"font-family: Icon; padding-left: 20px;\">&#61966;</span> " + time + " <span style=\"font-family: Icon; padding-left: 20px;\">&#61974;</span> " + lastTime;
        document.getElementById("authinput").style.width = Math.min(getTextWidth(author, "normal 1rem Aller"), 150) + "px"
        if (space !== "Reading...") {
            document.getElementById("authinput").addEventListener("input", async (e) => {
                document.getElementById("authinput").style.width = Math.min(getTextWidth(e.target.value, "normal 1rem Aller"), 150) + "px"
            })
            document.getElementById("authinput").addEventListener("focusout", async () => {
                await setAuthor();
            })
            document.getElementById("authinput").addEventListener("keydown", async (e) => {
                if (e.key === "Enter") {
                    document.getElementById("authinput").blur();
                }
            })
        } else {
            document.getElementById("authinput").readOnly = true;
        }
    } else {
        currentEntry = STRINGS.EMPTY
        setCover(currentBackgroundCover).then(() => {
        })
        let min = Math.floor(totalPlayTime / 60000);
        Hud.hide("screenshots-header");
        Hud.hide("screenshots-parent");
        Hud.show("covers");
        Hud.hide("setinfo-header");
        Hud.hide("info");
        Hud.hide("delete");
        Hud.hide("reset-save");
        Hud.hide("path");
        Hud.hide("extract");
        Hud.hide("delete-save");
        Hud.hide("play");
        Hud.show("cover-up");
        Hud.show("cover-down");
        Hud.show("optionsmenu");
        document.getElementById("modinfo").innerHTML = "<span style=\"font-family: Icon,serif;\">&#62038;</span> Kunzite <span style=\"font-family: Icon,serif; padding-left: 20px;\">&#61966;</span> " + Math.floor(min / 60) + TranslationUtil.of("h") + STRINGS.SPACE + (min % 60) + TranslationUtil.of("m");
    }
}

/**
 * Returns To Home Screen
 * @returns {void}
 */

function gotoHomePage() {
    document.getElementById("covertext").innerHTML = STRINGS.EMPTY
    Hud.setPinned(false)
    Hud.hide("pin-holder")
    updateDisplayInfo(TranslationUtil.of("greet") + STRINGS.SPACE + currentUserName + "!", STRINGS.EMPTY, STRINGS.EMPTY, STRINGS.EMPTY, STRINGS.EMPTY, STRINGS.EMPTY)
}

/**
 * Sets Current Author From Input (id: authinput)
 * @returns {Promise<void>}
 */

async function setAuthor() {
    if (currentEntry === STRINGS.EMPTY) return;
    document.getElementById("authinput").blur()
    let value = document.getElementById("authinput").value.trimEnd();
    if (value === STRINGS.EMPTY) {
        const author = (await getLauncher(currentEntry).getFunctions().getData()).author;
        document.getElementById("authinput").value = author;
        document.getElementById("authinput").placeholder = author;
        document.getElementById("authinput").style.width = Math.min(getTextWidth(author, "normal 1rem Aller"), 225) + "px"

    } else {
        await getLauncher(currentEntry).getFunctions().setAuthor(value);
        await getLauncher(currentEntry).getFunctions().leftClick();
    }
}

/**
 * Sends Keep Alive
 * @returns {Promise<void>}
 */

async function sendKeepAlive() {
    await sendEvent("keep_alive", {
        name: currentEntry
    })
}

/**
 * Interval: Update Concurrent Game Info
 * @returns {Promise<void>}
 */

async function keepaliveTicker() {
    Hud.tick()
    DownloadsManager.tick()

    if (!Hud.isHidden("loader")) return;
    if (!Hud.isHidden("modlist") || alertPath !== undefined) {
        if (!Hud.isHidden("pill")) {
            Hud.hide("pill")
            Hud.hide("pill-files")
            Hud.hide("pill-contains")
        }
        return
    }

    const playTime = await getLauncher(currentEntry).getFunctions().get_time();
    const second = Math.floor(playTime / 1000) % 60;
    const min = Math.floor(playTime / 60000);
    const name = await getLauncher(currentEntry).getFunctions().getName() + STRINGS.SPACE;
    const author = (await getLauncher(currentEntry).getFunctions().getData()).author;
    const time = Math.floor(min / 60) + "h " + (min % 60) + "m " + second + "s";

    document.getElementById("pill-game").textContent = name
    document.getElementById("pill-author").textContent = author
    document.getElementById("pill-time").textContent = time
}

/**
 * Rename Mod
 * @returns {Promise<void>}
 */

async function renameMod() {
    if (currentEntry === STRINGS.EMPTY) return;
    let value = document.getElementById("modtitle").value.trimStart().trimEnd();
    let name = await getLauncher(currentEntry).getFunctions().getName();
    if (value === name) {
        document.getElementById("modtitle").value = formatModName(currentEntry);
        return;
    }
    if (value !== name && value.length !== 0) {
        let oldName = (await getLauncher(currentEntry).getFunctions().getPath()) + fileTerminator + name;
        let newName = (await getLauncher(currentEntry).getFunctions().getPath()) + fileTerminator + value;

        if (value.match(/[<>:"/\\|?*\u0000-\u001F]|[. ]$/g) || value.match(/^(con|prn|aux|nul|com\d|lpt\d)$/i) || value.length > 100) {
            await confirm("The Name '" + value + "' is invalid!")
            document.getElementById("modtitle").value = formatModName(currentEntry);
            return;
        }

        if (await isExist(await getLauncher(currentEntry).getFunctions().getPath() + fileTerminator + newName)) {
            await confirm("The Name '" + value + "' already exists!")
            document.getElementById("modtitle").value = formatModName(currentEntry);
            return;
        }

        try {
            Hud.show("loader")
            Hud.hide("main")
            document.getElementById("loadingsub").textContent = "Renaming Mod"
            Hud.setLoadingBar(0, false)
            Hud.setLoadingBar(100, true)
            await invoke("rename_dir", {
                path: oldName,
                newName: newName,
                id: value
            })
        } catch (e) {
            await confirm("Cannot Rename The File Due To:\n\n" + e)
        }

    } else {
        document.getElementById("modtitle").value = currentEntry;
    }
}

/**
 * Update Profiles
 * @param {string} path Path of profiles
 * @returns {Promise<void>}
 */

async function updateProfiles(path) {
    const profiles_path = path + "--profiles";
    const current_info_path = profiles_path + fileTerminator + ".info.json";

    if (document.getElementById("profiles").children !== null) {
        document.getElementById("profiles").replaceChildren();
    }

    profilePath = profiles_path;

    if (!await isDir(profiles_path)) {
        await mkdir(profiles_path);
    }

    if (!await isExist(current_info_path)) {
        await writeTextFile(current_info_path, "{}");
    }

    let profiles_data = JSON.parse(await readTextFile(current_info_path));

    currentGameDataPath = path;
    selectedProfileName = profiles_data.selected == null ? "profile-Default" : profiles_data.selected;
    currentProfile = profiles_data.current == null ? "Default" : profiles_data.current;
    originalProfile = currentProfile;
    currentProfileData = profiles_data.profiles == null ? {"0": "Default"} : profiles_data.profiles;
    concurrentProfileData = {}

    if (!await isExist(getProfilePath(currentProfile))) {
        await writeTextFile(getProfilePath(currentProfile), "{}");
    }

    const profile_files = await readDir(profiles_path);
    for (const profile of profile_files) {
        if (profile.name.includes(".ddmm.profile.json")) {
            const name = profile.name.replace(".ddmm.profile.json", STRINGS.EMPTY);
            Logger.log(name)
            Logger.log(currentProfileData)
            let profile_spot = undefined;
            for (const key in currentProfileData) {
                if (currentProfileData[key] === "profile-" + name) {
                    profile_spot = key;
                    break
                }
            }
            Logger.log(profile_spot)
            createProfile(name, profile_spot);
        }
    }
    Hud.show("profile-bg")
}

function getProfilePath(name) {
    if (name === null) {
        return profilePath + fileTerminator + "null"
    }
    return profilePath + fileTerminator + (name === undefined ? currentEntry : name).replace("profile-", STRINGS.EMPTY) + ".ddmm.profile.json"
}

async function saveProfileData() {
    for (const key in currentProfileData) {
        const profile_path = getProfilePath(currentProfileData[key]);
        Logger.log(profile_path)
        if (!await isExist(profile_path)) {
            currentProfileData[key] = undefined;
        }
    }

    const sorted = Object.entries(currentProfileData)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
        .reduce((acc, [key, value], index, array) => {
            const currentKey = parseInt(key);
            const prevKey = index > 0 ? parseInt(array[index - 1][0]) : -1;
            for (let i = prevKey + 1; i < currentKey; i++) {
                acc[i] = undefined;
            }
            acc[currentKey] = value;
            return acc;
        }, {});

    const profiles_data = {
        "selected": selectedProfileName,
        "current": currentProfile.replace("profile-", STRINGS.EMPTY),
        "profiles": sorted
    }

    Logger.log(profiles_data, sorted)

    writeTextFile(profilePath + fileTerminator + ".info.json", JSON.stringify(profiles_data, null, "\t")).then(_ => {
    });
}

async function saveCurrentProfileData() {
    let active_profile_path = getProfilePath(originalProfile);
    if (!await isExist(active_profile_path)) {
        return;
    }
    await writeTextFile(active_profile_path, JSON.stringify(await saveCurrentGamePath(), null, "\t"));
}

async function saveCurrentGamePath(path = undefined, recursive = false) {
    if (path === undefined) path = currentGameDataPath;
    let data = {}
    for (const file of await readDir(path)) {
        if (file.isDirectory) {
            data[file.name] = await saveCurrentGamePath(path + fileTerminator + file.name, true)
        } else {
            data[file.name] = Base64.fromUint8Array(await readFile(path + fileTerminator + file.name));
        }
    }

    if (getLauncher(currentEntry) !== undefined && !recursive) {
        const data_path = getLauncher(currentEntry).getFunctions().absolute_location + fileTerminator + "game" + fileTerminator + "saves"
        if (await isExist(data_path)) {
            const data_path_contents = await readDir(data_path)
            for (const file of data_path_contents) {
                const data_file_path = data_path + fileTerminator + file.name
                if (!file.isDirectory) {
                    data["mod_saves_folder:" + file.name] = Base64.fromUint8Array(await readFile(data_file_path));
                }
            }
        }
    }

    return data;
}

async function loadCurrentProfileData(reload, reset_data) {
    if (reset_data !== true) {
        let profiles_data = JSON.parse(await readTextFile(profilePath + fileTerminator + ".info.json"));
        selectedProfileName = profiles_data.selected == null ? "profile-Default" : "profile-" + profiles_data.selected;
        currentProfile = profiles_data.current ?? "Default";
        originalProfile = currentProfile;
        currentProfileData = profiles_data.profiles ?? {"0": "Default"};
        currentProfileData = Object.fromEntries(Object.entries(currentProfileData).sort((a, b) => parseInt(a[0]) - parseInt(b[0])));
        concurrentProfileData = {}
    }
    Logger.log(" should reload: " + reload + " file: " + currentProfile)
    if (reload) {
        await delDir(currentGameDataPath);
        await delDir(getLauncher(currentEntry).getFunctions().absolute_location + fileTerminator + "game" + fileTerminator + "saves");

        let data = await readTextFile(getProfilePath(currentProfile));
        const self_data = JSON.parse(data);

        await loadProfileData(self_data, currentGameDataPath)
    }
}

async function loadProfileData(self_data, upstream) {
    for (const f in self_data) {
        const file = self_data[f]
        Logger.log(typeof file)
        if (typeof file === "object") {
            await mkdir(upstream + fileTerminator + f);
            await loadProfileData(file, upstream + fileTerminator + f)
            continue;
        }
        let n = f.replaceAll(fileTerminator, "/");

        if (f.startsWith("mod_saves_folder:")) {
            let global_path = getLauncher(currentEntry).getFunctions().absolute_location + fileTerminator + "game" + fileTerminator + "saves"
            let path = f.replace(/mod_saves_folder:/, STRINGS.EMPTY)
            n = path.replaceAll(fileTerminator, "/")
            if (await isExist(global_path)) {
                if (n.includes("/")) {
                    for (const dir of n.split("/")) {
                        if (dir === n.split("/").pop()) continue;
                        await mkdir(global_path + fileTerminator + dir, {recursive: true});
                    }
                }

                try {
                    await writeFile(global_path + fileTerminator + path,
                        Base64.toUint8Array(file));
                } catch (e) {
                    Logger.log(f + " is not encoded in base64!")
                }
            }
        } else {
            if (n.includes("/")) {
                for (const dir of n.split("/")) {
                    if (dir === n.split("/").pop()) continue;
                    await mkdir(upstream + fileTerminator + dir, {recursive: true});
                }
            }
            try {
                await writeFile(upstream + fileTerminator + f,
                    Base64.toUint8Array(file));
            } catch (e) {
                Logger.log(f + " is not encoded in base64!")
            }
        }
    }
}

async function delDir(path) {
    if (!await isExist(path)) {
        Logger.log("Path does not exist: " + path)
        return;
    }
    for (const file of await readDir(path)) {
        Logger.log(path, file.name)
        if (file.isDirectory) {
            await delDir(path + fileTerminator + file.name)
        }
        await remove(path + fileTerminator + file.name);
    }
}

async function saveProfile() {
    const changed_profile = originalProfile !== currentProfile;
    Logger.log(await saveCurrentGamePath())
    await saveProfileData();
    await saveCurrentProfileData();
    await loadCurrentProfileData(changed_profile);
}

function createProfile(profile, position) {
    if (position === undefined) {
        position = 0;
        while (currentProfileData[position] !== undefined) {
            position++;
        }
    }

    const background = document.createElement("div");
    const name = document.createElement("header");
    const b_delete = document.createElement("button");
    const b_select = document.createElement("button");
    const b_drag = document.createElement("button");
    const onClick = () => {
        for (const elm of document.getElementsByClassName("profile-button")) {
            if (elm.classList.contains("profile-button-active")) {
                elm.classList.remove("profile-button-active")
            }
        }
        selectedProfileName = background.id;
        currentProfile = background.id.replace("profile-", STRINGS.EMPTY);
        background.classList.add("profile-button-active")
    }

    background.classList.add("profile-button")
    background.id = "profile-" + profile;
    background.style.order = position;

    name.classList.add("profile-item-name")
    name.textContent = profile;

    b_delete.classList.add("profile-item-delete", "profile-item-source")
    b_select.classList.add("profile-item-select", "profile-item-source")
    b_drag.classList.add("profile-item-drag", "profile-item-source")

    b_delete.innerHTML = "&#60445;";
    b_select.innerHTML = "&#60543;";
    b_drag.innerHTML = "&#62782;";

    background.appendChild(name)
    background.appendChild(b_delete)
    background.appendChild(b_select)
    background.appendChild(b_drag)

    if (selectedProfileName === background.id) {
        background.classList.add("profile-button-active")
    }

    b_select.addEventListener("click", (_) => {
        if (profile === "Default") {
            confirm(TranslationUtil.of("error-profile_setname")).then(() => {
            })
            return;
        }
        renameProfileTarget = background.id.replace("profile-", STRINGS.EMPTY);
        document.getElementById("profile-bg").classList.add("profile-bg-covered")
        Hud.show("input-prompt")
        document.getElementById("input-prompt-box").value = background.id.replace("profile-", STRINGS.EMPTY);
        document.getElementById("input-prompt-box").focus();
    })

    background.addEventListener("mousedown", onClick)

    b_drag.addEventListener("mousedown", async (_) => {
        if (selectedProfileButton !== null) return;
        selectedProfileName = background.id;
        selectedProfileButton = document.createElement("div");
        const text = document.createElement("header");
        text.classList.add("profile-item-name")
        text.textContent = background.id.replace("profile-", STRINGS.EMPTY);

        selectedProfileButton.classList.add("profile-button-hover")
        selectedProfileButton.style.top = background.getBoundingClientRect().y + "px";
        selectedProfileButton.style.left = background.getBoundingClientRect().x + "px";
        selectedProfileButton.id = background.id

        selectedProfileButton.appendChild(text)
        document.getElementById("profile-blur").appendChild(selectedProfileButton);
    })

    b_delete.addEventListener("mousedown", async (_) => {
        if (profile === "Default") {
            await confirm(TranslationUtil.of("error-profile_delete"))
            return;
        }
        await remove(profilePath + fileTerminator + background.id.replace("profile-", STRINGS.EMPTY) + ".ddmm.profile.json");

        currentProfile = "Default"
        selectedProfileName = "profile-Default"
        for (const key in currentProfileData) {
            if (currentProfileData[key].replace("profile-", STRINGS.EMPTY) === background.id.replace("profile-", STRINGS.EMPTY)) {
                delete currentProfileData[key]
            }
        }

        background.remove()

        for (const elm of document.getElementsByClassName("profile-button")) {
            if (elm.classList.contains("profile-button-active")) {
                elm.classList.remove("profile-button-active")
            }
        }
        document.getElementById("profile-Default").classList.add("profile-button-active")

        await saveProfileData();
        await loadCurrentProfileData(true, true);
    })

    concurrentProfileData[profile] = {
        files: {}
    }


    isExist(getProfilePath(profile)).then(r => {
        Logger.log(profile, r)
        if (!r) {
            Logger.log("Creating Profile")
            writeTextFile(getProfilePath(profile), JSON.stringify(concurrentProfileData[profile], null, "\t")).then(_ => {
            });
        }
    })

    currentProfileData[position] = background.id;
    document.getElementById("profiles").appendChild(background)
    return onClick;
}

function moveEntries(obj, fromIndex, toIndex) {
    const values = Object.values(obj);

    if (fromIndex < 0 || fromIndex >= values.length ||
        toIndex < 0 || toIndex >= values.length) {
        throw new Error('Invalid index');
    }

    const [movedValue] = values.splice(fromIndex, 1);
    values.splice(toIndex, 0, movedValue);

    const result = {};
    values.forEach((value, index) => {
        result[index] = value;
    });

    return result;
}

// Save Profile Name

function closeProfileRenamePrompt() {
    document.getElementById("profile-bg").classList.remove("profile-bg-covered")
    Hud.hide("input-prompt")
}

async function saveProfileName() {
    const name = document.getElementById("input-prompt-box").value;
    if (name.includes("profile-") || name.toLowerCase() === "default") {
        await confirm("The Name '" + name + "' is already taken!")
        return;
    }
    Logger.log("[MARKER] -> Rename")
    if (name !== STRINGS.EMPTY) {
        Logger.log(currentProfileData)
        for (const profile in currentProfileData) {
            Logger.log(currentProfileData[profile])
            if (currentProfileData[profile] === null || currentProfileData[profile] === undefined) continue;
            const comperator = (currentProfileData[profile] + STRINGS.EMPTY).toLowerCase().replace("profile-", STRINGS.EMPTY);
            const comperason = name.toLowerCase().replace("profile-", STRINGS.EMPTY);
            Logger.log(comperator, comperason, comperator === comperason)
            if (comperason === comperator || name.toLowerCase().includes("profile-")) {
                await confirm("The Name '" + name + "' is already taken!")
                return;
            }
        }
        if (name.includes("-_at-") || name.includes("/") || name.includes(fileTerminator)) {
            await confirm("The Name '" + name + "' is invalid!")
            return;
        }
        for (const key in currentProfileData) {
            if (currentProfileData[key] === "profile-" + renameProfileTarget) {
                Logger.log(concurrentProfileData[renameProfileTarget], currentProfileData[key])
                document.getElementById("profile-" + renameProfileTarget).querySelector("header").textContent = name;
                document.getElementById("profile-" + renameProfileTarget).id = "profile-" + name;
                currentProfileData[key] = "profile-" + name;
                concurrentProfileData[name] = concurrentProfileData[renameProfileTarget];
                delete concurrentProfileData[renameProfileTarget];

                if (selectedProfileName === "profile-" + renameProfileTarget) {
                    selectedProfileName = "profile-" + name;
                    currentProfile = name;
                }

                Logger.log(renameProfileTarget)

                await writeTextFile(getProfilePath(name), await readTextFile(getProfilePath(renameProfileTarget)));
                await remove(getProfilePath(renameProfileTarget));

                break
            }
        }
    }
    await saveProfileData();
    closeProfileRenamePrompt()

}

async function updateClient() {
    if (await shouldUpdate()) {
        await sendEvent("update_launcher", {
            from: CLIENT_VERSION
        })
        document.getElementById("loadingsub").textContent = TranslationUtil.of("updating") + " Doki Doki Mod Manager"
        await invoke("update_exe")
    } else {
        Logger.warn("Already Up To Date (" + CLIENT_VERSION + ")")
    }
}

async function launchDesktop() {
    previous_app = createApp(Desktop)
    previous_app.mount("#app");
    const logs = Logger.instant()

    for (const log in logs) {
        const data = logs[log];
        const holder = document.createElement("div");
        const text = document.createElement("header");
        const timestamp = document.createElement("header");
        const difference = data.timestamp - start;

        holder.classList.add("console-text-holder")
        text.classList.add("console-text")
        timestamp.classList.add("console-text-right")

        if (data.isWarn) {
            holder.classList.add("console-warn")
        }

        text.innerHTML = htmlEscape(data.msg).replaceAll("\n", "<br>")
        timestamp.textContent = (difference < 1000 ? difference + "ms" : (difference > 60000 ? (difference / 60000).toFixed(2) + "m" : (difference / 1000).toFixed(2) + "s"));

        holder.appendChild(text);
        holder.appendChild(timestamp);

        document.getElementById("console").appendChild(holder);
    }

    document.getElementById("console").scrollTo(0, document.getElementById("console").scrollHeight)
    document.getElementById("desktop-version").textContent = "Doki Doki Mod Manager " + CLIENT_VERSION
    document.getElementById("desktop-launch").addEventListener("mouseup", () => {
        window.location.reload()
    })

    document.getElementById("desktop-close2").addEventListener("mouseup", () => {
        invoke("close");
    })

    document.getElementById("desktop-close").addEventListener("mouseup", () => {
        invoke("close");
    })

    document.getElementById("desktop-update").addEventListener("mouseup", () => {
        if (shouldUpdate()) {
            previous_app.unmount()
            createApp(App).mount("#app")
            updateClient()
        }
    })
}

async function sendEvent(event_name = "event", options = {}) {
    await invoke("tracker", {
        event: event_name,
        props: options
    })
}

/**
 * Called Upon DOM On-Load
 * @example ```javascript
 * document.addEventListener('DOMContentLoaded', onLoad);
 * ```
 * @returns {Promise<void>}
 */

async function onLoad() {
    let start = Date.now();

    Logger.log("Loading Observers");

    PreventDefaults.init()
    OSUtil.Init()
    await SeasonsManager.init(CURRENT.SEASON)

    await listen("import_done", async (event) => {
        setTimeout(async () => {
            if (alertPath !== undefined) {
                if (await isExist(alertPath) && alertPath.toLowerCase().includes("downloads")) {
                    await remove(alertPath)
                }
                alertPath = undefined;
            }
        })

        let goal = event.payload.text;
        let url = event.payload.text2;
        if (!Hud.isVoid(url)) {
            const download = DownloadsManager.getDownload(url)
            if (!Hud.isVoid(download)) {
                DownloadsManager.complete(url)
            }
        }

        Logger.log("Imported: " + alertPath + " AT: " + goal + " with URL: " + url)

        await addMod(goal)

        Hud.hide("loader")
        Hud.show("main")
        
        if (getLauncher(goal)) {
            getLauncher(goal).getFunctions().leftClick();
        } else {
            Logger.warn(goal + " Not Found!")
        }
        alertPath = undefined;
        showContainers(true)
    })

    await listen("download_start", async (e) => {
        Logger.log(e.payload.text)
        
        Hud.show("downloads-list")
        document.getElementById("language-list").classList.add("language-list-hide");

        const [url, path] = e.payload.text.split(" | ");
        DownloadsManager.startDownload(url, path)
        confirm("Close Other Windows?").then(async (e) => {
            if (e) {
                await invoke("goto_main")
            }
        })

        Logger.log(tracked_downloads)
    })

    await listen("download_percent", async (e) => {
        const [url, downloadString, downloadPercent] = e.payload.text.split(" | ");
        const downloadingObject = DownloadsManager.getDownload(url)

        if (!Hud.isVoid(downloadingObject)) {
            downloadingObject.setUpdateString(downloadString)
            downloadingObject.setPercent(parseFloat(downloadPercent))
        }
    })

    await listen("download_end", async (e) => {
        let components = e.payload.text.split(" | ");
        let url = components[0]
        let path = components[1]
        let download = DownloadsManager.getDownload(url)

        download.setPercent(0)
        download.setUpdateString("Importing")

        console.log(url, path)

        DownloadsManager.swap(url, path)

        await importMod(path)
    })

    // Listener for Loading Bar Percent

    await listen("set_bar", (event) => {
        let goal = event.payload.number_goal;
        let number = event.payload["number"];
        Logger.log(event.payload)

        if (event.payload.path !== undefined) {
            const url = event.payload.path.replaceAll("\\\\","\\")
            const downloadingObject = DownloadsManager.getDownload(url)
            if (!Hud.isVoid(downloadingObject)) {
                downloadingObject.setPercent(number)
                downloadingObject.setPercentFrames(parseFloat(goal))
                return
            }
        }

        Hud.setLoadingBar(event.payload.number, false)
        if (goal > 0) {
            Hud.setLoadingBar(goal, true)
        }
    })

    // This is what is received when you import a mod
    // This is also the first handshake handler that tells the frontend (this) to listen to the downloads folder

    Logger.log("Finished Loading Defaults (" + (Date.now() - start) + "ms).")
    Logger.log("Loading Listeners")

    await listen("pathRespond", async (event) => {
        if (!reset) {
            Logger.log("Start Loading Pt. 2 (" + (Date.now() - start) + "ms).")

            let payloadPath = event.payload.path;
            let newest_version = await getLatest();
            let escape_clause_language = false;
            await loadConfig(event.payload.local_path)
            reset = true;

            Logger.log("Version Check (" + (Date.now() - start) + "ms).")

            if (newest_version.split("\n")[0] !== CLIENT_VERSION) {
                Logger.warn("NOT UP TO DATE " + newest_version + " > " + CLIENT_VERSION)
                document.getElementById("version").innerHTML = `(${CLIENT_VERSION}) <u>Update!</u>`
                if (navigator.onLine) {
                    if (TranslationUtil.getLanguage() === STRINGS.EMPTY) {
                        escape_clause_language = true;
                    }
                    loadTranslation(TranslationUtil.getLanguage(), true)

                    Hud.show("changelog")
                    document.getElementById("changelog-title").textContent = "New Update! | " + newest_version.split("\n")[0]
                    document.getElementById("changelog-text").innerHTML = linkify(htmlEscape(newest_version.split("\n").slice(1).join("\n"))).replace(/\r?\n/g, "<br>")
                    document.getElementById("changelog-update").textContent = TranslationUtil.of("update")
                    document.getElementById("changelog-ignore").textContent = TranslationUtil.of("ignore")
                    document.getElementById("changelog-ignore").style.right = "calc(2rem + " + document.getElementById("changelog-update").getBoundingClientRect().width + "px)"

                    let response = await new Promise(resolve => {
                        document.getElementById("changelog-update").addEventListener("mouseup", async () => {
                            resolve(true)
                        })
                        document.getElementById("changelog-ignore").addEventListener("mouseup", async () => {
                            resolve(false)
                        })
                    });

                    Hud.hide("changelog")

                    if (response) {
                        await updateClient()
                        return;
                    }
                } else {
                    Logger.warn("You are currently offline. Update will not be requested.")
                }
            } else {
                Logger.log(CLIENT_VERSION, localConfig.config.get("version"))
                document.getElementById("version").textContent = `(${CLIENT_VERSION})`
                if (localConfig.config.get("version") !== CLIENT_VERSION) {
                    if (TranslationUtil.getLanguage() === STRINGS.EMPTY) {
                        escape_clause_language = true;
                    }
                    loadTranslation(TranslationUtil.getLanguage(), true)
                    await saveConfig()

                    Hud.show("changelog")
                    document.getElementById("changelog-title").textContent = "Update Complete! | " + newest_version.split("\n")[0]
                    document.getElementById("changelog-text").innerHTML = linkify(htmlEscape(newest_version.split("\n").slice(1).join("\n"))).replace(/\r?\n/g, "<br>")
                    Hud.hide("changelog-ignore")
                    document.getElementById("changelog-update").textContent = TranslationUtil.of("ignore")
                    document.getElementById("changelog-ignore").style.right = "calc(2rem + " + document.getElementById("changelog-update").getBoundingClientRect().width + "px)"

                    await new Promise(resolve => {
                        document.getElementById("changelog-update").addEventListener("mouseup", async () => {
                            resolve(true)
                        })
                        document.getElementById("changelog-ignore").addEventListener("mouseup", async () => {
                            resolve(false)
                        })
                    });

                    Hud.hide("changelog")
                }
            }

            Logger.log("Language (" + (Date.now() - start) + "ms). Current=" + TranslationUtil.getLanguage() + " | Escaped=" + escape_clause_language)

            if (TranslationUtil.getLanguage() === STRINGS.EMPTY || escape_clause_language) {
                TranslationUtil.setLanguage(STRINGS.EMPTY)
                document.getElementById("language-list").classList.remove("language-list-hide")
                document.getElementById("language-list").classList.add("language-list-force")
                document.getElementById("loader").appendChild(document.getElementById("language-list"))
                let interval;
                await new Promise(resolve => interval = setInterval(() => {
                    if (TranslationUtil.getLanguage() !== STRINGS.EMPTY) {
                        resolve()
                        clearInterval(interval)
                    }
                }, 100))

                document.getElementById("main").appendChild(document.getElementById("language-list"))
                document.getElementById("language-list").classList.add("language-list-hide")
                document.getElementById("language-list").classList.remove("language-list-force")
            } else {
                loadTranslation(TranslationUtil.getLanguage(), true)
            }

            Logger.log("DDLC Check (" + (Date.now() - start) + "ms).")

            if (!await isDir(localPath + fileTerminator + "store" + fileTerminator + "ddlc")) {
                document.getElementById("loadingsub").textContent = TranslationUtil.of("select_zip")
                Hud.show("select-zip")
                let listener = async () => {
                    await openUrl("https://ddlc.moe")
                };
                document.getElementById("loadingsub").addEventListener("mouseup", listener)

                while (!await isDir(localPath + fileTerminator + "store" + fileTerminator + "ddlc")) {
                    await new Promise(resolve => setTimeout(resolve, 1000))
                }

                document.getElementById("loadingsub").removeEventListener("mouseup", listener)
            }

            document.getElementById("select-zip").remove();

            Logger.log("Theme (" + (Date.now() - start) + "ms).")
            await setTheme(localConfig.config.get("theme"), true)
            Logger.log("Covers (" + (Date.now() - start) + "ms).")
            await updateCoverImages(true)
            Logger.log("Main (" + (Date.now() - start) + "ms).")
            gotoHomePage()
            Logger.log("Watcher (" + (Date.now() - start) + "ms).")
            await watch(
                event.payload.path,
                async (event) => {
                    for (const index in event.paths) {
                        const path = event.paths[index];
                        setTimeout(async () => {
                            if (!supportedModPackage(path) || !(await isExist(path))) return;

                            const data = await metadata(path);
                            const split = terminatePath(path).split(fileTerminator)

                            if (data.size === 0) {
                                return;
                            }

                            let download = DownloadsManager.getDownload(path)
                            if (Hud.isVoid(download)) {
                                download = DownloadsManager.startDownload(path, path)
                            }

                            download.setPercent(100)
                            download.setUpdateString("Finished Downloading")

                            Hud.show("alert")

                            showContainers(false)
                            alertPath = path

                            document.getElementById("alert-size").innerText = Math.floor(data.size / 1048600).toString() + "mb";
                            document.getElementById("alert-pth").innerText = payloadPath;
                            document.getElementById("alert-name").textContent = split[split.length - 1].split(".")[0];
                        }, 1000)
                    }
                }, {
                    delayMs: 500
                }
            )

            Logger.log("Finished Loading Core (" + (Date.now() - start) + "ms).")
        }
        try {
            await requestDirectory(event.payload.final_data)
            gotoHomePage()
        } catch (e) {
            Logger.log(e)
        }
    })

    await listen('closed', async (event) => {
        if (event.payload.id !== STRINGS.EMPTY) {

            await getLauncher(event.payload.id).getFunctions().close();
        }
    });

    await listen('popup', async (event) => {
        await confirm(event.payload.text)
    });

    await listen('substring', async (event) => {
        if (event.payload.text.includes("|ppathIdentifier|")) {
            const url = event.payload.text.split("|ppathIdentifier|").pop().replaceAll("\\\\","\\");
            const downloadingObject = DownloadsManager.getDownload(url)
            if (!Hud.isVoid(downloadingObject)) {
                downloadingObject.setUpdateString(event.payload.text.split("|ppathIdentifier|")[0])
                return
            }
        }
        if (event.payload.text.startsWith("Extracting")) {
            document.getElementById("loadingsub").textContent = event.payload.text.replace("Extracting", TranslationUtil.of("extracting"))
        } else {
            document.getElementById("loadingsub").textContent = event.payload.text
        }
    });

    // Listens For Rename Finishing

    await listen("rename_done", async (event) => {
        const value = event.payload.text;

        await requestDirectory(selectedPath);
        while (Hud.isHidden("loader")) {
        }

        Logger.log(value)
        if (getLauncher(value)) {
            await getLauncher(value).getFunctions().leftClick();
        }
    })

    document.getElementById("save-profile").addEventListener("click", async () => {
        Hud.hide("profile-bg")
        await saveProfile();
        Hud.hide("profile-blur")
        Hud.hide("profile-bg")
    });

    document.getElementById("create-profile").addEventListener("click", async () => {
        let newProfile = "Default 0";
        while (document.getElementById("profile-" + newProfile) !== null) {
            newProfile = "Default " + (parseInt(newProfile.split(STRINGS.SPACE)[1]) + 1);
        }
        createProfile(newProfile)()
        document.getElementById("profiles").scroll({
            top: document.getElementById("profiles").scrollHeight,
            behavior: "smooth"
        })
    })

    document.getElementById("backup-profile").addEventListener("click", async () => {

        Hud.hide("profile-bg")
        Hud.hide("profile-bg")
        await saveProfile();

        Hud.hide("profile-blur")
        if (!await isDir(localPath + fileTerminator + terminatePath("store\\backup"))) {
            await mkdir(localPath + fileTerminator + terminatePath("store\\backup"));
        }

        await writeTextFile(localPath + fileTerminator + terminatePath("store\\backup") + fileTerminator + profilePath.replaceAll("\\\\", STRINGS.EMPTY).replaceAll(fileTerminator, "/").replaceAll(fileTerminator, "/").split("/").pop() + "-_at-" + getFormattedDate() + ".ddmm.backup.json", JSON.stringify(await saveCurrentGamePath(profilePath), null, "\t"));
        await invoke("open_path", {
            path: localPath + fileTerminator + terminatePath("store\\backup")
        })
    })

    document.getElementById("backup-load-profile").addEventListener("click", async () => {
        // create backup first -> failsafe
        let backup_select = await open({
            directory: false,
            multiple: false,
            filters: [{
                name: 'DDMM Backup Json',
                extensions: ['json']
            }],
            title: 'Select Backup File',
            defaultPath: localPath + fileTerminator + terminatePath("store\\backup") + fileTerminator
        });

        Hud.hide("profile-bg")
        await saveProfile();
        if (backup_select !== null && backup_select !== undefined) {
            if (!await isDir(localPath + fileTerminator + terminatePath("store\\backup"))) {
                await mkdir(localPath + fileTerminator + terminatePath("store\\backup"));
            }
            if (!await isDir(localPath + fileTerminator + terminatePath("store\\backup\\autosave"))) {
                await mkdir(localPath + fileTerminator + terminatePath("store\\backup\\autosave"));
            }
            await writeTextFile(localPath + fileTerminator + terminatePath("store\\backup\\autosave") + fileTerminator + profilePath.replaceAll("\\\\", "\\").replaceAll(fileTerminator, "/").replaceAll(fileTerminator, "/").split("/").pop() + "-_at-" + getFormattedDate() + ".ddmm.backup.json", JSON.stringify(await saveCurrentGamePath(profilePath), null, "\t"));
            await delDir(profilePath);
            await loadProfileData(JSON.parse(await readTextFile(backup_select)), profilePath);
            Logger.log(currentGameDataPath)
            await updateProfiles(currentGameDataPath);
            await loadCurrentProfileData(true);
        }

        Hud.hide("profile-blur")
    })

    /**
     * De-ref image viewer to prevent mem leak
     */

    document.getElementById("view-image").onload = () => {
        deref(document.getElementById("view-image").src);
    }

    document.getElementById("cover-up").addEventListener("click", () => {
        if (currentEntry !== STRINGS.EMPTY) return;
        currentBackgroundOffset += 5;
        if (currentBackgroundOffset > 100) currentBackgroundOffset = 0;
        document.getElementById("bg").style.backgroundPositionY = ((600 - currentBackgroundMaxOffset) * (currentBackgroundOffset / 100)) + "px";
        saveConfig();
    })

    document.getElementById("cover-down").addEventListener("click", () => {
        if (currentEntry !== STRINGS.EMPTY) return;
        currentBackgroundOffset -= 5;
        if (currentBackgroundOffset < 0) currentBackgroundOffset = 100;
        document.getElementById("bg").style.backgroundPositionY = ((600 - currentBackgroundMaxOffset) * (currentBackgroundOffset / 100)) + "px";
        saveConfig();
    })

    document.getElementById("cove").addEventListener("wheel", (e) => {
        if (currentEntry !== STRINGS.EMPTY) return;
        currentBackgroundOffset += e.deltaY / 20;
        if (currentBackgroundOffset < 0) currentBackgroundOffset = 0;
        if (currentBackgroundOffset > 100) currentBackgroundOffset = 100;

        document.getElementById("bg").style.backgroundPositionY = ((600 - currentBackgroundMaxOffset) * (currentBackgroundOffset / 100)) + "px";
        saveConfig();
    })

    document.getElementById("load-profile").addEventListener("click", async () => {
        await loadCurrentProfileData(true)
        Hud.hide("profile-blur")
        Hud.hide("profile-bg")
    })

    document.getElementById("input-prompt-box").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            saveProfileName();
        }
    })

    document.getElementById("profile-blur").addEventListener("mouseup", (e) => {
        if (document.getElementById("image-picker-bg").classList.contains("image-picker-visible")) {
            document.getElementById("image-picker-bg").classList.remove("image-picker-visible");
            Hud.hide("profile-blur")
        }
        if (selectedProfileButton !== null) {
            let is_hovering = null;
            for (const elm of document.getElementsByClassName("profile-button")) {
                if (elm.contains(e.target)) {
                    is_hovering = elm;
                    break;
                }
            }
            if (is_hovering !== null) {
                let moveNext = 0;
                let old_index = 0;
                for (const index in currentProfileData) {
                    const data = currentProfileData[index];
                    if (is_hovering.id === data) {
                        moveNext = parseInt(index);
                    } else if (data === selectedProfileButton.id) {
                        old_index = parseInt(index);
                    }
                }

                Logger.log(currentProfileData)

                Logger.log("moving " + old_index + " to " + moveNext)
                currentProfileData = moveEntries(currentProfileData, old_index, moveNext);
                Logger.log(currentProfileData)
                for (const index in currentProfileData) {
                    const data = currentProfileData[index];
                    if (data === undefined || data === null || document.getElementById(data) == null) continue;
                    Logger.log(data, index)
                    document.getElementById(data).style.order = index;
                }
                selectedProfileButton.style.top = is_hovering.getBoundingClientRect().y + "px";
                selectedProfileButton.style.left = is_hovering.getBoundingClientRect().x + "px";
            }
            setTimeout(() => {
                const button = selectedProfileButton;
                selectedProfileButton = null;
                button.classList.add("bounce-out");
                button.classList.add("shrink")
                button.addEventListener("transitionend", () => {
                    button.remove();
                })
            }, 0)
        }
    })

    document.getElementById("profile-blur").addEventListener("mousemove", (e) => {
        if (selectedProfileButton !== null) {
            let is_hovering = null;
            for (const elm of document.getElementsByClassName("profile-button")) {
                if (elm.contains(e.target)) {
                    is_hovering = elm;
                    break;
                }
            }
            if (is_hovering === null) {
                selectedProfileButton.style.top = e.pageY + "px";
                selectedProfileButton.style.left = e.pageX + "px";
            } else {
                selectedProfileButton.style.top = is_hovering.getBoundingClientRect().y + "px";
                selectedProfileButton.style.left = is_hovering.getBoundingClientRect().x + "px";
            }
        }
    })

    // Used for sidebar animations

    observer = new IntersectionObserver((entries) => {
        if (observer_await) return
        let toRemove = []
        let toAdd = []
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                toAdd.push(entry.target)
            } else {
                toRemove.push(entry.target)
            }
        });
        observer_await = true;
        requestAnimationFrame(() => {
            for (const entry of toAdd) {
                entry.classList.add("sidevisible")
            }
            for (const entry of toRemove) {
                entry.classList.remove("sidevisible")
            }
            observer_await = false;
        })
    })

    // Initiates Sidebar Animations

    document.querySelectorAll(".sidebutton2").forEach(element => observer.observe(element));

    // Handles Horizontal Scrolling

    document.getElementById("images").addEventListener("wheel", event => {
        if (event.deltaX === 0) {
            event.preventDefault();
            document.getElementById("images").scrollBy({
                left: event.deltaY * 2,
                behavior: 'smooth'
            });
        }
    })

    document.getElementById("screenshots").addEventListener("wheel", event => {
        if (event.deltaX === 0) {
            event.preventDefault();
            document.getElementById("screenshots").scrollBy({
                left: event.deltaY * 2,
                behavior: 'smooth'
            });
        }
    })

    document.getElementById("input-prompt-agree").addEventListener("mouseup", saveProfileName)
    document.getElementById("input-prompt-cancel").addEventListener("mouseup", closeProfileRenamePrompt)

    // Opens Up A Spreadsheet Full Of DDLC Mods

    document.getElementById("spreadsheet").addEventListener("mouseup", async () => {
        play(sound_beep)
        openWebview("Doki Doki Mods Spreadsheet", "https://docs.google.com/spreadsheets/d/1lgQD8o7qhdWmrwdJjbRv3u_bwdrXmpOzaixWFzLR8r4/htmlembed?widget=false&headers=false#")
    })

    // Opens Up DDLCMods Subreddit

    document.getElementById("reddit").addEventListener("mouseup", async () => {
        play(sound_beep)
        openWebview("Doki Doki Mods Subreddit", "https://www.reddit.com/r/DDLCMods/")
    })

    document.getElementById("select-zip").addEventListener("mouseup", async () => {
        let p = await open({
            directory: false,
            multiple: false,
            filters: [{
                name: 'Zip',
                extensions: ['zip', 'rar']
            }],
            title: 'Select DDLC Zip File'
        });
        try {
            document.getElementById("loadingsub").textContent = TranslationUtil.of("importing_zip")
            Hud.hide("select-zip")
            Hud.setLoadingBar(100, true)
            await invoke("set_ddlc_zip", {
                path: p
            })
            document.getElementById("loadingsub").textContent = "Done!"
        } catch (Exception) {
            Hud.show("select-zip")
            document.getElementById("loadingsub").textContent = TranslationUtil.of("select_zip")
        }
    })

    // Opens up DokiMods

    document.getElementById("dokimods").addEventListener("mouseup", async () => {
        play(sound_beep)
        openWebview("DokiMods", "https://dokimods.me/")
    })

    // Cancels Mod Install

    document.getElementById("cancel").addEventListener("mouseup", async () => {
        play(sound_beep)
        showContainers(true)
        alertPath = undefined;
        const download = DownloadsManager.getDownload(alertPath)
        if (!Hud.isVoid(download)) {
            DownloadsManager.complete(alertPath)
        }
        Hud.hide("alert")
    })

    // Opens Up Path Of The Mod That Is Installing

    document.getElementById("sub3").addEventListener("mouseup", async () => {
        await invoke("open_path", {
            path: alertPath
        })
    })

    // Accept Mod Download

    document.getElementById("download").addEventListener("mouseup", async () => {
        if (alertPath !== undefined) {
            play(sound_beep)
            Hud.hide("alert")
            showContainers(true)
            await sendEvent("auto_download", {
                name: alertPath.split(fileTerminator).pop()
            })
            await importMod(alertPath)
        }
    })

    Logger.log("Finished Loading Observers. Took " + (Date.now() - start) + "ms.")
    Logger.log("Loading Loading Screen")

    Hud.show("loader")
    Hud.hide("main")
    document.getElementById("loadingsub").textContent = "Installing DDLC-Vanilla (If nothing happens after 20s, please restart the program)"

    Logger.log("Loading Drag/Drop")

    // Drag Drop Handling
    // This is for dragging and dropping images and mods

    await listen('tauri://drag-drop', async (event) => {
        let paths = event.payload.paths;
        for (const path of paths) {
            if (supportedModPackage(path)) {
                await sendEvent("manual_download")
                DownloadsManager.startDownload(path, path)
                Hud.show("downloads-list")
                await importMod(path)
            } else if (regexImageName(path)) {
                let dir = await readDir(localPath + fileTerminator + terminatePath("store\\images") + fileTerminator)
                await writeFile(localPath + fileTerminator + terminatePath("store\\images\\z_image-") + (dir.length + 1) + dir.length + "." + path.split(fileTerminator).pop().split(".").pop(), await readFile(path))
            } else {
                await confirm("Unsupported Format " + (path.includes("\.") ? path.split("\.").pop() : "None") + "! {Supported: .zip, .rar, .rpa}")
            }
        }
        setTimeout(async () => {
            await updateCoverImages()
        }, 1000)
    });

    document.getElementById("update").addEventListener("mouseup", async () => {
        play(sound_beep)
        await launchDesktop()
    })

    document.getElementById("play").addEventListener("mouseup", async () => {
        if (currentEntry !== STRINGS.EMPTY && Hud.isHidden("delete-prompt")) {
            await getLauncher(currentEntry).getFunctions().open();
        }
    })

    document.getElementById("version").addEventListener("mouseup", async _ => {
        await launchDesktop()
    })

    document.getElementById("cover-last").addEventListener("mouseenter", () => {
        mouseCoverAvailable = true
    })

    document.getElementById("cover-last").addEventListener("mouseleave", () => {
        mouseCoverAvailable = false
    })

    document.getElementById("image-picker-cancel").addEventListener("mouseup", async () => {
        play(sound_boop)
        Hud.hide("profile-blur")
        document.getElementById("image-picker-bg").classList.remove("image-picker-visible");
    })

    document.getElementById("cove").addEventListener("mouseup", async () => {
        if (currentEntry !== STRINGS.EMPTY && !mouseCoverAvailable) {
            await getLauncher(currentEntry).getFunctions().onFavorite()
        }
    })

    document.getElementById("delete").addEventListener("mouseup", async () => {
        if (currentEntry !== STRINGS.EMPTY) {
            let confirmed = await confirm("Are you sure you want to delete '" + getLauncher(currentEntry).getFunctions().location + "' and its data?")
            if (confirmed) {
                showContainers(false)
                await invoke("delete_path", {
                    path: getLauncher(currentEntry).getFunctions().location
                });
                getLauncher(currentEntry).getFunctions().item.remove();
                delete getLauncher(currentEntry).getFunctions();
                showContainers(true)
                gotoHomePage()
            }
        }
    })

    document.getElementById("path").addEventListener("mouseup", async () => {
        if (currentEntry !== STRINGS.EMPTY) {
            await getLauncher(currentEntry).getFunctions().path();
        }
    })

    document.getElementById("pill-files").addEventListener("mouseup", async () => {
        if (currentEntry !== STRINGS.EMPTY) {
            await getLauncher(currentEntry).getFunctions().path();
        }
    })

    document.getElementById("reset-save").addEventListener("mouseup", async () => {
        if (currentEntry !== STRINGS.EMPTY) {
            let final = getLauncher(currentEntry).getFunctions().absolute_location;
            let path = final + fileTerminator + terminatePath(terminatePath("game\\scripts.rpa"));
            if (!await isExist(path)) {
                path = final + fileTerminator + terminatePath(terminatePath("game\\options.rpyc"));
                if (!await isExist(path)) {
                    Logger.warn("No save found!")
                    await confirm("No save found!")
                    return;
                }
            }
            let loc = await invoke("rpa_data", {
                path: path,
                out: final
            })
            let loc2 = final + fileTerminator + "game" + fileTerminator + "saves"
            let data = false
            if (await isExist(loc2)) {
                data = (await readDir(loc2)).length !== 0
            }
            if (loc !== STRINGS.EMPTY || data) {
                Hud.show("delete-prompt")
                document.getElementById("delete-context").textContent = "Are you sure you want to delete\n" + loc + (data ? " & " + loc2 : STRINGS.EMPTY) + "?"
                currentSavePath = loc + "|" + (data ? loc2 : STRINGS.EMPTY);
            } else {
                await confirm("Unknown Save Data Location!")
            }

        }

    })

    document.getElementById("delete-save").addEventListener("mouseup", async () => {
        if (currentEntry !== STRINGS.EMPTY) {
            Hud.show("profile-blur")

            let final = getLauncher(currentEntry).getFunctions().absolute_location;
            let path = final + fileTerminator + terminatePath("game\\scripts.rpa");
            if (!await isExist(path)) {
                path = final + fileTerminator + terminatePath("game\\options.rpyc");
                if (!await isExist(path)) {
                    Logger.warn("No save found!")
                    await confirm("No save found!")
                    return;
                }
            }
            const loc = await invoke("rpa_data", {
                path: path,
                out: final,
                option: "save_directory"
            })
            const dat = await invoke("rpa_data", {
                path: path,
                out: final,
                option: "config.name"
            })
            const loc2 = final + fileTerminator + "game" + fileTerminator + "saves"
            const loc3 = localPath + fileTerminator + terminatePath("store\\save_data_secondary")
            let secondary = dat === STRINGS.EMPTY ? loc3 + fileTerminator + currentEntry : dat + "_DDMM_data"
            let data = false

            Logger.log(loc2, loc3, loc, dat)

            if (loc === STRINGS.EMPTY) {
                let secondary_name = secondary.split(fileTerminator).pop()
                if (secondary_name.match(/[<>:"/\\|?*\u0000-\u001F]|[. ]$/g) || secondary_name.match(/^(con|prn|aux|nul|com\d|lpt\d)$/i)) {
                    secondary_name = secondary_name.replace(/[<>:"/\\|?*\u0000-\u001F]|[. ]$/gi, STRINGS.EMPTY)
                    secondary_name = secondary_name.replace(/^(con|prn|aux|nul|com\d|lpt\d)$/gi, STRINGS.EMPTY)
                    let comps = secondary.split(fileTerminator)
                    comps.pop()
                    secondary = comps.join(fileTerminator) + fileTerminator + secondary_name
                }

                Logger.warn(secondary)
                data = await isExist(secondary)

                if (!await isExist(loc3)) {
                    await mkdir(loc3)
                }

                if (await isExist(loc2)) {
                    data = data || (await readDir(loc2)).length !== 0
                }
            } else {
                for (const e of WARN_GENERIC_DATA_PATHS) {
                    if (loc.endsWith(e)) {
                        await confirm("This mod uses a generic save folder name '" + e + "'. Mod data will be shared across mods with the same generic config folder. Consider making a profile with that name and loading it every time you play.")
                    }
                }
            }

            Logger.log(loc, data)

            if (loc !== STRINGS.EMPTY || data) {
                const name = loc === STRINGS.EMPTY ? secondary : loc
                if (!await isExist(name)) {
                    await mkdir(name)
                }
                Hud.show("profile-blur")
                await updateProfiles(name)
            } else {
                Hud.hide("profile-blur")
                await confirm("Unknown Save Data Location!")
            }

        }

    })

    document.getElementById("extract").addEventListener("mouseup", async () => {
        if (currentEntry !== STRINGS.EMPTY) {
            let final = getLauncher(currentEntry).getFunctions().absolute_location + fileTerminator + terminatePath("game\\scripts.rpa");
            Logger.log(final)
            document.getElementById("loadingsub").textContent = "Extracting (This will take 20-40s)"
            Hud.show("loader")
            Hud.hide("main")
            if (await isExist(final)) {
                await invoke("extract_game_script", {
                    path: final,
                    out: getLauncher(currentEntry).getFunctions().absolute_location + fileTerminator + "deobf"
                })
                await invoke("open_path", {
                    path: getLauncher(currentEntry).getFunctions().absolute_location + fileTerminator + "deobf"
                })
            } else {
                await confirm("No game script found!")
            }

            await getLauncher(currentEntry).getFunctions().leftClick()
            Hud.hide("loader")
            Hud.show("main")
        }
    })

    document.getElementById("delete-yes").addEventListener("mouseup", async () => {
        Hud.hide("delete-prompt")
        if (currentSavePath === STRINGS.EMPTY) return;
        for (const p of currentSavePath.split("|")) {
            if (p === STRINGS.EMPTY) continue
            await invoke("delete_path", {
                path: p
            });
        }
    })

    document.getElementById("delete-no").addEventListener("mouseup", async () => {
        currentSavePath = STRINGS.EMPTY;
        Hud.hide("delete-prompt")
    })

    document.getElementById("modtitle").addEventListener("focusin", async () => {
        if (currentEntry === STRINGS.EMPTY) {
            document.getElementById("modtitle").value = currentUserName
        } else {
            document.getElementById("modtitle").value = await getLauncher(currentEntry).getFunctions().getName();
        }
    })

    document.getElementById("modtitle").addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
            document.getElementById("modtitle").blur()
            document.getElementById("modtitle").scrollTo({
                left: 0,
                behavior: "smooth"
            })
        }
    })

    document.getElementById("modtitle").addEventListener("blur", async () => {
        document.getElementById("modtitle").scrollTo({
            left: 0
        });
        if (currentEntry !== STRINGS.EMPTY) {
            await renameMod()
        } else {
            const name = document.getElementById("modtitle").value;
            if (name.includes(TranslationUtil.of("greet")) || name === STRINGS.EMPTY) {
                gotoHomePage()
                return;
            }
            currentUserName = name
            await sendEvent("set_user_name", {
                name: currentUserName
            })
            await saveConfig()
            gotoHomePage()
        }
    })

    document.getElementById("options").addEventListener("mouseup", async () => {
        play(sound_beep)
        gotoHomePage()
    })

    document.getElementById("report-open").addEventListener("mouseup", async () => {
        Hud.show("profile-blur")
        Hud.show("report-bg")
        document.getElementById("report-textc").focus()
    })

    document.getElementById("report-close").addEventListener("mouseup", async () => {
        Hud.hide("profile-blur")
        Hud.hide("report-bg")
    })

    document.getElementById("report-send").addEventListener("mouseup", async () => {
        if (document.getElementById("report-textc").value !== STRINGS.EMPTY) {
            await sendEvent("issue", {
                issue: document.getElementById("report-textc").value
            })
            Logger.log(document.getElementById("report-textc").value)
        }
        document.getElementById("report-textc").value = STRINGS.EMPTY
        Hud.hide("profile-blur")
        Hud.hide("report-bg")
    })

    document.getElementById("cover-last").addEventListener("mouseup", async () => {
        play(sound_beep)
        document.getElementById("image-picker-cancel").textContent = TranslationUtil.of("cancel");
        Hud.show("profile-blur")
        document.getElementById("image-picker-bg").classList.add("image-picker-visible")
    })

    document.getElementById("close").addEventListener("mouseup", async () => {
        exitProgram()
    })

    document.getElementById("view-background").addEventListener("mouseup", async () => {
        document.getElementById("view-image").classList.remove("zoom")
        Hud.hide("view-background")
    })

    document.getElementById("min").addEventListener("mouseup", async () => {
        play(sound_beep)
        await invoke("minimize");
    })

    document.getElementById("downloads-show").addEventListener("mouseup", async () => {
        Hud.toggle("downloads-list")
        document.getElementById("language-list").classList.add("language-list-hide");
    })

    document.getElementById("source").addEventListener("mouseup", async () => {
        play(sound_beep)
        await requestDirectory();
    })

    document.getElementById("search").addEventListener("input", async (event) => {
        if (event.target.value === STRINGS.EMPTY && lastInputLength > 0) {
            for (const index in getLaunchers()) {
                const element = getLauncher(index).getFunctions();
                element.item.classList.remove("hide2");
                element.resetOrder()
            }
            lastInputLength = 0;
            return;
        } else if (event.target.value === STRINGS.EMPTY) {
            return
        }

        let lowerTarget = event.target.value.toLowerCase();
        const length = lowerTarget.length;
        const ignoreInvis = length > lastInputLength;
        let names = []

        for (const index in getLaunchers()) {
            const element = getLauncher(index).getFunctions();

            if (ignoreInvis && element.item.classList.contains("hide2")) {
                continue;
            }

            element.item.classList.add("hide2")
            names.push(index)
        }

        const fzf_list = new Fzf(names)
        const entries = fzf_list.find(lowerTarget)

        entries.forEach(e => {
            getLauncher(e.item).getFunctions().item.classList.remove("hide2")
        })

        lastInputLength = length;
    })

    for (const language in TRANSLATION_TABLE) {
        const data = TRANSLATION_TABLE[language]
        const button = document.createElement("button")
        const flag = document.createElement("img")
        const name = document.createElement("span")

        button.classList.add("language-button-list")
        flag.classList.add("language-flag-list")
        name.classList.add("language-text-list")

        flag.src = await getImage("Flags/" + data.data.flag)
        name.textContent = data.data.name

        button.appendChild(flag)
        button.appendChild(name)

        button.addEventListener("mouseup", async () => {
            let old = TranslationUtil.getLanguage();
            loadTranslation(language, (old === STRINGS.EMPTY))
            if (old !== STRINGS.EMPTY) {
                saveConfig().then(_ => {
                })
            }
        })

        document.getElementById("language-list").appendChild(button)
    }

    document.getElementById("language").addEventListener("mouseup", async () => {
        document.getElementById("language-list").classList.toggle("language-list-hide")
        Hud.hide("downloads-list")
    })

    document.getElementById("tutorial-no").addEventListener("mouseup", async () => {
        if (tutorialPointer != null) {
            tutorialPointer.remove()
            tutorialPointer = null;
        }
        isTutorialComplete = true
        document.getElementById("warn").remove()
        await saveConfig()
    })

    document.getElementById("tutorial").addEventListener("mouseup", async () => {
        document.getElementById("warn").classList.add("tutorial-active")
        document.getElementById("tutorial").textContent = TranslationUtil.of("next")
        document.getElementById("tutorial-no").textContent = TranslationUtil.of("cancel")
        if (tutorialStep >= 4 && currentEntry === STRINGS.EMPTY) {
            if (tutorialPointer == null) {
                tutorialPointer = document.createElement("div")
                tutorialPointer.classList.add("tutorial-pointer")
                document.getElementById("main").appendChild(tutorialPointer)
            }
            tutorialPointer.style.width = document.getElementById("modlist").getBoundingClientRect().width + "px";
            tutorialPointer.style.height = document.getElementById("modlist").getBoundingClientRect().height + "px";
            tutorialPointer.style.borderRadius = "10px"
            tutorialPointer.style.top = (document.getElementById("modlist").getBoundingClientRect().y + (document.getElementById("modlist").getBoundingClientRect().height / 2)) + "px"
            tutorialPointer.style.left = (document.getElementById("modlist").getBoundingClientRect().x + (document.getElementById("modlist").getBoundingClientRect().width / 2)) + "px"
            document.getElementById("tutorial-title").textContent = TranslationUtil.sub("tutorial").sub(4).of("title");
            document.getElementById("tutorial-context").textContent = TranslationUtil.sub("tutorial").sub(4).of("context");
            await confirm(TranslationUtil.sub("tutorial").of("select"))
            return
        }
        tutorialStep++;
        switch (tutorialStep) {
            case 1:
                document.getElementById("tutorial-title").textContent = TranslationUtil.sub("tutorial").sub(1).of("title");
                document.getElementById("tutorial-context").textContent = TranslationUtil.sub("tutorial").sub(1).of("context");
                break;
            case 2:
                if (tutorialPointer == null) {
                    tutorialPointer = document.createElement("div")
                    tutorialPointer.classList.add("tutorial-pointer")
                    tutorialPointer.style.top = (document.getElementById("themeselect").getBoundingClientRect().y + (document.getElementById("themeselect").getBoundingClientRect().height / 2)) + "px"
                    tutorialPointer.style.left = (document.getElementById("themeselect").getBoundingClientRect().x + (document.getElementById("themeselect").getBoundingClientRect().width / 2)) + "px"

                    document.getElementById("main").appendChild(tutorialPointer)
                }
                document.getElementById("tutorial-title").textContent = TranslationUtil.sub("tutorial").sub(2).of("title");
                document.getElementById("tutorial-context").textContent = TranslationUtil.sub("tutorial").sub(2).of("context");
                break;
            case 3:
                if (tutorialPointer == null) {
                    tutorialPointer = document.createElement("div")
                    tutorialPointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorialPointer)
                }
                tutorialPointer.style.width = document.getElementById("covers").getBoundingClientRect().width + "px";
                tutorialPointer.style.height = document.getElementById("covers").getBoundingClientRect().height + "px";
                tutorialPointer.style.borderRadius = "10px"
                tutorialPointer.style.top = (document.getElementById("covers").getBoundingClientRect().y + (document.getElementById("covers").getBoundingClientRect().height / 2)) + "px"
                tutorialPointer.style.left = (document.getElementById("covers").getBoundingClientRect().x + (document.getElementById("covers").getBoundingClientRect().width / 2)) + "px"
                document.getElementById("tutorial-title").textContent = TranslationUtil.sub("tutorial").sub(3).of("title");
                document.getElementById("tutorial-context").textContent = TranslationUtil.sub("tutorial").sub(3).of("context");
                break;
            case 4:
                if (tutorialPointer == null) {
                    tutorialPointer = document.createElement("div")
                    tutorialPointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorialPointer)
                }
                tutorialPointer.style.width = document.getElementById("reddit").getBoundingClientRect().width + "px";
                tutorialPointer.style.height = document.getElementById("reddit").getBoundingClientRect().height + "px";
                tutorialPointer.style.borderRadius = "10px"
                tutorialPointer.style.top = (document.getElementById("reddit").getBoundingClientRect().y + (document.getElementById("reddit").getBoundingClientRect().height / 2)) + "px"
                tutorialPointer.style.left = (document.getElementById("reddit").getBoundingClientRect().x + (document.getElementById("reddit").getBoundingClientRect().width / 2)) + "px"
                document.getElementById("tutorial-title").textContent = TranslationUtil.sub("tutorial").sub(4).of("title");
                document.getElementById("tutorial-context").textContent = TranslationUtil.sub("tutorial").sub(4).of("context");
                break;
            case 5:
                if (tutorialPointer == null) {
                    tutorialPointer = document.createElement("div")
                    tutorialPointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorialPointer)
                }
                tutorialPointer.style.width = document.getElementById("cove").getBoundingClientRect().width + "px";
                tutorialPointer.style.height = document.getElementById("cove").getBoundingClientRect().height + "px";
                tutorialPointer.style.borderRadius = "10px"
                tutorialPointer.style.top = (document.getElementById("cove").getBoundingClientRect().y + (document.getElementById("cove").getBoundingClientRect().height / 2)) + "px"
                tutorialPointer.style.left = (document.getElementById("cove").getBoundingClientRect().x + (document.getElementById("cove").getBoundingClientRect().width / 2)) + "px"
                document.getElementById("tutorial-title").textContent = TranslationUtil.sub("tutorial").sub(5).of("title");
                document.getElementById("tutorial-context").textContent = TranslationUtil.sub("tutorial").sub(5).of("context");
                break;
            case 6:
                if (tutorialPointer == null) {
                    tutorialPointer = document.createElement("div")
                    tutorialPointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorialPointer)
                }
                tutorialPointer.style.width = document.getElementById("modtitle").getBoundingClientRect().width + "px";
                tutorialPointer.style.height = document.getElementById("modtitle").getBoundingClientRect().height + "px";
                tutorialPointer.style.borderRadius = "10px"
                tutorialPointer.style.top = (document.getElementById("modtitle").getBoundingClientRect().y + (document.getElementById("modtitle").getBoundingClientRect().height / 2)) + "px"
                tutorialPointer.style.left = (document.getElementById("modtitle").getBoundingClientRect().x + (document.getElementById("modtitle").getBoundingClientRect().width / 2)) + "px"
                document.getElementById("tutorial-title").textContent = TranslationUtil.sub("tutorial").sub(6).of("title");
                document.getElementById("tutorial-context").textContent = TranslationUtil.sub("tutorial").sub(6).of("context");
                break;
            case 7:
                if (tutorialPointer == null) {
                    tutorialPointer = document.createElement("div")
                    tutorialPointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorialPointer)
                }
                tutorialPointer.style.width = document.getElementById("modinfo").getBoundingClientRect().width + "px";
                tutorialPointer.style.height = document.getElementById("modinfo").getBoundingClientRect().height + "px";
                tutorialPointer.style.borderRadius = "10px"
                tutorialPointer.style.top = (document.getElementById("modinfo").getBoundingClientRect().y + (document.getElementById("modinfo").getBoundingClientRect().height / 2)) + "px"
                tutorialPointer.style.left = (document.getElementById("modinfo").getBoundingClientRect().x + (document.getElementById("modinfo").getBoundingClientRect().width / 2)) + "px"
                document.getElementById("tutorial-title").textContent = TranslationUtil.sub("tutorial").sub(7).of("title");
                document.getElementById("tutorial-context").textContent = TranslationUtil.sub("tutorial").sub(7).of("context");
                break;
            default:
                if (tutorialPointer != null) {
                    tutorialPointer.remove()
                    tutorialPointer = null;
                }
                document.getElementById("tutorial").remove()
                document.getElementById("tutorial-no").style.width = "85%"
                document.getElementById("tutorial-no").textContent = TranslationUtil.of("end")
                document.getElementById("tutorial-title").textContent = TranslationUtil.sub("tutorial").sub(8).of("title");
                document.getElementById("tutorial-context").textContent = TranslationUtil.sub("tutorial").sub(8).of("context");
                break;
        }
    })

    document.getElementById("themeselect").addEventListener("mouseup", async (e) => {
        let next = CLIENT_THEME_ENUM.indexOf(localConfig.config.get("theme")) + (e.button === 0 ? 1 : -1);
        if (next > CLIENT_THEME_ENUM.length - 1) {
            next = 0;
        }
        if (next < 0) {
            next = CLIENT_THEME_ENUM.length - 1;
        }
        play(sound_beep)
        await setTheme(CLIENT_THEME_ENUM[next], false);
    })

    document.getElementById("importimage").addEventListener("mouseup", async () => {
        await invoke("open_path", {
            path: localPath + fileTerminator + terminatePath("store\\images")
        })
    })

    document.getElementById("import").addEventListener("mouseup", async () => {
        play(sound_beep)
        await importMod();
    })

    Logger.log("Finished Loading Listeners (" + (Date.now() - start) + "ms).")
    Logger.log("Loading Intervals.")

    setInterval(keepaliveTicker, 1000)
    setInterval(sendKeepAlive, 300_000)

    document.getElementById("pin-holder").addEventListener("mousedown", async () => {
        if (getLauncher(currentEntry)) {
            dragging = true;
            dragStart = Date.now();
        }
    })

    document.getElementById("pin-holder").addEventListener("mousemove", async (x) => {
        if (currentEntry !== STRINGS.EMPTY && dragging) {
            const absx = document.getElementById("container").getBoundingClientRect().x;
            const absy = document.getElementById("container").getBoundingClientRect().y;
            document.getElementById("pin-holder").style.left = x.clientX - absx + "px";
            document.getElementById("pin-holder").style.top = x.clientY - absy + "px";
            document.getElementById("pin-holder").classList.add("pin-holder-drag")
            Hud.hide("pin-pinned")
            document.getElementById("pin-unpinned").classList.add("pin-unpinned-heart")
            Hud.show("pin-unpinned")
        }
    })

    document.getElementById("pin-holder").addEventListener("mouseup", async (mouse) => {
        dragging = false;
        document.getElementById("pin-holder").classList.remove("pin-holder-drag")

        if (getLauncher(currentEntry)) {
            if (Date.now() - dragStart < 150) {
                document.getElementById("pin-holder").style.removeProperty("left")
                document.getElementById("pin-holder").style.removeProperty("top")
                getLauncher(currentEntry).getFunctions().setPinned()
            } else {
                const minX = document.getElementById("cove").getBoundingClientRect().x;
                const minY = document.getElementById("cove").getBoundingClientRect().y;
                const maxX = minX + document.getElementById("cove").getBoundingClientRect().width;
                const maxY = minY + document.getElementById("cove").getBoundingClientRect().height;

                if (mouse.clientX >= minX && mouse.clientX <= maxX && mouse.clientY >= minY && mouse.clientY <= maxY) {
                    getLauncher(currentEntry).getFunctions().setPinned(true)
                } else {
                    document.getElementById("pin-holder").style.removeProperty("left")
                    document.getElementById("pin-holder").style.removeProperty("top")
                    getLauncher(currentEntry).getFunctions().setPinned(false)
                }
            }
        }
    })

    Logger.log("Finished Loading PT. 1 (" + (Date.now() - start) + "ms).")
    await invoke("request_path")

    let loop = setInterval(async () => {
        if (!reset) {
            await invoke("request_path")
        } else {
            Logger.log("Loading Part 2 Started.")
            clearInterval(loop)
        }
    }, 2000)
}

createApp(App).mount("#app");
document.addEventListener('DOMContentLoaded', onLoad);
