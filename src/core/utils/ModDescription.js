// macOS fixes contributed, 2026-11-19.
import {htmlEscape} from "./TextUtil";

export const MAX_DESCRIPTION_LENGTH = 10000;

export function descriptionHtml(description, details) {
    const text = typeof description === "string" && description.trim()
        ? description : "Use Edit to add a description for this mod.";
    return `<div class="mod-description-text">${htmlEscape(text)}</div>` +
        `<details class="mod-technical-details"><summary>Game details &amp; credits</summary>${details ?? ""}</details>`;
}

// Retain all other metadata. Restore live state if saving fails.
export async function updateModDescription(config, description, persist) {
    if (typeof description !== "string" || description.length > MAX_DESCRIPTION_LENGTH) {
        throw new Error(`Description must contain at most ${MAX_DESCRIPTION_LENGTH} characters.`);
    }
    const previous = config.description;
    const hadDescription = Object.hasOwn(config, "description");
    config.description = description;
    try {
        await persist();
    } catch (error) {
        if (hadDescription) config.description = previous;
        else delete config.description;
        throw error;
    }
}
