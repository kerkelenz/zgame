/** Finished pictures dropped into client/src/assets/art/<id>.png (or .webp/.jpg); bundled and hashed by the build. */
const files = import.meta.glob('./assets/art/*.{png,webp,jpg,jpeg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const byId: Record<string, string> = {};
const thumbById: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/.[a-z]+$/i, '');
  if (name.endsWith('.thumb')) thumbById[name.slice(0, -6)] = url; else byId[name] = url;
}

/** the full-size picture (details pages) */
export const artFile = (id: string): string | undefined => byId[id];
/** the small square copy for icons and lists, or the full picture when there is no small one */
export const artThumb = (id: string): string | undefined => thumbById[id] ?? byId[id];
