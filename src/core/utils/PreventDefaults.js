class PreventDefaultsObject {
    init() {
        document.oncontextmenu = document.body.oncontextmenu = function () {
            return false;
        }
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
            }
        });
    }
}

const PreventDefaults = new PreventDefaultsObject()
export default PreventDefaults