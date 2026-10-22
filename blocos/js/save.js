// Salvamento no navegador (localStorage): lista de mundos, mundos e opções.
const LIST = 'blocos.worlds';
const SETTINGS = 'blocos.settings';
const WORLD = (id) => 'blocos.world.' + id;

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function listWorlds() {
  return read(LIST, []).sort((a, b) => (b.played || 0) - (a.played || 0));
}
export function saveWorldMeta(meta) {
  const list = read(LIST, []).filter((w) => w.id !== meta.id);
  list.push(meta);
  return write(LIST, list);
}
export function loadWorldData(id) {
  return read(WORLD(id), null);
}
export function saveWorldData(id, data) {
  return write(WORLD(id), data);
}
export function deleteWorld(id) {
  write(LIST, read(LIST, []).filter((w) => w.id !== id));
  try {
    localStorage.removeItem(WORLD(id));
  } catch (e) {
    /* sem acesso ao armazenamento */
  }
}
export function loadSettings(defaults) {
  return { ...defaults, ...read(SETTINGS, {}) };
}
export function saveSettings(s) {
  write(SETTINGS, s);
}
