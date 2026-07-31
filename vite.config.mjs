import { defineConfig } from "npm:vite";
import vue from "npm:@vitejs/plugin-vue";
import "npm:vue/compiler-sfc";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
    plugins: [vue()],

    clearScreen: false,

    server: {
	port: 1420,
	strictPort: true,
	host: host || false,
	hmr: host
	    ? {
		protocol: "ws",
		host,
		port: 1421,
	    }
	    : undefined,
	watch: {
	    ignored: ["**/src-tauri/**"],
	},
    },
});