import {createApp} from "vue";
import {create, readDir, readFile, readTextFile, remove, watch, writeFile, writeTextFile} from '@tauri-apps/plugin-fs';
import {open} from '@tauri-apps/plugin-dialog';
import {invoke} from '@tauri-apps/api/core';
import {isDir, isExist, metadata,} from "tauri-plugin-fs-pro-api";
import {homeDir} from "@tauri-apps/api/path";
import {listen} from "@tauri-apps/api/event";
import sound_beep from './assets/select.ogg'
import sound_boop from './assets/hover.ogg'
import sound_click from './assets/pageflip.ogg'
import App from "./App.vue";
import Desktop from "./Desktop.vue";
import jingle from "./assets/jingle_punks_copyrightfree.mp3"
import {getImage} from "./core/ImageUtils"
import ImageLoader from "./workers/ImageLoader.js?worker"

let jingle_audio = new Audio(jingle);
let launchers = []
let currentEntry = ""
let covers = []
let background_cover = 0
let total_time = 0;
let mouse_cover_available = false;
let alert_path = undefined
let selectedPath;
let local_path;
let observer;
let reset = false;
let focused = true;
let localConfig = {
    path: "",
    config: {}
}
let previous_app = null
let preload_covers = {}
let logs = []
let start = Date.now();
let tutorial_complete = false;
let tutorial_step = 0;
let tutorial_pointer = null

const CLIENT_VERSION = "2.3.0-release"
const VERSION_URL = "https://raw.githubusercontent.com/BKunzite/DokiModManager/refs/heads/main/current_ver_beta.txt"
const CLIENT_THEME_ENUM = [
    "NATSUKI", "MONIKA", "YURI", "SAYORI", "WINTER"
]
const CLIENT_THEMES = {
    NATSUKI: {
        primary_color: [254, 179, 188],
        primary_color_saturated: [229, 127, 166],
        image: "chibi_natsuki.png"
    },
    MONIKA: {
        primary_color: [128, 239, 128],
        primary_color_saturated: [118, 138, 118],
        image: "chibi_monika.png"
    },
    YURI: {
        primary_color: [108, 69, 130],
        primary_color_saturated: [52, 24, 55],
        image: "chibi_yuri.png"

    },
    SAYORI: {
        primary_color: [227, 138, 131],
        primary_color_saturated: [192, 100, 107],
        image: "chibi_sayori.webp"

    },
    WINTER: {
        primary_color: [255, 255, 255],
        primary_color_saturated: [150, 150, 150],
        image: "snowflake.svg"
    }
}
const heart_empty = "&#62920;";
const heart_full = "&#62919;";

const TRANSLATION_TABLE = {
    "en": {
        "data": {
            "flag": "english.png",
        },
        "yes": "Yes",
        "no": "No",
        "play": "Play",
        "import-watcher": "Allow this mod to be extracted and imported?",
        "main": "Main",
        "mods": "Mods",
        "search": "Search",
        "import": "Import Mod",
        "greet": "Hiya",
        "install": "Set Install Location",
        "import_image": "Import Image",
        "home": "Home",
        "theme": "Set Theme",
        "update": "Updates (Desktop)",
        "loading": "Loading Mod",
        "description": "Description",
        "screenshot": "Screenshot",
        "update-text": "Update",
        "tutorial-text": "Tutorial",
        "tutorial-context": "It seems like you have not done the tutorial yet, would you like to?",
        "cancel": "Cancel",
        "next": "Next",
        "end": "End",
        "updating": "Updating",
        "tutorial": {
            "select": "Please select a mod, or download one before continuing!",

            1: {
                title: "Welcome!",
                context: "This will be a walk through of how to use Doki Doki Mod Manager. Press 'Next' to continue."
            },
            2: {
                title: "Theme",
                context: "First of all, lets pick a theme. Click on the highlighted button until it is your favorite character."
            },
            3: {
                title: "Background",
                context: "Next, click on a background you would like to use, or drag and drop a image to set as the background."
            },
            4: {
                title: "Downloads",
                context: "Next, download a mod through reddit. You can also drag&drop a zip here. Remember to save to your Downloads folder!"
            },
            5: {
                title: "Covers",
                context: "Use the arrows at the bottom of the selected area to change the cover."
            },
            6: {
                title: "Name",
                context: "Click on the mod title to rename it. Press enter to save."
            },
            7: {
                title: "Author",
                context: "Click on the author (underlined text) to set it. Press enter to save."
            },
            8: {
                title: "Finish",
                context: "And that is it! Press 'Play' To Start The Mod. Press 'End' To Finish The Tutorial."
            }
        }
    },
    "es": {
        "data": {
            "flag": "spain.png",
        },
        "yes": "Sí",
        "no": "No",
        "play": "Jugar",
        "import-watcher": "¿Permitir que este mod se extraiga e importe?",
        "main": "Principal",
        "search": "Buscar",
        "import": "Importar Mod",
        "mods": "Mods",
        "greet": "¡Hola!",
        "install": "Establecer Ubicación de Instalación",
        "import_image": "Importar Imagen",
        "home": "Inicio",
        "theme": "Establecer Tema",
        "update": "Actualizaciones (Escritorio)",
        "loading": "Cargando Mod",
        "description": "Descripción",
        "screenshot": "Captura de Pantalla",
        "update-text": "Actualizar",
        "tutorial-text": "Guía",
        "tutorial-context": "Parece que aún no has completado el tutorial, ¿te gustaría hacerlo?",
        "cancel": "Cancelar",
        "next": "Siguiente",
        "end": "Terminar",
        "updating": "Actualizar",
        "tutorial": {
            "select": "Por favor, selecciona un mod o descarga uno antes de continuar!",
            1: {
                title: "¡Bienvenido!",
                context: "Este será un recorrido sobre cómo usar Doki Doki Mod Manager. Presiona 'Siguiente' para continuar."
            },
            2: {
                title: "Tema",
                context: "En primer lugar, elijamos un tema. Haz clic en el botón resaltado hasta que sea tu personaje favorito."
            },
            3: {
                title: "Fondo",
                context: "A continuación, haz clic en el fondo que quieras usar, o arrastra y suelta una imagen para establecerla como fondo."
            },
            4: {
                title: "Descargas",
                context: "Luego, descarga un mod a través de Reddit. También puedes arrastrar y soltar un archivo zip aquí. ¡Recuerda guardarlo en tu carpeta de Descargas!"
            },
            5: {
                title: "Portadas",
                context: "Usa las flechas en la parte inferior del área seleccionada para cambiar la portada."
            },
            6: {
                title: "Nombre",
                context: "Haz clic en el título del mod para cambiarle el nombre. Presiona Enter para guardar."
            },
            7: {
                title: "Autor",
                context: "Haz clic en el autor (texto subrayado) para establecerlo. Presiona Enter para guardar."
            },
            8: {
                title: "Finalizar",
                context: "¡Y eso es todo! Presiona 'Jugar' para iniciar el mod. Presiona 'Terminar' para finalizar el tutorial."
            }
        }
    }
};

let translation_lan = ""
let translation = TRANSLATION_TABLE["en"];

// Load Translation

