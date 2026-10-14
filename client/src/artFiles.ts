/** Finished pictures dropped into client/src/assets/art/<id>.png (or .webp/.jpg); bundled and hashed by the build. */
const files = import.meta.glob('./assets/art/*.{png,webp,jpg,jpeg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const byId: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  const id = path.slice(path.lastIndexOf('/') + 1).replace(/\.[a-z]+$/i, '');
  byId[id] = url;
}

export const artFile = (id: string): string | undefined => byId[id];
