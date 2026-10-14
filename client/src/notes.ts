/** The notification centre: every toast that appeared, kept so a completed build or an arrival is not lost when the pop-up fades. Pure helpers. */
export interface Note { id: number; text: string; kind: 'info' | 'alert' | 'error'; at: number; read: boolean }
export const MAX_NOTES = 40;

/** newest first; the oldest drop off when there are too many; a repeat of the same text within a few seconds is merged */
export function pushNote(list: Note[], n: Omit<Note, 'read'>, max = MAX_NOTES): Note[] {
  const top = list[0];
  if (top && top.text === n.text && n.at - top.at < 5000) return [{ ...top, at: n.at, read: false }, ...list.slice(1)];
  return [{ ...n, read: false }, ...list].slice(0, max);
}
export const unreadNotes = (list: Note[]) => list.filter((n) => !n.read).length;
export const markAllRead = (list: Note[]): Note[] => list.map((n) => (n.read ? n : { ...n, read: true }));