function loadTranslation(lang, first) {
    if (TRANSLATION_TABLE[lang] === undefined) lang = "en";
    translation = TRANSLATION_TABLE[lang] || TRANSLATION_TABLE["en"];
    translation_lan = lang;

    const elementMap = [
        { id: "main-text", key: "main", type: "textContent" },
        { id: "search", key: "search", type: "placeholder" },
        { id: "source-text", key: "install", type: "textContent" },
        { id: "import-text", key: "import", type: "textContent" },
        { id: "import-image-text", key: "import_image", type: "textContent" },
        { id: "description-text", key: "description", type: "textContent" },
        { id: "screenshot-text", key: "screenshot", type: "textContent" },
        { id: "download", key: "yes", type: "textContent" },
        { id: "mods-text", key: "mods", type: "textContent" },
        { id: "cancel", key: "no", type: "textContent" },
        { id: "theme-text", key: "theme", type: "textContent" },
        { id: "update-text", key: "update-text", type: "textContent" },
        { id: "play", key: "play", type: "textContent" },
        { id: "home-text", key: "home", type: "textContent" },
    ];

    if (!tutorial_complete) {
        document.getElementById("tutorial-title").textContent = tutorial_step === 0 ? translation["tutorial-text"] : translation.tutorial[tutorial_step].title;
        document.getElementById("tutorial-context").textContent = tutorial_step === 0 ? translation["tutorial-context"] : translation.tutorial[tutorial_step].context;
        if (tutorial_pointer == null) {
            if (tutorial_step === 8) {
                document.getElementById("tutorial-no").textContent = translation.end
            } else {
                document.getElementById("tutorial").textContent = translation.next
                document.getElementById("tutorial-no").textContent = translation.cancel
            }
        } else {
            document.getElementById("tutorial").textContent = translation.yes
            document.getElementById("tutorial-no").textContent = translation.no
        }
    }

    for (let i = 0; i < elementMap.length; i++) {
        const element = document.getElementById(elementMap[i].id);
        if (element) {
            element[elementMap[i]["type"]] = translation[elementMap[i].key];
        }
    }

    getImage(translation["data"]["flag"], {}).then(url => {
        document.getElementById("language-flag").src = url
    });
    document.getElementById("language-text").textContent = lang;

    if (currentEntry === "") {
        if (!first) {
            home_main().then()
        }
    } else {
        launchers[currentEntry].leftClick().then();
    }
}

// Preload Images

function preloadImage(src) {
    return new Promise(async (resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.src = await getImage(src, covers);
        img.onload = () => resolve(img);
        img.onerror = reject;
    });
}

// Appends Message To User Console

async function globLog(msg) {
    console.log(msg)
    await addConstant(msg, false, Date.now())
}

async function globWarn(msg) {
    console.warn(msg)
    await addConstant(msg, true, Date.now())
}

async function addConstant(msg, isWarn, timestamp) {
    logs.push({
        msg: msg,
        isWarn: isWarn,
        timestamp: timestamp
    })
}

// Removes Right Click Menu

document.oncontextmenu = document.body.oncontextmenu = function() {
    return false;
}

// Updates the list of covers
async function sync_covers() {
    covers = [
        "house.webp",
        "wallpapers.png",
        "natsuki.jpg",
        "yuri.jpg",
        "sayori.jpg",
        "monika.png"
    ]
    preload_covers = {}
    for (const cover of covers) {
        preload_covers[cover] = await preloadImage(cover);
    }
    if (await isDir(local_path + "\\store\\images")) {
        for (const image of await readDir(local_path + "\\store\\images")) {
            if (image.name.endsWith(".png") || image.name.endsWith(".jpg") || image.name.endsWith(".jpeg") || image.name.endsWith(".webp")) {
                const path = local_path + "\\store\\images" + "\\" + image.name;
                covers.push(path);
                preload_covers[path] = await preloadImage(path);
            }
        }
    }

}

// Gets The Current Client Version From Github

async function getVersion() {
    try {
        const response = await fetch(VERSION_URL)

        if (!response.ok) {
            console.warn(`Client Version Check Failed! Returned Status ${response.status}`)
            return CLIENT_VERSION;
        }

        const version = await response.text();
        return version.trim()
    } catch (error) {
        console.warn(`Client Version Check Failed! Error with: ${error}`)
    }
    return CLIENT_VERSION;
}

// Loads local config which includes background cover id
// and the total amount of time you have played mods
//
// Also includes whether it has warned you to
// save downloads to the users download folder

async function loadConfig(path) {
    let hasConfig = false;
    let configPath = path + "\\client-config.json";
    const localFiles = await readDir(path);
    let configData = {
        coverId: 0,
        totalTime: 0,
        warn_path: false,
        tutorial: false,
        theme: "NATSUKI",
        language: "",
        version: "0.0.0-release"
    }

    local_path = path;

    // Detects Config

    for (const localEntry of localFiles) {
        if (localEntry.name === "client-config.json") {
            hasConfig = true;
            break;
        }
    }

    if (!hasConfig) {
        if (selectedPath !== "" && selectedPath !== undefined) {
            for (const entry of await readDir(selectedPath)) {
                if (entry.isDirectory) {
                    const localFiles2 = await readDir(selectedPath + "\\" + entry.name);
                    let hasConfig2 = false;
                    let configPath2 = selectedPath + "\\" + entry.name + "\\.ddmm.config.json";
                    for (const localEntry of localFiles2) {
                        if (localEntry.name === ".ddmm.config.json") {
                            hasConfig2 = true;
                            break;
                        }
                    }
                    if (hasConfig2) {
                        let kconfigData = {
                            author: "unknown",
                            time: 0,
                            size: 0,
                            favorite: false,
                            coverId: 0
                        }
                        kconfigData = JSON.parse(await readTextFile(configPath2));
                        if (!isNaN(kconfigData.time)) {
                            total_time += kconfigData.time;
                        }
                    }
                }
            }
            configData.totalTime = total_time;
        }
        await create(configPath)
        const contents = JSON.stringify(configData);
        await writeTextFile(configPath, contents);
    } else {
        configData = JSON.parse(await readTextFile(configPath));
    }

    configData.theme = configData.theme || "NATSUKI";
    configData.coverId = configData.coverId || 0;
    configData.totalTime = configData.totalTime || 0;
    configData.tutorial = configData.tutorial || false;
    configData.version = configData.version || "0.0.0-release";
    configData.language = configData.language || "";

    console.log("Cover Id: " + configData.coverId)

    localConfig = {
        path: configPath,
        config: configData
    }

    total_time = configData.totalTime;
    background_cover = configData.coverId;
    tutorial_complete = configData.tutorial;
    translation_lan = configData.language;

    if (tutorial_complete) {
        document.getElementById("warn").remove()
    }
}

// Resets and updates the list of cover images

async function update_cover_images(first_time) {
    await sync_covers()
    const images = document.getElementById("images")

    for (const cover of document.querySelectorAll(".covers-cover")) {
        cover.remove()
    }

    for (let i = covers.length - 1; i >= 0; i--) {
        const cover_bg = document.createElement("div");
        const cover_img = preload_covers[covers[i]].cloneNode(true);
        const cover_text = document.createElement("button");

        cover_img.classList.add("covers-image");

        cover_bg.classList.add("covers-cover");

        cover_text.classList.add("covers-text");
        cover_text.innerHTML = "&#60450;"

        cover_img.addEventListener("mouseup", () => {
            background_cover = i;
            setCover(background_cover)
        })

        if (i > 5) {

            cover_text.addEventListener("mouseup", () => {
                remove(covers[i]);
                covers.splice(i, 1);
                console.log(covers)
                setTimeout(async () => {
                    let scroll = images.scrollLeft;
                    await update_cover_images()
                    await setCover(background_cover);
                    images.scrollLeft = scroll;
                }, 100)
            })
            cover_bg.appendChild(cover_text);
        }

        cover_bg.appendChild(cover_img);
        images.appendChild(cover_bg);
    }

    if (first_time) {
        setTimeout(async () => {
            images.scrollLeft = -1000000000;
        }, 100)
    }
}

// Saves config to file (./client-config.json)

async function saveConfig(a) {
    console.log("Saving Config" + a)
    localConfig.config.coverId = background_cover;
    localConfig.config.totalTime = total_time;
    localConfig.config.version = CLIENT_VERSION;
    localConfig.config.tutorial = tutorial_complete;
    localConfig.config.language = translation_lan;
    await writeTextFile(localConfig.path, JSON.stringify(localConfig.config))
}

// Plays interaction sounds

function play(song) {
    var beep = new Audio(song)
    beep.volume = 0.5;

    beep.play()
}

// Import Requested Mod Or Prompts User To Select Mod

