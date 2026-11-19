// Local macOS WebKit regression checks, 2026-11-19.
// Start Vite separately. Set PLAYWRIGHT_MODULE to a module URL if not installed.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
const {webkit} = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = process.env.UI_OUTPUT_DIR || "ui-results";
await fs.mkdir(output, {recursive: true});
const browser = await webkit.launch({headless: true});
const results = [];
try {
    for (const viewport of [{width: 1200, height: 600}, {width: 1000, height: 600}, {width: 1440, height: 900}]) {
        const page = await browser.newPage({viewport, deviceScaleFactor: 2});
        page.setDefaultTimeout(8000);
        const errors = [];
        page.on("pageerror", error => errors.push(String(error)));
        await page.goto((process.env.UI_BASE_URL || "http://127.0.0.1:1420") + "/tests/ui/preview.html");
        await page.waitForFunction(() => window.fixtureReady);
        // Keep upstream's newly added header actions working after rebasing the cover handlers.
        const preferencesBefore = await page.evaluate(() => structuredClone(window.fixture.homeConfig.post()));
        await page.locator("#settings-show").click();
        const settings = page.locator("#uikit .uikit-panel").filter({hasText: "Options"});
        await settings.waitFor({state: "visible"});
        assert.deepEqual(await settings.locator(".uikit-toggle-label").allTextContents(), ["Sound", "Seasons", "Performance Mode"]);
        assert.equal(await settings.locator('input[type="checkbox"]').count(), 3);
        await settings.getByRole("button", {name: "Close", exact: true}).click();
        await page.waitForFunction(() => !document.querySelector("#uikit .uikit-panel:not(.hide)"));
        assert.deepEqual(await page.evaluate(() => window.fixture.homeConfig.post()), preferencesBefore);
        await page.locator("#discord-show").click();
        assert.ok(await page.evaluate(() => window.fixture.messages.includes("URL: https://discord.com/invite/synthetic-fixture")));
        // The actual Home entrypoint used by the reported failure, with production event bindings.
        await page.evaluate(() => window.fixture.goHome());
        const homeBefore = await page.evaluate(() => structuredClone(window.fixture.homeConfig.post()));
        await page.locator("#cover-last").click();
        await page.locator("#image-picker-adjust").click();
        await page.locator("#cover-crop-editor").waitFor({state: "visible"});
        assert.equal(await page.locator("#crop-target option").count(), 2);
        assert.equal(await page.locator("#crop-fit").inputValue(), "contain", "Home logos should initially fit whole");
        const thumbnailRatios = await page.evaluate(() => {
            const stage = document.getElementById("crop-stage"), cover = document.getElementById("cove");
            return [stage.clientWidth / stage.clientHeight, cover.clientWidth / cover.clientHeight];
        });
        assert.ok(Math.abs(thumbnailRatios[0] - thumbnailRatios[1]) < .015, "Thumbnail preview must use layout dimensions, independent of hover transforms");
        await page.locator("#crop-target").selectOption("background");
        assert.equal(await page.locator("#crop-y").inputValue(), "0.35", "Preserve legacy arrow positioning when opening");
        const stageRatio = await page.locator("#crop-stage").evaluate(stage => stage.clientWidth / stage.clientHeight);
        assert.ok(Math.abs(stageRatio - viewport.width / viewport.height) < .03, "Background crop must use the actual window aspect ratio");
        await page.locator("#crop-cancel").click();
        assert.deepEqual(await page.evaluate(() => window.fixture.homeConfig.post()), homeBefore);
        assert.equal(await page.evaluate(() => window.fixture.files.has("/fixture/client-config.json")), false, "Opening/cancelling Home framing must not save");
        await page.locator("#image-picker-cancel").click();

        // The replacement for the old up/down arrows opens background framing directly.
        await page.locator("#background-adjust").click();
        assert.equal(await page.locator("#crop-target").inputValue(), "background");
        await page.evaluate(() => {
            for (const [id, value] of [["crop-zoom", "1.4"], ["crop-x", "0.2"], ["crop-y", "0.75"]]) {
                const input = document.getElementById(id); input.value = value; input.dispatchEvent(new Event("input", {bubbles: true}));
            }
        });
        await page.locator("#crop-target").selectOption("cover");
        assert.equal(await page.locator("#crop-zoom").inputValue(), "1", "Background zoom must not change the thumbnail");
        await page.screenshot({path: path.join(output, `webkit-home-crop-${viewport.width}x${viewport.height}.png`)});
        await page.locator("#crop-save").click();
        await page.locator("#cover-crop-editor").waitFor({state: "hidden"});
        const homeSaved = await page.evaluate(() => JSON.parse(new TextDecoder().decode(window.fixture.files.get("/fixture/client-config.json"))));
        assert.equal(homeSaved.homeCoverFrame.fit, "contain");
        assert.equal(homeSaved.homeCoverFrame.zoom, 1);
        assert.equal(homeSaved.backgroundFrame.zoom, 1.4);
        assert.equal(homeSaved.backgroundFrame.y, .75);
        assert.equal(homeSaved.extra.keep, true);
        const renderBefore = await page.evaluate(() => ["cove", "bg"].map(id => {
            const element = document.getElementById(id);
            return {size: element.style.backgroundSize, position: element.style.backgroundPosition, height: element.clientHeight};
        }));
        assert.equal(renderBefore[1].height, viewport.height);
        await page.evaluate(() => window.fixture.reloadHome());
        assert.deepEqual(await page.evaluate(() => ["cove", "bg"].map(id => {
            const element = document.getElementById(id);
            return {size: element.style.backgroundSize, position: element.style.backgroundPosition, height: element.clientHeight};
        })), renderBefore, "Both crops must survive config reload");
        await page.locator("#background-adjust").click();
        await page.evaluate(() => { window.fixture.failHomeSave = true; });
        await page.locator("#crop-save").click();
        await page.locator("#crop-error").filter({hasText: "simulated Home disk failure"}).waitFor();
        assert.deepEqual(await page.evaluate(() => window.fixture.homeConfig.post()), homeSaved);
        await page.evaluate(() => { window.fixture.failHomeSave = false; });
        await page.locator("#crop-cancel").click();
        assert.ok(await page.locator("#profile-blur").evaluate(element => element.classList.contains("hide")));
        await page.locator("#images .covers-image").first().click();
        await page.locator("#cover-crop-editor").waitFor({state: "visible"});
        await page.locator("#crop-cancel").click();
        assert.deepEqual(await page.evaluate(() => window.fixture.homeConfig.post()), homeSaved, "Cancelling a different Home image preserves the current source");
        await page.evaluate(() => window.fixture.goMod());
        await page.evaluate(() => window.fixture.showPicker());
        await page.waitForTimeout(600);
        const initial = await page.evaluate(() => {
            const f = window.fixture;
            return {count: f.images.covers.length(), dimensions: Object.values(f.images.preloadCovers.asList())
                .map(image => [image.naturalWidth, image.naturalHeight])};
        });
        assert.equal(initial.count, 6);
        assert.ok(initial.dimensions.every(([width, height]) => width > 0 && height > 0));
        const rows = await page.evaluate(() => [...document.querySelectorAll(".image-picker-cover")].map(card => {
            const r = card.getBoundingClientRect(); return {top:r.top,bottom:r.bottom};
        }));
        for (let i = 0; i < rows.length - 2; i++) assert.ok(rows[i].bottom < rows[i + 2].top, "Image rows must not overlap");
        const firstRow = await page.evaluate(() => {
            const items = document.getElementById("image-picker-items").getBoundingClientRect();
            const cards = [...document.querySelectorAll(".image-picker-cover")].slice(0, 2).map(card => card.getBoundingClientRect());
            return {leftGap: cards[0].left - items.left, rightGap: items.right - cards[1].right,
                sameRow: Math.abs(cards[0].top - cards[1].top) < 1};
        });
        assert.ok(firstRow.sameRow && Math.abs(firstRow.leftGap) <= 1 && Math.abs(firstRow.rightGap) <= 1,
            "Default images must fill both columns without a blank strip on the right");

        // Decode real browser-produced PNG/JPEG/WebP and an SVG with the correct MIME.
        const decoded = await page.evaluate(async () => {
            const f = window.fixture;
            const canvas = document.createElement("canvas");
            canvas.width = 240; canvas.height = 120;
            canvas.getContext("2d").fillRect(0, 0, 240, 120);
            const names = [];
            for (const [extension, mime] of [["png", "image/png"], ["jpg", "image/jpeg"], ["webp", "image/webp"]]) {
                const blob = await new Promise(resolve => canvas.toBlob(resolve, mime));
                const bytes = new Uint8Array(await blob.arrayBuffer());
                await f.decodeImage(bytes, "cover." + extension);
                f.files.set("/selected/cover." + extension, bytes);
                names.push("/selected/cover." + extension);
            }
            const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="240"><rect width="120" height="80" fill="#a64c7e"/><rect y="80" width="120" height="80" fill="#574a9f"/><rect y="160" width="120" height="80" fill="#398b83"/><circle cx="25" cy="40" r="15" fill="white"/><text x="14" y="128" fill="white" font-size="16">CENTER</text></svg>');
            await f.decodeImage(svg, "cover.SVG");
            f.files.set("/selected/cover.SVG", svg);
            f.select([...names, "/selected/cover.SVG"]);
            return names.length + 1;
        });
        assert.equal(decoded, 4);
        await page.locator("#image-picker-import").click();
        await page.waitForFunction(() => window.fixture.images.covers.length() === 10);
        const library = await page.evaluate(() => [...window.fixture.files.keys()].filter(path => path.startsWith("/fixture/store/images/")));
        assert.equal(library.length, 4);
        const imageBytesBefore = await page.evaluate(() => [...window.fixture.files].filter(([path]) => !path.endsWith(".json")).map(([path, bytes]) => [path, Array.from(bytes)]));
        await page.locator(".image-picker-cover img").last().dispatchEvent("mouseup", {button: 0});
        await page.locator("#cover-crop-editor").waitFor({state: "visible"});
        assert.equal(await page.evaluate(() => window.fixture.selectedCover()), null, "Choosing an image must wait for crop approval");
        await page.locator("#crop-fit").selectOption("contain");
        const fitBounds = await page.evaluate(() => {
            const stage = document.getElementById("crop-stage");
            const [w, h] = getComputedStyle(stage).backgroundSize.split(" ").map(parseFloat);
            return {w, h};
        });
        assert.ok(fitBounds.w <= 100.01 && fitBounds.h <= 100.01, "Fit mode must show the complete image");
        await page.locator("#crop-fit").selectOption("cover");
        await page.evaluate(() => {
            for (const [id, value] of [["crop-zoom", "1.5"], ["crop-x", "0.2"], ["crop-y", "0.8"]]) {
                const input = document.getElementById(id); input.value = value; input.dispatchEvent(new Event("input", {bubbles: true}));
            }
        });
        const cropBounds = await page.locator("#cover-crop-editor").boundingBox();
        assert.ok(cropBounds.x >= 0 && cropBounds.y >= 0 && cropBounds.x + cropBounds.width <= viewport.width && cropBounds.y + cropBounds.height <= viewport.height);
        await page.screenshot({path: path.join(output, `webkit-crop-${viewport.width}x${viewport.height}.png`)});
        await page.locator("#crop-save").click();
        await page.locator("#cover-crop-editor").waitFor({state: "hidden"});
        const selected = await page.evaluate(() => window.fixture.selectedCover());
        assert.ok(library.some(path => path.endsWith("/" + selected)));
        const savedFrame = await page.evaluate(() => structuredClone(window.fixture.loadedModData.coverFrame));
        assert.deepEqual(savedFrame, {source: selected, fit: "cover", zoom: 1.5, x: .2, y: .8});
        await page.evaluate(() => window.fixture.showPicker());
        await page.locator("#image-picker-adjust").click();
        assert.equal(await page.locator("#crop-zoom").inputValue(), "1.5");
        const stage = await page.locator("#crop-stage").boundingBox();
        await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
        await page.mouse.down();
        await page.mouse.move(stage.x + stage.width / 2 + 20, stage.y + stage.height / 2 + 10);
        await page.mouse.up();
        assert.notEqual(await page.locator("#crop-x").inputValue(), "0.2", "Dragging must move the crop");
        await page.locator("#crop-reset").click();
        assert.equal(await page.locator("#crop-zoom").inputValue(), "1");
        await page.locator("#crop-cancel").click();
        assert.deepEqual(await page.evaluate(() => window.fixture.loadedModData.coverFrame), savedFrame, "Cancel must retain the saved frame");
        await page.locator("#image-picker-adjust").click();
        await page.evaluate(() => { window.fixture.failCoverSave = true; });
        await page.locator("#crop-save").click();
        await page.locator("#crop-error").filter({hasText: "simulated disk failure"}).waitFor();
        assert.deepEqual(await page.evaluate(() => window.fixture.loadedModData.coverFrame), savedFrame);
        await page.evaluate(() => { window.fixture.failCoverSave = false; });
        await page.locator("#crop-cancel").click();
        assert.equal(await page.evaluate(() => [...window.fixture.files.keys()].filter(path => path.startsWith("/fixture/store/images/")).length), 4, "Framing must not create or overwrite source image files");
        assert.deepEqual(await page.evaluate(() => [...window.fixture.files].filter(([path]) => !path.endsWith(".json")).map(([path, bytes]) => [path, Array.from(bytes)])), imageBytesBefore, "Framing must retain every source image byte");

        await page.evaluate(() => window.fixture.showPicker());
        await page.waitForTimeout(600);
        const bounds = await page.evaluate(() => {
            const rect = id => {
                const r = document.getElementById(id).getBoundingClientRect();
                return {x: r.x, y: r.y, right: r.right, bottom: r.bottom};
            };
            const items = document.getElementById("image-picker-items");
            return {picker: rect("image-picker-bg"), importButton: rect("image-picker-import"),
                cancelButton: rect("image-picker-cancel"), scrollWidth: items.scrollWidth, clientWidth: items.clientWidth,
                editableSelection: (getComputedStyle(document.getElementById("modtitle")).webkitUserSelect || getComputedStyle(document.getElementById("modtitle")).userSelect)};
        });
        assert.ok(bounds.picker.x >= 0 && bounds.picker.y >= 0);
        assert.ok(bounds.picker.right <= viewport.width && bounds.picker.bottom <= viewport.height);
        assert.ok(bounds.importButton.right <= bounds.cancelButton.x);
        assert.ok(bounds.cancelButton.right <= bounds.picker.right);
        assert.ok(bounds.scrollWidth <= bounds.clientWidth + 1, "No horizontal clipping in picker");
        assert.equal(bounds.editableSelection, "text");
        await page.screenshot({path: path.join(output, `webkit-picker-${viewport.width}x${viewport.height}.png`)});

        // Corrupt existing library files must not break the picker or its dimensions.
        await page.evaluate(async () => {
            const f = window.fixture;
            f.files.set("/fixture/store/images/broken.png", new Uint8Array([1, 2, 3]));
            await f.api.updateCoverImages();
        });
        assert.equal(await page.locator(".image-picker-cover").count(), 10);
        const identity = await page.evaluate(() => ({
            stored: window.fixture.loadedModData.coverId,
            resolved: !!window.fixture.images.preloadCovers.ofCover(window.fixture.loadedModData.coverId)
        }));
        assert.equal(identity.stored, selected, "Library refresh must retain the selected cover identity");
        assert.equal(identity.resolved, true, "Stable filenames must resolve in both the mod and playing-game cover");
        await page.locator("#image-picker-cancel").click();
        await page.locator("#description-edit").click();
        const description = 'My description\nA&B <img src=x onerror="bad()">';
        await page.locator("#description-input").fill(description);
        await page.locator("#description-save").click();
        assert.equal(await page.locator(".mod-description-text").textContent(), description);
        assert.equal(await page.locator(".mod-description-text img").count(), 0);
        const stored = await page.evaluate(() => JSON.parse(new TextDecoder().decode(window.fixture.files.get("/fixture/mod/.ddmm.config.json"))));
        assert.equal(stored.description, description);
        assert.equal(stored.executable, "DDLC.app/Contents/MacOS/DDLC");
        assert.equal(stored.time, 123);
        await page.locator("#description-edit").click();
        assert.equal(await page.locator("#description-input").inputValue(), description);
        await page.locator("#description-input").fill("discard these edits");
        await page.locator("#description-cancel").click();
        assert.equal(await page.locator("#description-editor").isVisible(), false, "Closed editor must leave the tab/focus order");
        assert.equal(await page.locator(".mod-description-text").textContent(), description);
        await page.locator("#description-edit").click();
        await page.locator("#description-input").fill("must not overwrite the saved description");
        await page.evaluate(() => { window.fixture.failDescriptionSave = true; });
        await page.locator("#description-save").click();
        await page.locator("#description-error").filter({hasText: "simulated description write failure"}).waitFor();
        assert.equal(await page.locator("#description-save").isEnabled(), true);
        assert.equal(await page.evaluate(() => window.fixture.loadedModData.description), description);
        await page.locator("#description-cancel").click();
        await page.evaluate(() => { window.fixture.failDescriptionSave = false; });
        await page.screenshot({path: path.join(output, `webkit-description-${viewport.width}x${viewport.height}.png`)});

        await page.evaluate(() => window.fixture.api.launchDesktop());
        assert.ok((await page.locator("#desktop-version").textContent()).includes(await page.evaluate(() => window.fixture.version)));
        await page.locator("#desktop-update").click();
        await page.waitForFunction(() => !document.getElementById("desktop-update").disabled);
        assert.match(await page.locator("#desktop-update-status").textContent(), /You are up to date/);
        assert.equal(await page.locator("#desktop-install").isVisible(), false);
        assert.equal(await page.evaluate(() => window.fixture.messages.includes("IPC: update_exe")), false);
        await page.evaluate(() => { window.fixture.updateReply = "99.0.0-release\n" + "A synthetic release note with a long explanation.\n".repeat(60); });
        await page.locator("#desktop-update").click();
        await page.waitForFunction(() => !document.getElementById("desktop-update").disabled);
        assert.equal(await page.locator("#desktop-install").isVisible(), true);
        const longNotes = await page.evaluate(() => {
            const panel = document.querySelector(".release-panel"), notes = document.getElementById("desktop-release-notes");
            const heading = panel.querySelector("h2").getBoundingClientRect();
            const buttons = panel.querySelector(".updates-actions").getBoundingClientRect();
            const bounds = panel.getBoundingClientRect();
            return {scrolls: notes.scrollHeight > notes.clientHeight, headingVisible: heading.top >= bounds.top,
                buttonsVisible: buttons.bottom <= bounds.bottom, panelScrollTop: panel.scrollTop};
        });
        assert.ok(longNotes.scrolls && longNotes.headingVisible && longNotes.buttonsVisible,
            "Long release notes must scroll without hiding the title or update buttons");
        assert.equal(longNotes.panelScrollTop, 0);
        assert.equal(await page.evaluate(() => window.fixture.messages.includes("IPC: update_exe")), false, "Checking must not install");
        await page.locator("#desktop-install").click();
        await page.waitForFunction(() => window.fixture.messages.includes("IPC: update_exe"));
        await page.evaluate(() => { window.fixture.failUpdateCheck = true; });
        await page.locator("#desktop-update").click();
        await page.waitForFunction(() => !document.getElementById("desktop-update").disabled);
        assert.match(await page.locator("#desktop-update-status").textContent(), /Could not check updates/);
        const updateBounds = await page.evaluate(() => {
            const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; };
            return {release:rect(".release-panel"),logs:rect(".logs-panel"),header:rect(".updates-heading"),footer:rect(".updates-footer")};
        });
        assert.ok(updateBounds.release.right <= updateBounds.logs.left);
        assert.ok(updateBounds.header.bottom <= updateBounds.release.top);
        assert.ok(updateBounds.logs.bottom <= updateBounds.footer.top);
        assert.ok(updateBounds.footer.bottom <= viewport.height);
        assert.equal(await page.locator("#console .console-text-holder").count(), 30);
        await page.screenshot({path: path.join(output, `webkit-updates-${viewport.width}x${viewport.height}.png`)});
        assert.deepEqual(errors, []);
        results.push({viewport, homeFrames: {cover: homeSaved.homeCoverFrame, background: homeSaved.backgroundFrame}, imagesDecoded: decoded, imported: library.length, selected, bounds, errors});
        await page.close();
    }
    await fs.writeFile(path.join(output, "webkit-results.json"), JSON.stringify(results, null, 2));
    console.log(`PASS: WebKit at ${results.map(r => `${r.viewport.width}×${r.viewport.height}`).join(", ")}; Home entrypoints open the editor, thumbnail/background crops save and reload independently, cancellation/failures preserve data, and mod framing/import/descriptions/Updates pass.`);
} finally {
    await browser.close();
}
