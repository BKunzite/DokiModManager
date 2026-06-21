let language = "";

/**
 * Translation table for strings used.
 * @type {Object.<string, Object.<string, string>>}
 */
export const TRANSLATION_TABLE = import.meta.glob('../assets/Translations/*.json', {eager: true})["../assets/Translations/Translations.json"].default;

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
export const TRANSLATION_ELEMENT_MAP = import.meta.glob('../assets/Translations/*.json', {eager: true})["../assets/Translations/TranslationTable.json"].default;

export const Translation = {
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
     * @param {string} language Language (ex. en, fr)
     * @param {TRANSLATION_TABLE["en"]} text Text To Translate
     * @returns {*}
     */
    of: (text) => {
        if (TRANSLATION_TABLE[language] === undefined) throw new NoTranslationError("Language '" + language + "' not found in translation table!")
        if (TRANSLATION_TABLE[language][text] === undefined) throw new NoTranslationIndexError("Translation for '" + text + "' not found in language '" + language + "'!")
        return TRANSLATION_TABLE[language][text]
    },
    sub: (text) => {
        if (TRANSLATION_TABLE[language] === undefined) throw new NoTranslationError("Language '" + language + "' not found in translation table!")
        if (TRANSLATION_TABLE[language][text] === undefined) throw new NoTranslationIndexError("Translation for '" + text + "' not found in language '" + language + "'!")
        return {
            of: (t) => {
                if (TRANSLATION_TABLE[language][text][t] === undefined) throw new NoTranslationIndexError("Translation for '" + text + "' sub '" + t + "' not found in language '" + language + "'!")
                return TRANSLATION_TABLE[language][text][t]
            },
            sub: (t) => {
                if (TRANSLATION_TABLE[language][text][t] === undefined) throw new NoTranslationIndexError("Translation for '" + text + "' sub '" + t + "' not found in language '" + language + "'!")
                return {
                    of: (t2) => {
                        if (TRANSLATION_TABLE[language][text][t][t2] === undefined) throw new NoTranslationIndexError("Translation for '" + text + "' sub '" + t + "' sub2 '" + t2 + "' not found in language '" + language + "'!")
                        return TRANSLATION_TABLE[language][text][t][t2]
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

    static of(message) {
        return new NoTranslationError(message);
    }
}

export class NoTranslationIndexError extends Error {
    constructor(message) {
        super(message);
        this.name = "NoTranslationIndexError";
    }

    static of(message) {
        return new NoTranslationIndexError(message);
    }
}