async function import_mod(path) {
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
        await invoke('tracker', {
            event: 'manual_download',
            props: { name: selectedPath.split("\\").pop() }
        });
    }
    if (selectedPath != null) {
        if (selectedPath.endsWith(".zip") || selectedPath.endsWith(".rar") || selectedPath.endsWith("scripts.rpa")) {
            document.getElementById("loader").classList.remove("hide")
            document.getElementById("main").classList.add("hide")
            document.getElementById("loadingsub").textContent = "Importing Mod " + selectedPath
            alert_path = selectedPath;
            showContainers(false)
            await invoke("import_mod", {
                path: selectedPath
            })
        } else {
            confirm("Not A Zip File!")
        }
    }
}

// Sets Cover Images/Background Image

async function setCover(id) {
    if (id > covers.length - 1) {
        id = 0;
    }

    let image = await getImage(id, covers)

    document.getElementById("cove").style.backgroundImage = 'url("' + image + '")';

    if (currentEntry === "") {
        document.getElementById("bg").style.backgroundImage = 'url("' + image + '")';
        background_cover = id;
        await saveConfig()
    }
}

// Sets Client Theme Color

async function setTheme(name, first) {
    if (!(name in CLIENT_THEMES)) {
        name = "NATSUKI";
    }

    document.getElementById("chibi").src = await getImage(CLIENT_THEMES[name].image, covers);
    document.body.style.setProperty("--primary-color", CLIENT_THEMES[name].primary_color)
    document.body.style.setProperty("--primary-color-saturated", CLIENT_THEMES[name].primary_color_saturated)

    localConfig.config.theme = name
    if (!first) {
        await saveConfig()
    }
}

// Gets An Image Locally/In Project

