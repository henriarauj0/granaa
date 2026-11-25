import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mesmo atalho "@/" do tsconfig, para os testes importarem componentes e módulos do app.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
