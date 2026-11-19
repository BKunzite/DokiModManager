// macOS fixes contributed, 2026-11-19.
import {applyCoverFrame, frameGeometry, normalizeFrame} from "./CoverFrame.js";

export class CoverCropEditor {
    get frame() { return this.targets[this.target].frame; }
    set frame(value) { this.targets[this.target].frame = value; }

    constructor() {
        this.root = document.getElementById("cover-crop-editor");
        this.stage = document.getElementById("crop-stage");
        this.thumbnail = document.getElementById("crop-thumbnail");
        this.controls = Object.fromEntries(["fit", "zoom", "x", "y"].map(key => [key, document.getElementById(`crop-${key}`)]));
        document.getElementById("crop-target").addEventListener("change", event => {
            this.target = event.target.value;
            this.drag = null;
            this.render();
        });
        for (const [key, control] of Object.entries(this.controls)) control.addEventListener("input", () => {
            this.frame[key] = key === "fit" ? control.value : Number(control.value);
            this.render();
        });
        document.getElementById("crop-reset").addEventListener("click", () => {
            this.frame = normalizeFrame(null, this.source);
            if (this.target === "cover" && Object.keys(this.targets).length > 1) this.frame.fit = "contain";
            this.render();
        });
        document.getElementById("crop-cancel").addEventListener("click", () => this.close());
        document.getElementById("crop-save").addEventListener("click", () => this.save());
        this.root.addEventListener("keydown", event => {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.close(); }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); this.save(); }
            if (event.key === "Tab") {
                const controls = [...this.root.querySelectorAll("button, input, select")].filter(control => !control.disabled && control.getClientRects().length);
                const first = controls[0], last = controls.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        });
        this.stage.addEventListener("pointerdown", event => {
            if (this.saving || event.button !== 0) return;
            this.drag = {x: event.clientX, y: event.clientY, frame: {...this.frame},
                geometry: frameGeometry(this.stage.clientWidth, this.stage.clientHeight, this.image.naturalWidth, this.image.naturalHeight, this.frame)};
            this.stage.setPointerCapture(event.pointerId);
        });
        this.stage.addEventListener("pointermove", event => {
            if (!this.drag || this.saving) return;
            const {geometry, frame, x, y} = this.drag;
            const dx = this.stage.clientWidth - geometry.width, dy = this.stage.clientHeight - geometry.height;
            this.frame.x = Math.abs(dx) > 1 ? Math.max(0, Math.min(1, frame.x + (event.clientX - x) / dx)) : .5;
            this.frame.y = Math.abs(dy) > 1 ? Math.max(0, Math.min(1, frame.y + (event.clientY - y) / dy)) : .5;
            this.render();
        });
        for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) this.stage.addEventListener(event, () => { this.drag = null; });
    }

    open({image, source, frame, aspect, onSave, onClose, targets, target = "cover"}) {
        if (this.saving) return;
        this.image = image;
        this.source = source;
        const specs = targets ?? {cover: {label: "Mod cover", aspect, frame}};
        this.targets = Object.fromEntries(Object.entries(specs).map(([key, spec]) =>
            [key, {...spec, frame: normalizeFrame(spec.frame, source)}]));
        this.target = Object.hasOwn(this.targets, target) ? target : Object.keys(this.targets)[0];
        document.getElementById("crop-title").textContent = targets ? "Frame your Home images" : "Frame your cover";
        const selector = document.getElementById("crop-target");
        selector.replaceChildren(...Object.entries(this.targets).map(([key, spec]) => new Option(spec.label, key)));
        document.getElementById("crop-target-label").classList.toggle("hide2", Object.keys(this.targets).length === 1);
        this.onSave = onSave;
        this.onClose = onClose;
        this.returnFocus = document.activeElement;
        this.root.classList.remove("hide");
        document.getElementById("image-picker-bg").inert = true;
        document.getElementById("crop-error").textContent = "";
        this.render();
        this.controls.fit.focus();
    }

    render() {
        const active = this.targets[this.target];
        const other = Object.entries(this.targets).find(([key]) => key !== this.target)?.[1] ?? active;
        document.getElementById("crop-target").value = this.target;
        this.stage.style.aspectRatio = active.aspect;
        this.stage.style.width = `min(100%, calc(min(41vh, 20rem) * ${active.aspect}))`;
        this.thumbnail.style.aspectRatio = other.aspect;
        document.getElementById("crop-thumbnail-label").textContent = Object.keys(this.targets).length > 1 ? other.label : "Playing thumbnail";
        for (const [key, control] of Object.entries(this.controls)) control.value = this.frame[key];
        document.getElementById("crop-zoom-value").textContent = `${Math.round(this.frame.zoom * 100)}%`;
        applyCoverFrame(this.stage, this.image, this.frame);
        applyCoverFrame(this.thumbnail, this.image, other.frame);
    }

    close() {
        if (this.saving) return;
        this.root.classList.add("hide");
        document.getElementById("image-picker-bg").inert = false;
        this.drag = null;
        for (const element of [this.stage, this.thumbnail]) element._coverResizeObserver?.disconnect();
        this.onClose?.();
        if (this.returnFocus?.isConnected) this.returnFocus.focus();
    }

    async save() {
        if (this.saving) return;
        this.saving = true;
        const controls = [...this.root.querySelectorAll("button, input, select")];
        controls.forEach(control => { control.disabled = true; });
        document.getElementById("crop-error").textContent = "";
        try {
            await this.onSave({...this.frame}, Object.fromEntries(Object.entries(this.targets).map(([key, spec]) => [key, {...spec.frame}])));
            this.saving = false;
            this.close();
        } catch (error) {
            document.getElementById("crop-error").textContent = `Cannot save crop: ${error}`;
        } finally {
            this.saving = false;
            controls.forEach(control => { control.disabled = false; });
        }
    }
}