function createScreenshotDiv(src, entryName, dir, image, entry) {
    const newScreenshot = document.createElement("img")
    const cover_text = document.createElement("button");
    const path_text = document.createElement("button");

    const cover_bg = document.createElement("div");
    newScreenshot.decoding = "async"
    newScreenshot.classList.add("screenshots-image")
    newScreenshot.src = src;
    newScreenshot.addEventListener("mouseup", () => {
        document.getElementById("view-image").src = src;
        document.getElementById("view-image").classList.add("zoom")
        document.getElementById("view-background").classList.remove("hide")
    })
    cover_text.addEventListener("click", async () => {
        await remove(dir + "\\" + image);
        await launchers[entryName].leftClick();
        if (entry.preload[image]) {
            await launchers[entry].preloadImages()
        }
    })
    path_text.addEventListener("click", async () => {
        await launchers[entryName].path();
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

// Requests DDLC Directory and Updates Mods

async function requestDirectory(path) {
    let ppath = undefined;
    if (path === undefined) {
        ppath = await open({
            directory: true,
            multiple: false,
            title: 'Select Your DDLC Directory'
        });
        if (ppath === null || ppath === undefined) {
            return
        }
        selectedPath = ppath;
        await invoke("path_select", {
            path: selectedPath
        })
    } else {
        selectedPath = path;
    }
    if (ppath !== undefined || selectedPath !== undefined) {
        if (ppath !== undefined) {
            selectedPath = ppath;
        }

        for (const element in launchers) {
            launchers[element]["item"].remove();
        }

        launchers = []
        const files = await readDir(selectedPath);

        document.getElementById("search").value = ""
        document.getElementById("loader").classList.remove("hide")
        document.getElementById("main").classList.add("hide")
        document.getElementById("nummods").textContent = files.length;

        // Update Mods List

        for (const entry of files) {
            document.getElementById("loadingsub").textContent = translation.loading + " " + entry.name.replace("ddlc-", "").replace("ddlc", "").replace("-", "")
            if (entry.isDirectory) {
                const localFiles = await readDir(selectedPath + "\\" + entry.name);

                // Find Correct Directory

                let dir = selectedPath + "\\" + entry.name;
                let isInDir = false;
                for (const localEntry of localFiles) {
                    if (localEntry.name === "DDLC.exe" || localEntry.name === "renpy") {
                        isInDir = true;
                        break;
                    }
                }

                if (!isInDir) {
                    dir = selectedPath + "\\" + entry.name + "\\DDLC-1.1.1-pc"
                    if (await isDir(dir)) {
                        for (const localEntry of await readDir(dir)) {
                            if (localEntry.name === "DDLC.exe" || localEntry.name === "renpy") {
                                isInDir = true;
                                break;
                            }
                        }
                    }
                }

                if (!isInDir) {
                    globWarn(dir + " Does Not Contain DDLC.exe")
                    continue;
                }

                // Create SideButton And Load Config

                let hasConfig = false;
                let configPath = selectedPath + "\\" + entry.name + "\\.ddmm.config.json";
                for (const localEntry of localFiles) {
                    if (localEntry.name === ".ddmm.config.json") {
                        hasConfig = true;
                        break;
                    }
                }

                let configData = {
                    author: "unknown",
                    time: 0,
                    size: 0,
                    favorite: false,
                    coverId: 0
                }

                if (!hasConfig) {
                    await create(configPath)
                    const data = await metadata(selectedPath + "\\" + entry.name);
                    const contents = JSON.stringify(configData);
                    configData.size = data.size;
                    await writeTextFile(configPath, contents);
                } else {
                    configData = JSON.parse(await readTextFile(configPath));
                }

                if (configData.coverId === undefined || configData.coverId === null) {
                    configData.coverId = 0;
                }

                let shorthand = entry.name.replace("ddlc-", "").replace("ddlc", "").replace("-", " ");
                const sidetext = document.createElement("header");
                const normalText = "<span style=\"font-family: Icon,serif\">&#60810;</span><span style='padding-left: 1vw'></span>" + "<span class='sidebutton-text'>" + shorthand + "</span>";
                const faveText = "<span style=\"font-family: Icon,serif\">&#60938;</span><span style='padding-left: 1vw'></span>" + "<span class='sidebutton-text'>" + shorthand + "</span>";

                let launch_time = Date.now();
                sidetext.classList.add("sidebutton");
                if (configData.favorite) {
                    sidetext.classList.add("favorite")
                }
                sidetext.id = shorthand;
                if (configData.favorite) {
                    sidetext.innerHTML = faveText
                } else {
                    sidetext.innerHTML = normalText
                }

                observer.observe(sidetext);
                launchers[entry.name] = {
                    item: sidetext,
                    location: selectedPath + "\\" + entry.name,
                    preload: [],
                    preloadImages: async () => {
                        let images = 0;
                        launchers[entry.name].preload = {}

                        for (const localEntry of await readDir(dir)) {
                            if (localEntry.name.includes("screenshot")) {
                                launchers[entry.name].preload[localEntry.name] = await createScreenshotDiv(await getImage(dir + "\\" + localEntry.name, []), entry.name, dir, localEntry.name, entry.name);
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
                        const contents = JSON.stringify(configData);
                        await writeTextFile(configPath, contents);
                    },
                    getPath: async () => {
                        return selectedPath
                    },
                    getName: async () => {
                        return entry.name
                    },
                    open: async () => {
                        await invoke('tracker', {
                            event: 'game_launch',
                            props: { mod: entry.name }
                        });
                        showContainers(false)
                        await update_concurrent_game()
                        document.getElementById("pill").classList.remove("hide")
                        setTimeout(async () => {
                            play(sound_beep)
                            launch_time = Date.now();
                            let exes = []
                            const dirFiles = await readDir(dir);

                            let gameExe = "";

                            for (const localEntry of dirFiles) {
                                if (localEntry.name.endsWith(".exe") && !localEntry.name.endsWith("-32.exe")) {
                                    exes.push(localEntry.name);
                                }
                            }
                            if (exes.length > 1) {
                                for (const localEntry of exes) {
                                    if (localEntry !== "DDLC.exe") {
                                        gameExe = localEntry;
                                        break;
                                    }
                                }
                            } else if (exes.length === 1) {
                                gameExe = exes[0];
                            } else {
                                console.error("Game Exe Not Found!")
                            }

                            if (gameExe !== "") {
                                await invoke("launch", {
                                    path: dir + "\\" + gameExe,
                                    id: entry.name,
                                    renpy: await getRenpy(dir)
                                })
                            }
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
                    nextCover: async () => {
                        configData.coverId++;
                        if (configData.coverId > covers.length - 1) {
                            configData.coverId = 0;
                        }
                        const contents = JSON.stringify(configData);
                        await writeTextFile(configPath, contents);
                        await setCover(configData.coverId);
                    },
                    lastCover: async () => {
                        configData.coverId--;
                        if (configData.coverId < 0) {
                            configData.coverId = covers.length - 1;
                        }
                        const contents = JSON.stringify(configData);
                        await writeTextFile(configPath, contents);
                        await setCover(configData.coverId);
                    },
                    oncove: async () => {
                        configData.favorite = !configData.favorite;
                        sidetext.classList.toggle("favorite", configData.favorite)
                        if (configData.favorite) {
                            sidetext.innerHTML = faveText
                        } else {
                            sidetext.innerHTML = normalText
                        }
                        const contents = JSON.stringify(configData);
                        await writeTextFile(configPath, contents);
                        document.getElementById("covertext").innerHTML = configData.favorite ? heart_full : heart_empty;
                    },
                    close: async () => {
                        if (alert_path === undefined) {
                            showContainers(true)
                        }
                        play(sound_click)
                        const playTime = Date.now() - launch_time;
                        total_time += playTime;
                        configData.time += playTime;
                        const data = await metadata(selectedPath + "\\" + entry.name);
                        const contents = JSON.stringify(configData);
                        configData.size = data.size;
                        document.getElementById("pill").classList.add("hide")
                        await writeTextFile(configPath, contents);
                        await saveConfig()
                        await launchers[entry.name].leftClick();
                    },
                    leftClick: async () => {
                        currentEntry = entry.name;
                        await setCover(configData.coverId);

                        const fdirFiles = await readDir(dir);
                        let customExe;
                        let about;
                        let renpy = await getRenpy(dir);
                        let screenshots = false;
                        let images = []

                        while (document.getElementById("screenshots").firstChild) {
                            document.getElementById("screenshots").firstChild.remove();
                        }

                        for (const localEntry of fdirFiles) {
                            if (localEntry.name.endsWith(".exe") && !localEntry.name.endsWith("-32.exe") && localEntry.name !== "DDLC.exe" && customExe === undefined) {
                                customExe = localEntry.name;
                            }
                            if (localEntry.name.toLowerCase().includes("credit") && about === undefined) {
                                about = (await readTextFile(dir + "\\" + localEntry.name)).replaceAll("\n", "<br>");
                            }
                            if (localEntry.name.includes("screenshot")) {
                                screenshots = true;
                                if (launchers[entry.name].preload[localEntry.name] !== undefined) {
                                    document.getElementById("screenshots").appendChild(launchers[entry.name].preload[localEntry.name]);
                                    continue;
                                }
                                images.push(
                                    localEntry.name
                                )

                            }
                        }



                        if (renpy === undefined) {
                            renpy = "Unknown (Please create a git issue on this)";
                        }

                        if (configData.size === 0) {
                            const data = await metadata(selectedPath + "\\" + entry.name);
                            configData.size = data.size;
                        }
                        renpy = entry.name + "<br>Renpy: " + renpy + "<br>Custom Exe: " + (customExe !== undefined ? "Yes | " + customExe : "No") + "<br><br>Credits: <br>" + (about !== undefined ? about : "None Found!");
                        document.getElementById("covertext").innerHTML = configData.favorite ? heart_full : heart_empty;
                        play(sound_boop)
                        const min = Math.floor(configData.time / 60000);
                        updateDisplayinfo(entry.name, configData.author, Math.floor(configData.size / 1048600) + " MB", Math.floor(min / 60) + "h " + Math.floor(min % 60) + "m", renpy).then()
                        if (!screenshots) {
                            document.getElementById("screenshots-header").classList.add("hide")
                            document.getElementById("screenshots-parent").classList.add("hide")
                            document.getElementById("info").classList.remove("info")
                            document.getElementById("info").classList.add("expanded")
                            document.getElementById("setinfo-header").style.left = "16rem";
                        } else {
                            document.getElementById("screenshots").scrollLeft = 0;
                            const image_loader = images.map(async (image) => {
                                const worker = new ImageLoader();

                                worker.onmessage = (e) => {
                                    if (currentEntry !== entry.name) return;
                                    document.getElementById("screenshots").appendChild(
                                        createScreenshotDiv(e.data, entry.name, dir, image, entry.name)
                                    );
                                }
                                worker.postMessage({
                                    image: await readFile(dir + "\\" + image)
                                })
                            })
                            await Promise.all(image_loader);
                            document.getElementById("screenshots-header").classList.remove("hide")
                            document.getElementById("screenshots-parent").classList.remove("hide")
                            document.getElementById("info").classList.remove("expanded")
                            document.getElementById("info").classList.add("info")
                            document.getElementById("setinfo-header").style.left = "30rem";
                        }
                    }
                }
                await launchers[entry.name].preloadImages();

                sidetext.addEventListener("mouseup", async () => {
                    await launchers[entry.name].leftClick();
                })

                document.getElementById("modlist").appendChild(sidetext)
            }
        }
        await globLog("finish")
        document.getElementById("loadingsub").textContent = "Loaded Mods | Loading GUI"

        setTimeout(() => {
            play(sound_click)
            document.getElementById("loader").classList.add("hide")
            document.getElementById("main").classList.remove("hide")
        }, 500)
    }

}

// Gets RenPy Version

async function getRenpy(dir) {
    let renpy;
    const dirFiles = await readDir(dir + "\\renpy");
    for (const localEntry of dirFiles) {
        if (localEntry.name === "__init__.py") {
            const code = await readTextFile(dir + "\\renpy\\" + localEntry.name);
            const lines = code.split("\n");
            for (const line of lines) {
                if (line.startsWith("version_tuple = ") && !line.includes("*")) {
                    renpy = (line + "").replace("version_tuple = (", "").replace(", vc_version)", "").replaceAll(", ", ".");
                    break;
                } else if (line.trim().startsWith("version_tuple = ") && line.trim().includes("(8") && !line.includes("*")) {
                    renpy = (line.trim() + "").replace("version_tuple = ", "").replace("VersionTuple", "").replace("(", "").replace(", vc_version)", "").replaceAll(", ", ".");
                    break;
                }
            }
        }
        if (localEntry.name === "vc_version.py" && renpy === undefined) {
            const code = await readTextFile(dir + "\\renpy\\" + localEntry.name);
            const lines = code.split("\n");
            for (const line of lines) {
                if (line.startsWith("version = ")) {
                    renpy = (line + "").replace("version = ", "").replaceAll("'", "").replace("u", "");
                    break;
                }
            }
        }

    }
    return renpy
}

// Hide/Show Container

function showContainers(show) {
    if (show) {
        if (tutorial_pointer != null) {
            document.getElementById("warn").classList.remove("hide")
            tutorial_pointer.classList.remove("hide")
            document.getElementById("tutorial").dispatchEvent(new MouseEvent("mouseup", {}))
        }
        document.getElementById("modlist").classList.remove("hide")
        document.getElementById("container-boarder").classList.remove("hide")
        document.getElementById("container-shadow").classList.remove("hide")
        document.getElementById("search").classList.remove("hide")
        document.getElementById("container").classList.remove("hide")

    } else {
        if (tutorial_pointer != null) {
            document.getElementById("warn").classList.add("hide")
            tutorial_pointer.classList.add("hide")
        }
        document.getElementById("modlist").classList.add("hide")
        document.getElementById("container-boarder").classList.add("hide")
        document.getElementById("container-shadow").classList.add("hide")
        document.getElementById("search").classList.add("hide")
        document.getElementById("container").classList.add("hide")
    }
}

function getTextWidth(text, font) {
    const canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
}

// Updates Information On Main Window

async function updateDisplayinfo(mod, author, space, time, renpy) {
    document.getElementById("modtitle").value = mod.replace("ddlc-", "").replace("ddlc", "").replace("-", " ")

    document.getElementById("modtitle").classList.remove("hide");
    document.getElementById("modinfo").classList.remove("hide");
    document.getElementById("cove").classList.remove("hide");

    if (author.length > 0) {
        currentEntry = mod;
        document.getElementById("covers").classList.add("hide");
        document.getElementById("setinfo-header").classList.remove("hide");
        document.getElementById("info").classList.remove("hide");
        if (renpy !== undefined) {
            document.getElementById("info").innerHTML = renpy;
        } else {
            document.getElementById("info").textContent = "No Information Found!";
        }
        document.getElementById("delete").classList.remove("hide");
        document.getElementById("path").classList.remove("hide");
        document.getElementById("play").classList.remove("hide");
        document.getElementById("optionsmenu").classList.add("hide");
        document.getElementById("modinfo").innerHTML = "<span style=\"font-family: Icon,serif;\">&#60899;</span><input class='author-header' autocomplete='off' spellcheck='false' id='authinput' placeholder='" + author + "'><span style=\"font-family: Icon; padding-left: 20px;\">&#60766;</span>" + space + " <span style=\"font-family: Icon; padding-left: 20px;\">&#61973;</span> " + time;
        document.getElementById("authinput").style.width = Math.min(getTextWidth(author, "normal 1rem Aller"), 225) + "px"
        document.getElementById("authinput").addEventListener("input", async (e) => {
            document.getElementById("authinput").style.width = Math.min(getTextWidth(e.target.value, "normal 1rem Aller"), 225) + "px"
        })
        document.getElementById("authinput").addEventListener("blur", async () => {
            await setauthor();
        })
        document.getElementById("authinput").addEventListener("keydown", async (e) => {
            if (e.key === "Enter") {
                document.getElementById("authinput").blur();
            }
        })
    } else {
        currentEntry = ""
        await setCover(background_cover)
        let min = Math.floor(total_time / 60000);
        document.getElementById("screenshots-header").classList.add("hide");
        document.getElementById("screenshots-parent").classList.add("hide");
        document.getElementById("covers").classList.remove("hide");
        document.getElementById("setinfo-header").classList.add("hide");
        document.getElementById("info").classList.add("hide");
        document.getElementById("delete").classList.add("hide");
        document.getElementById("path").classList.add("hide");
        document.getElementById("play").classList.add("hide");
        document.getElementById("optionsmenu").classList.remove("hide");
        document.getElementById("modinfo").innerHTML = "<span style=\"font-family: Icon,serif;\">&#60899;</span> Kunzite <span style=\"font-family: Icon,serif; padding-left: 20px;\">&#61973;</span> " + Math.floor(min / 60) + "h " + (min % 60) + "m";
    }
}

// Sets Home Screen To Main

async function home_main() {
    // await updateDisplayinfo("Hi " + (await invoke("whois", {})) + "!", "", "", "") -- This could leak the users full name; deprecated
    document.getElementById("covertext").innerHTML = ""
    await updateDisplayinfo(translation.greet + " " + (await homeDir()).replace("C:\\Users\\", "") + "!", "", "", "")
}

// Sets Author Of Mod And Saves To File

async function setauthor() {
    if (currentEntry === "") return;
    document.getElementById("authinput").blur()
    var value = document.getElementById("authinput").value.trimEnd();
    console.log(value)
    if (value === "") {
        const author = (await launchers[currentEntry].getData()).author;
        document.getElementById("authinput").value = author;
        document.getElementById("authinput").placeholder = author;
        document.getElementById("authinput").style.width = Math.min(getTextWidth(author, "normal 1rem Aller"), 225) + "px"

    } else {
        await launchers[currentEntry].setAuthor(value);
        await launchers[currentEntry].leftClick();
    }
}

// Keep Alive

async function keepAlive() {
    await invoke('tracker', {
        event: 'keep_alive',
        props: { name: currentEntry }
    });
}

// Updates Screen With Game Open

async function update_concurrent_game() {
    if (!document.getElementById("loader").classList.contains("hide")) return;
    if (!document.getElementById("modlist").classList.contains("hide") || alert_path !== undefined) {
        if (!document.getElementById("pill").classList.contains("hide")) {
            document.getElementById("pill").classList.add("hide")
        }
        return
    }

    if (document.getElementById("pill").classList.contains("hide")) {
        document.getElementById("pill").classList.remove("hide")
    }

    const playTime = await launchers[currentEntry].get_time();
    const second = Math.floor(playTime / 1000) % 60;
    const min = Math.floor(playTime / 60000);
    const name = await launchers[currentEntry].getName() + " ";
    const author = (await launchers[currentEntry].getData()).author;
    const time = Math.floor(min / 60) + "h " + (min % 60) + "m " + second + "s";

    document.getElementById("pill-game").textContent = name
    document.getElementById("pill-author").textContent = author
    document.getElementById("pill-time").textContent = time
}

// Snowflake Animation

async function snowflake() {
    if (!focused) return;
    const snowflake = document.createElement("div");
    const x = Math.floor(Math.random() * window.innerWidth);
    const size = Math.random() * 30 + 20;
    const speed = Math.random() * 5 + 2;
    snowflake.style.left = x + "px";
    snowflake.style.width = size + "px";
    snowflake.style.height = size + "px";
    snowflake.classList.add("snowflake");
    snowflake.style.transition = "top " + speed + "s linear, rotate " + speed + "s ease";
    snowflake.style.rotate = Math.floor(Math.random() * 360) + "deg";
    snowflake.style.opacity = Math.random() * 0.5 + 0.5;
    document.body.appendChild(snowflake);

    setTimeout(() => {
        snowflake.style.top = "100%"
        snowflake.style.rotate = Math.floor(Math.random() * 360) + "deg";
        if (Math.random() > 0.5) {
            snowflake.style.zIndex = "-1"
        }
    }, 250)

    setTimeout(() => {
        snowflake.remove()
    }, 250 + (speed * 1100))
}

// Renames Mod

async function rename_mod() {
    if (currentEntry === "") return;
    var value = document.getElementById("modtitle").value;
    var name = await launchers[currentEntry].getName();

    if (value !== name && value.length !== 0) {

        var oldName = (await launchers[currentEntry].getPath()) + "\\" + name;
        var newName = (await launchers[currentEntry].getPath()) + "\\" + value;

        try {
            if (/\\/.test(value) || value.includes("/")) {
                throw Error("Invalid Name!")
            }
            document.getElementById("loader").classList.remove("hide")
            document.getElementById("main").classList.add("hide")
            document.getElementById("loadingsub").textContent = "Renaming Mod"
            await invoke("rename_dir", {
                path: oldName,
                newName: newName,
                id: value
            })
        } catch (e) {
            if (e == "Error: Invalid Name!") {
                confirm("The Name '" + value + "' is invalid!")
            } else {
                confirm("Cannot Rename The File Due To:\n\n" + e)
            }
        }

    }
}

// Waits For Webpage To Load

async function onLoad() {
    let start = Date.now();

    await globLog("[MARKER] Debugger Attached.")
    await globLog("Loading Observers...")

    // Listens For Rename Finishing

    listen("rename_done", async (event) => {
        await requestDirectory(selectedPath)
        while (document.getElementById("loader").classList.contains("hide")) {}
        const value = event.payload.text;
        await globLog(value)
        if (launchers[value]) {
            await launchers[value].leftClick();
        }
    })

    // Used for sidebar animations

    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("sidevisible");
            } else {
                entry.target.classList.remove("sidevisible");
            }
        });
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

    listen("import_done", async (event) => {
        console.log(alert_path)
        if (alert_path.includes("\\Downloads\\")) {
            await remove(alert_path);
        }
        document.getElementById("loadingsub").textContent = "Mod Imported | Loading GUI"
        setTimeout(() => {
            if (alert_path !== undefined) {
                remove(alert_path)
                alert_path = undefined;
            }
        })
        await requestDirectory(selectedPath)
        let goal = event.payload.text;
        if (launchers[goal]) {
            launchers[goal].leftClick();
        } else {
            globWarn(goal + " Not Found!")
        }
        alert_path = undefined;
        showContainers(true)

    })

    // Opens Up A Spreadsheet Full Of DDLC Mods

    document.getElementById("spreadsheet").addEventListener("mouseup", async () => {


        play(sound_beep)

        window.open("https://docs.google.com/spreadsheets/d/1lgQD8o7qhdWmrwdJjbRv3u_bwdrXmpOzaixWFzLR8r4/edit?usp=sharing", 'reddit', 'width=1200,height=600')
    })

    // Opens Up DDLCMods Subreddit

    document.getElementById("reddit").addEventListener("mouseup", async () => {

        play(sound_beep)

        window.open("https://www.reddit.com/r/DDLCMods/", 'reddit', 'width=1200,height=600')
    })

    // Opens up DokiMods

    document.getElementById("dokimods").addEventListener("mouseup", async () => {

        play(sound_beep)

        window.open("https://dokimods.me/", 'dokimods', 'width=1200,height=600')
    })

    // Cancels Mod Install

    document.getElementById("cancel").addEventListener("mouseup", async () => {
        play(sound_beep)
        showContainers(true)
        alert_path = undefined;
        document.getElementById("alert").classList.add("hide")

    })

    // Opens Up Path Of The Mod That Is Installing

    document.getElementById("sub3").addEventListener("mouseup", async () => {
        await invoke("open_path", {
            path: alert_path
        })
    })

    // Accept Mod Download

    document.getElementById("download").addEventListener("mouseup", async () => {
        if (alert_path !== undefined) {
            play(sound_beep)
            document.getElementById("alert").classList.add("hide")
            await invoke('tracker', {
                event: 'auto_download',
                props: { name: alert_path.split("\\").pop() }
            });
            await import_mod(alert_path)
        }
    })

    globLog("Finished Loading Observers. Took " + (Date.now() - start) + "ms.")
    globLog("Loading Defaults...")

    document.getElementById("loader").classList.remove("hide")
    document.getElementById("main").classList.add("hide")
    document.getElementById("loadingsub").textContent = "Installing DDLC-Vanilla (If nothing happens after 10s, please restart the program)"

    globLog("Loading Drag/Drop")

    // Drag Drop Handling
    // This is for dragging and dropping images and mods

    listen('tauri://drag-drop', async (event) => {
        let paths = event.payload.paths;
        for (const path of paths) {
            if (path.endsWith(".zip") || path.endsWith(".rar") || path.endsWith(".rpa")) {
                await invoke('tracker', {
                    event: 'manual_download',
                    props: {  }
                });
                await import_mod(path)
            } else {
                await writeFile(local_path + "\\store\\images\\" + path.split("\\").pop(), await readFile(path))

            }
        }
        setTimeout(async () => {
            await update_cover_images()
        }, 1000)
    });

    // This is what is recieved when you import a mod
    // This is also the first handshake handler that tells the frontend (this) to listen to the downloads folder

    globLog("Finished Loading Defaults (" + (Date.now() - start) + "ms).")
    globLog("Loading Observers2")

    listen("pathRespond", async (event) => {
        if (!reset) {
            await globLog("Start Loading Pt. 2 (" + (Date.now() - start) + "ms).")

            let payloadPath = event.payload.path;
            let newest_version = await getVersion();
            await loadConfig(event.payload.local_path)
            reset = true;

            await globLog("Version Check (" + (Date.now() - start) + "ms).")

            if (newest_version.split("\n")[0] !== CLIENT_VERSION) {
                await globWarn("NOT UP TO DATE " + newest_version + " > " + CLIENT_VERSION)
                document.getElementById("version").innerHTML = `(${CLIENT_VERSION}) <u>Update!</u>`
                if (navigator.onLine) {
                    let response = await confirm("AUTO UPDATE\nNew Update Available! (Press 'OK' to update!)\n\n" + newest_version + "\n\nUpdate Now (5-10s)?\nPress Cancel To Update Later.");
                    if (response) {
                        await update_client()

                        return;
                    }
                } else {
                    await globWarn("You are currently offline. Update will not be requested.")
                }
            } else {
                await globLog(CLIENT_VERSION, localConfig.config.version)
                document.getElementById("version").textContent = `(${CLIENT_VERSION})`
                if (localConfig.config.version !== CLIENT_VERSION) {
                    await saveConfig()
                    confirm("Updated! (Wont Pop-Up Again Until Next Update)\n\n" + newest_version + "\n\nPress OK or CANCEL to continue.");
                }
            }

            await globLog("DDLC Check (" + (Date.now() - start) + "ms).")

            if (!await isDir("./store/ddlc")) {
                while (!await isDir("./store/ddlc")) {
                    try {
                        let p = await open({
                            directory: false,
                            multiple: false,
                            filters: [{
                                name: 'Zip',
                                extensions: ['zip', 'rar']
                            }],
                            title: 'Select DDLC Zip File'
                        });
                        await invoke("set_ddlc_zip", {
                            path: p
                        })
                    } catch (error) {
                        await globWarn("Zip Failed: ", error)
                    }
                }
            }

            await globLog("Language (" + (Date.now() - start) + "ms).")

            if (translation_lan === "") {
                document.getElementById("language-list").classList.remove("hide")
                document.getElementById("language-list").classList.add("language-list-force")
                document.getElementById("loader").appendChild(document.getElementById("language-list"))
                let interval;
                await new Promise(resolve => interval = setInterval(() => {
                    if (translation_lan !== "") {
                        resolve()
                        clearInterval(interval)
                    }
                }, 100))
                document.getElementById("language-list").classList.add("hide")
                document.getElementById("language-list").classList.remove("language-list-force")
                document.getElementById("main").appendChild(document.getElementById("language-list"))
            } else {
                await loadTranslation(translation_lan, true)
            }

            await globLog("Theme (" + (Date.now() - start) + "ms).")

            await setTheme(localConfig.config.theme, true)
            await globLog("Covers (" + (Date.now() - start) + "ms).")
            await update_cover_images(true)
            await globLog("Main (" + (Date.now() - start) + "ms).")
            await home_main()
            await globLog("Watcher (" + (Date.now() - start) + "ms).")
            await watch(
                event.payload.path,
                async (event) => {
                    for (const index in event.paths) {
                        const path = event.paths[index];
                        setTimeout(async () => {
                            if ((path.endsWith(".zip") || path.endsWith(".rar") || path.endsWith(".rpa")) && await isExist(path)) {
                                document.getElementById("alert").classList.remove("hide")
                                showContainers(false)
                                alert_path = path
                                const split = path.split("\\");
                                const data = await metadata(path);

                                document.getElementById("alert-size").innerText = Math.floor(data.size / 1048600).toString() + "mb";

                                document.getElementById("alert-pth").innerText = payloadPath;
                                document.getElementById("alert-name").textContent = split[split.length - 1].split(".")[0];
                            }
                        }, 1000)
                    }
                }, {
                    delayMs: 500
                }
            )

            await globLog("Finished Loading Core (" + (Date.now() - start) + "ms).")
        }
        try {
            await requestDirectory(event.payload.final_data)
            await home_main()
        } catch (e) {}

    })

    listen('closed', async (event) => {
        if (event.payload.id !== "") {
            await invoke('tracker', {
                event: 'game_close',
                props: { mod: event.payload.id }
            });
            await launchers[event.payload.id].close();
        }
    });

    listen('popup', async (event) => {
        await confirm(event.payload.text)
    });

    listen('substring', async (event) => {
        document.getElementById("loadingsub").textContent = event.payload.text
    });

    document.getElementById("update").addEventListener("mouseup", async () => {
        play(sound_beep)
        launch_desktop()
    })

    document.getElementById("play").addEventListener("mouseup", async () => {
        if (currentEntry !== "") {
            await launchers[currentEntry].open();
        }
    })

    document.getElementById("version").addEventListener("mouseup", async _ => {
        // await invoke("update", {
        //     close: false
        // })
        launch_desktop()
    })

    document.getElementById("cover-next").addEventListener("mouseenter", () => {
        mouse_cover_available = true
    })
    document.getElementById("cover-next").addEventListener("mouseleave", () => {
        mouse_cover_available = false
    })
    document.getElementById("cover-last").addEventListener("mouseenter", () => {
        mouse_cover_available = true
    })
    document.getElementById("cover-last").addEventListener("mouseleave", () => {
        mouse_cover_available = false
    })

    document.getElementById("cove").addEventListener("mouseup", async () => {
        if (currentEntry !== "" && !mouse_cover_available) {
            await launchers[currentEntry].oncove()
        }
    })


    document.getElementById("delete").addEventListener("mouseup", async () => {
        if (currentEntry !== "") {
            let confirmed = await confirm("Are you sure you want to delete '" + launchers[currentEntry].location + "' and its data?")
            if (confirmed) {
                await invoke("delete_path", {
                    path: launchers[currentEntry].location
                });
                await home_main()
                await requestDirectory(selectedPath);
            }
        }
    })

    document.getElementById("path").addEventListener("mouseup", async () => {
        if (currentEntry !== "") {
            await launchers[currentEntry].path();
        }
    })

    document.getElementById("modtitle").addEventListener("focus", async () => {
        if (currentEntry === "") {
            document.getElementById("modtitle").blur()
        }
    })

    document.getElementById("modtitle").addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
            document.getElementById("modtitle").blur()
        }
    })

    document.getElementById("modtitle").addEventListener("blur", async () => {
        document.getElementById("modtitle").scrollLeft = 0;
        if (currentEntry !== "") {
            await rename_mod()
        }
    })

    document.getElementById("options").addEventListener("mouseup", async () => {
        play(sound_beep)

        await home_main()
    })

    document.getElementById("cover-next").addEventListener("mouseup", async (e) => {
        if (currentEntry !== "" && e.button === 0) {
            await launchers[currentEntry].nextCover();
        } else if (e.button === 0) {
            background_cover++;
            if (background_cover > covers.length - 1) {
                background_cover = 0;
            }
            await setCover(background_cover)
        }
    })

    document.getElementById("cover-last").addEventListener("mouseup", async (e) => {
        if (currentEntry !== "" && e.button === 0) {
            await launchers[currentEntry].lastCover();
        } else if (e.button === 0) {
            background_cover--;
            if (background_cover < 0) {
                background_cover = covers.length - 1;
            }
            await setCover(background_cover)
        }
    })

    document.getElementById("close").addEventListener("mouseup", async () => {
        document.getElementById("loader").classList.remove("hide")
        document.getElementById("main").classList.add("hide")
        document.getElementById("loadinghead").textContent = "Closing..."
        document.getElementById("loadingsub").textContent = "Saving Data..."


        setTimeout(() => {
            invoke("close");
        }, 1000)
    })

    document.getElementById("view-background").addEventListener("mouseup", async () => {
        document.getElementById("view-image").classList.remove("zoom")
        document.getElementById("view-background").classList.add("hide")
    })

    document.getElementById("min").addEventListener("mouseup", async () => {
        play(sound_beep)
        await invoke("minimize");
    })

    document.getElementById("source").addEventListener("mouseup", async () => {
        play(sound_beep)
        await requestDirectory();
    })

    document.getElementById("search").addEventListener("input", async (event) => {

        if (event.target.value === "") {
            for (const index in launchers) {
                const element = launchers[index];
                element.item.classList.remove("hide2");
            }
        } else {
            for (const index in launchers) {
                const element = launchers[index];
                if (element.item.id.toLowerCase().includes(event.target.value.toLowerCase())) {
                    element.item.classList.remove("hide2");
                } else {
                    element.item.classList.add("hide2");
                }
            }
        }
    })

    document.getElementById("english").addEventListener("mouseup", async () => {
        let old = translation_lan;
        await loadTranslation("en", (old === ""))
        if (old !== "") {
            saveConfig().then()
        }
    })

    document.getElementById("spanish").addEventListener("mouseup", async () => {
        let old = translation_lan;
        await loadTranslation("es", (old === ""))
        if (old !== "") {
            saveConfig().then()
        }
    })

    document.getElementById("language").addEventListener("mouseup", async () => {
        document.getElementById("language-list").classList.toggle("hide")
    })

    document.getElementById("tutorial-no").addEventListener("mouseup", async () => {
        if (tutorial_pointer != null) {
            tutorial_pointer.remove()
            tutorial_pointer = null;
        }
        tutorial_complete = true
        document.getElementById("warn").remove()
        await saveConfig()
    })

    document.getElementById("tutorial").addEventListener("mouseup", async () => {
        document.getElementById("warn").classList.add("tutorial-active")
        document.getElementById("tutorial").textContent = translation.next
        document.getElementById("tutorial-no").textContent = translation.cancel
        if (tutorial_step >= 4 && currentEntry === "") {
            if (tutorial_pointer == null) {
                tutorial_pointer = document.createElement("div")
                tutorial_pointer.classList.add("tutorial-pointer")
                document.getElementById("main").appendChild(tutorial_pointer)
            }
            tutorial_pointer.style.width = document.getElementById("modlist").getBoundingClientRect().width + "px";
            tutorial_pointer.style.height = document.getElementById("modlist").getBoundingClientRect().height + "px";
            tutorial_pointer.style.borderRadius = "10px"
            tutorial_pointer.style.top = (document.getElementById("modlist").getBoundingClientRect().y + (document.getElementById("modlist").getBoundingClientRect().height/2)) + "px"
            tutorial_pointer.style.left = (document.getElementById("modlist").getBoundingClientRect().x + (document.getElementById("modlist").getBoundingClientRect().width/2))  + "px"
            document.getElementById("tutorial-title").textContent = translation.tutorial[4].title;
            document.getElementById("tutorial-context").textContent = translation.tutorial[4].context;
            confirm(translation.tutorial.select)
            return
        }
        tutorial_step++;
        switch (tutorial_step) {
            case 1:
                document.getElementById("tutorial-title").textContent = translation.tutorial[1].title;
                document.getElementById("tutorial-context").textContent = translation.tutorial[1].context;
                break;
            case 2:
                if (tutorial_pointer == null) {
                    tutorial_pointer = document.createElement("div")
                    tutorial_pointer.classList.add("tutorial-pointer")
                    tutorial_pointer.style.top = (document.getElementById("themeselect").getBoundingClientRect().y + (document.getElementById("themeselect").getBoundingClientRect().height/2)) + "px"
                    tutorial_pointer.style.left = (document.getElementById("themeselect").getBoundingClientRect().x + (document.getElementById("themeselect").getBoundingClientRect().width/2))  + "px"

                    document.getElementById("main").appendChild(tutorial_pointer)
                }
                document.getElementById("tutorial-title").textContent = translation.tutorial[2].title;
                document.getElementById("tutorial-context").textContent = translation.tutorial[2].context;
                break;
            case 3:
                if (tutorial_pointer == null) {
                    tutorial_pointer = document.createElement("div")
                    tutorial_pointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorial_pointer)
                }
                tutorial_pointer.style.width = document.getElementById("covers").getBoundingClientRect().width + "px";
                tutorial_pointer.style.height = document.getElementById("covers").getBoundingClientRect().height + "px";
                tutorial_pointer.style.borderRadius = "10px"
                tutorial_pointer.style.top = (document.getElementById("covers").getBoundingClientRect().y + (document.getElementById("covers").getBoundingClientRect().height/2)) + "px"
                tutorial_pointer.style.left = (document.getElementById("covers").getBoundingClientRect().x + (document.getElementById("covers").getBoundingClientRect().width/2))  + "px"
                document.getElementById("tutorial-title").textContent = translation.tutorial[3].title;
                document.getElementById("tutorial-context").textContent = translation.tutorial[3].context;
                break;
            case 4:
                if (tutorial_pointer == null) {
                    tutorial_pointer = document.createElement("div")
                    tutorial_pointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorial_pointer)
                }
                tutorial_pointer.style.width = document.getElementById("reddit").getBoundingClientRect().width + "px";
                tutorial_pointer.style.height = document.getElementById("reddit").getBoundingClientRect().height + "px";
                tutorial_pointer.style.borderRadius = "10px"
                tutorial_pointer.style.top = (document.getElementById("reddit").getBoundingClientRect().y + (document.getElementById("reddit").getBoundingClientRect().height/2)) + "px"
                tutorial_pointer.style.left = (document.getElementById("reddit").getBoundingClientRect().x + (document.getElementById("reddit").getBoundingClientRect().width/2))  + "px"
                document.getElementById("tutorial-title").textContent = translation.tutorial[4].title;
                document.getElementById("tutorial-context").textContent = translation.tutorial[4].context;
                break;
            case 5:
                if (tutorial_pointer == null) {
                    tutorial_pointer = document.createElement("div")
                    tutorial_pointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorial_pointer)
                }
                tutorial_pointer.style.width = document.getElementById("cove").getBoundingClientRect().width + "px";
                tutorial_pointer.style.height = document.getElementById("cove").getBoundingClientRect().height + "px";
                tutorial_pointer.style.borderRadius = "10px"
                tutorial_pointer.style.top = (document.getElementById("cove").getBoundingClientRect().y + (document.getElementById("cove").getBoundingClientRect().height/2)) + "px"
                tutorial_pointer.style.left = (document.getElementById("cove").getBoundingClientRect().x + (document.getElementById("cove").getBoundingClientRect().width/2))  + "px"
                document.getElementById("tutorial-title").textContent = translation.tutorial[5].title;
                document.getElementById("tutorial-context").textContent = translation.tutorial[5].context;
                break;
            case 6:
                if (tutorial_pointer == null) {
                    tutorial_pointer = document.createElement("div")
                    tutorial_pointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorial_pointer)
                }
                tutorial_pointer.style.width = document.getElementById("modtitle").getBoundingClientRect().width + "px";
                tutorial_pointer.style.height = document.getElementById("modtitle").getBoundingClientRect().height + "px";
                tutorial_pointer.style.borderRadius = "10px"
                tutorial_pointer.style.top = (document.getElementById("modtitle").getBoundingClientRect().y + (document.getElementById("modtitle").getBoundingClientRect().height/2)) + "px"
                tutorial_pointer.style.left = (document.getElementById("modtitle").getBoundingClientRect().x + (document.getElementById("modtitle").getBoundingClientRect().width/2))  + "px"
                document.getElementById("tutorial-title").textContent = translation.tutorial[6].title;
                document.getElementById("tutorial-context").textContent = translation.tutorial[6].context;
                break;
            case 7:
                if (tutorial_pointer == null) {
                    tutorial_pointer = document.createElement("div")
                    tutorial_pointer.classList.add("tutorial-pointer")
                    document.getElementById("main").appendChild(tutorial_pointer)
                }
                tutorial_pointer.style.width = document.getElementById("modinfo").getBoundingClientRect().width + "px";
                tutorial_pointer.style.height = document.getElementById("modinfo").getBoundingClientRect().height + "px";
                tutorial_pointer.style.borderRadius = "10px"
                tutorial_pointer.style.top = (document.getElementById("modinfo").getBoundingClientRect().y + (document.getElementById("modinfo").getBoundingClientRect().height/2)) + "px"
                tutorial_pointer.style.left = (document.getElementById("modinfo").getBoundingClientRect().x + (document.getElementById("modinfo").getBoundingClientRect().width/2))  + "px"
                document.getElementById("tutorial-title").textContent = translation.tutorial[7].title;
                document.getElementById("tutorial-context").textContent = translation.tutorial[7].context;
                break;
            default:
                if (tutorial_pointer != null) {
                    tutorial_pointer.remove()
                    tutorial_pointer = null;
                }
                document.getElementById("tutorial").remove()
                document.getElementById("tutorial-no").style.width = "85%"
                document.getElementById("tutorial-no").textContent = translation.end
                document.getElementById("tutorial-title").textContent = translation.tutorial[8].title;
                document.getElementById("tutorial-context").textContent = translation.tutorial[8].context;
                break;
        }
    })

    // Prevent Find

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
            e.preventDefault();
        }
    });

    document.getElementById("themeselect").addEventListener("mouseup", async () => {
        let next = CLIENT_THEME_ENUM.indexOf(localConfig.config.theme) + 1;
        if (next > CLIENT_THEME_ENUM.length - 1) {
            next = 0;
        }
        await play(sound_beep)
        await setTheme(CLIENT_THEME_ENUM[next], false);
    })

    document.getElementById("importimage").addEventListener("mouseup", async () => {
        await invoke("open_path", {
            path: local_path + "\\store\\images"
        })
    })


    document.getElementById("import").addEventListener("mouseup", async () => {
        play(sound_beep)
        await import_mod();
    })

    await globLog("Finished Loading Observers2 (" + (Date.now() - start) + "ms).")

    // SNOWFLAKE

    await globLog("Loading Intervals.")

    // setInterval(snowflake, 100)
    setInterval(update_concurrent_game, 1000)
    setInterval(keepAlive, 60000)

    // getCurrentWindow().onFocusChanged(({
    //     payload: isfocused
    // }) => {
    //     focused = isfocused
    //     if (focused) {
    //         jingle_audio.play()
    //     } else {
    //         jingle_audio.pause()
    //     }
    // });

    // jingle_audio.volume = 0.1;
    // jingle_audio.loop = true;
    // jingle_audio.play()

    await globLog("Finished Loading PT. 1 (" + (Date.now() - start) + "ms).")
    invoke("request_path")
    let loop = setInterval(async () => {
        if (!reset) {
            await invoke("request_path")
        } else {
            await globLog("pt. 2 started")
            clearInterval(loop)
        }
    }, 2000)
}

