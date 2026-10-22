import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "nestjs/index": "src/nestjs/index.ts",
    "d1/index": "src/d1/index.ts",
    "client/index": "src/client/index.ts",
  },


  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ["@nestjs/common", "@nestjs/core", "reflect-metadata", "rxjs"],
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".mjs",
    };
  },
});

