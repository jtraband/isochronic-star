import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from a subpath such as
  // https://<user>.github.io/isochronic-star/ as well as from a site root.
  base: './',
});