async function should_update() {
    let newest_version = await getVersion();

    return newest_version.split("\n")[0] !== CLIENT_VERSION;
}

async function update_client() {
    if (await should_update()) {
        await invoke('tracker', {
            event: 'update_launcher',
            props: {  }
        });
        document.getElementById("loadingsub").textContent = translation.updating + " Doki Doki Mod Manager"
        invoke("update_exe")
    } else {
        console.warn("Already Up To Date (" + CLIENT_VERSION + ")")
    }
}

async function launch_desktop() {
    previous_app = createApp(Desktop)
    previous_app.mount("#app");

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

        text.textContent = data.msg;
        timestamp.textContent = (difference < 1000 ? difference + "ms" : (difference > 60000 ? (difference / 60000).toFixed(2) + "m" : (difference / 1000).toFixed(2) + "s"));

        holder.appendChild(text);
        holder.appendChild(timestamp);

        document.getElementById("console").appendChild(holder);
    }

    document.getElementById("console").scrollTo(0, document.getElementById("console").scrollHeight)

    document.getElementById("desktop-version").textContent = "Doki Doki Mod Manager " + CLIENT_VERSION
    document.getElementById("desktop-launch").addEventListener("mouseup", () => {
        window.location.reload(true)
    })
    document.getElementById("desktop-close2").addEventListener("mouseup",() => {
        invoke("close");
    })
    document.getElementById("desktop-close").addEventListener("mouseup", () => {
        invoke("close");
    })
    document.getElementById("desktop-update").addEventListener("mouseup", () => {
        if (should_update()) {
            previous_app.unmount()
            createApp(App).mount("#app")
            update_client()
        }

    })
}

createApp(App).mount("#app");
document.addEventListener('DOMContentLoaded', onLoad);
