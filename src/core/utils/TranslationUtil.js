let language = "";

/**
 * TranslationUtil table for strings used.
 * @type {Object.<string, Object.<string, string>>}
 */
export const TRANSLATION_TABLE = import.meta.glob('../../assets/Translations/*.json', {eager: true})["../../assets/Translations/Translations.json"].default;

/**
 * Map that binds translations and elements together
 * ```javascript
 * const TRANSLATION_ELEMENT_MAP = [
 *     {id: "id-for-the-element", key: "key-in-the-translation-table", type: "property-to-set"},
 *     ...
 * ]
 * ```
 * @type {Array<{id: string, key: string, type: string}>}
 */
export const TRANSLATION_ELEMENT_MAP = import.meta.glob('../../assets/Translations/*.json', {eager: true})["../../assets/Translations/TranslationTable.json"].default;

export const TranslationUtil = {
    /**
     * Sets Current Language
     * @param {string} lang (ex. en, fr)
     */
    setLanguage: (lang) => {
        language = lang;
    },
    /**
     * Gets Current Language
     * @returns {string} (ex. en, fr)
     */
    getLanguage: () => {
        return language;
    },
    /**
     * Translate text using global table
     * @param {TRANSLATION_TABLE["en"]} text Text To Translate
     * @returns {*}
     */
    of: (text) => {
        if (TRANSLATION_TABLE[language] === undefined) throw new NoTranslationError("Language '" + language + "' not found in translation table!")
        if (TRANSLATION_TABLE[language][text] === undefined) throw new NoTranslationIndexError("TranslationUtil for '" + text + "' not found in language '" + language + "'!")
        return TRANSLATION_TABLE[language][text]
    },
    sub: (text) => {
        let topLevel1 = TRANSLATION_TABLE[language]
        if (topLevel1 === undefined) throw new NoTranslationError("Language '" + language + "' not found in translation table!")
        if (topLevel1[text] === undefined) throw new NoTranslationIndexError("TranslationUtil for '" + text + "' not found in language '" + language + "'!")
        topLevel1 = topLevel1[text]
        return {
            of: (text) => {
                if (topLevel1[text] === undefined) throw new NoTranslationIndexError("TranslationUtil for '" + text + "' sub '" + text + "' not found in language '" + language + "'!")
                return topLevel1[text]
            },
            sub: (title) => {
                let topLevel2 = topLevel1[title]
                if (topLevel2 === undefined) throw new NoTranslationIndexError("TranslationUtil for '" + text + "' sub '" + title + "' not found in language '" + language + "'!")
                return {
                    of: (text) => {
                        if (topLevel2[text] === undefined) throw new NoTranslationIndexError("TranslationUtil for '" + text + "' sub '" + title + "' sub2 '" + text + "' not found in language '" + language + "'!")
                        return topLevel2[text]
                    }
                }
            }
        }
    }
}

export class NoTranslationError extends Error {
    constructor(message) {
        super(message);
        this.name = "NoTranslationError";
    }
}

export class NoTranslationIndexError extends Error {
    constructor(message) {
        super(message);
        this.name = "NoTranslationIndexError";
    }
}