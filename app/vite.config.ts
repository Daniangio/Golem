import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Allows the browser to reach Firebase emulators even in remote/dev-container setups
      // where ports like 19099/8080 aren't forwarded. The Firebase SDK will talk to the dev
      // server origin, and Vite proxies to the emulator ports.
      "/identitytoolkit.googleapis.com": {
        target: "http://127.0.0.1:19099",
        changeOrigin: true,
      },
      "/securetoken.googleapis.com": {
        target: "http://127.0.0.1:19099",
        changeOrigin: true,
      },
      "/google.firestore.v1.Firestore": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        ws: true,
      },
      // Firestore web SDK also uses REST endpoints under /v1 for batchGet/commit in some flows.
      "/v1": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
});
