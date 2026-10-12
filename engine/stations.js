// Turns Ancher collections into radio stations.

// Ancher collection colour tokens, as dial-marker colours that read on the cream dial face.
export const COLOR_HEX = {
  neutral: '#6b6258', slate: '#4e5f78', gray: '#5f6670', zinc: '#62626b', stone: '#6f665c',
  red: '#C9352B', orange: '#E0650F', amber: '#C77A12', yellow: '#B8930A', lime: '#5E8C12',
  green: '#2F8F45', emerald: '#13896A', teal: '#12817F', cyan: '#0E7FA0', sky: '#1F78C1',
  blue: '#2F62C9', indigo: '#4B4FC4', violet: '#6E45CF', purple: '#8A3FCF', fuchsia: '#AE36B5',
  pink: '#C2387A', rose: '#C93350',
};

export function slugify(name) {
  return name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

// Short dial label: the configured label, or the name cut at a word boundary.
export function dialLabel(name, labels = {}) {
  if (labels[name]) return labels[name];
  if (name.length <= 18) return name;
  const words = name.split(/\s+/);
  let out = '';
  for (const w of words) {
    if ((out + ' ' + w).trim().length > 18) break;
    out = (out + ' ' + w).trim();
  }
  return out || name.slice(0, 18);
}

export function isStation(collection, config) {
  const name = collection.name || '';
  if ((config.exclude || []).includes(name)) return false;
  if ((config.excludePrefixes || []).some((p) => name.startsWith(p))) return false;
  return collection.status !== 'archived';
}

// collections: [{id, name, color}], notesByCollection: {id: [note]}
export function planStations(collections, notesByCollection, config) {
  return collections
    .filter((c) => isStation(c, config))
    .map((c) => {
      const notes = (notesByCollection[c.id] || []).filter((n) => n.status === 'ready');
      return {
        id: c.id,
        slug: slugify(c.name),
        name: c.name,
        label: dialLabel(c.name, config.labels),
        color: COLOR_HEX[c.color] || COLOR_HEX.orange,
        noteCount: notes.length,
        notes,
        onAir: notes.length >= (config.minNotes ?? 3),
      };
    })
    // biggest shelves first, so the dial reads from the richest station
    .sort((a, b) => b.noteCount - a.noteCount || a.name.localeCompare(b.name));
}

// The crossover joins the two richest on-air stations unless the config names a pair.
export function pickCrossover(stations, setting = 'auto') {
  const onAir = stations.filter((s) => s.onAir);
  if (Array.isArray(setting) && setting.length === 2) {
    const [a, b] = setting.map((n) => onAir.find((s) => s.name === n || s.slug === n));
    return a && b ? [a, b] : null;
  }
  return onAir.length >= 2 ? [onAir[0], onAir[1]] : null;
}

// The newest ready note across all stations, for the "Just saved" bulletin.
export function newestSave(stations) {
  const all = stations.flatMap((s) => s.notes.map((n) => ({ note: n, station: s })));
  all.sort((a, b) => String(b.note.created_at).localeCompare(String(a.note.created_at)));
  return all[0] || null;
}
