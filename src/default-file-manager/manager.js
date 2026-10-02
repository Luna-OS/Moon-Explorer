'use strict';
// Register / unregister Moon Explorer as the default file manager (per user, HKCU only).
//
// Rules this file guarantees (and test/manager.test.js checks):
//  - The previous value of everything it overwrites is backed up (in the registry, STATE_KEY) before any change.
//  - Keys it creates carry a MARKER value; it only ever deletes keys it created, and only once they are empty.
//  - Disabling restores a value only if it still holds what Moon Explorer wrote. If another program changed it
//    in the meantime, it is left alone and reported.

const L = require('./layout');

const BACKUP_VERSION = 1;

const lc = (s) => s.toLowerCase();
const valueId = (key, name) => `${lc(key)}|${lc(name)}`;

function getKey(snapshot, key) {
  const hit = Object.keys(snapshot).find((k) => lc(k) === lc(key));
  return hit ? snapshot[hit] : null;
}

function getValue(snapshot, key, name) {
  const k = getKey(snapshot, key);
  if (!k) return null;
  const hit = Object.keys(k.values).find((n) => lc(n) === lc(name));
  return hit === undefined ? null : k.values[hit];
}

const hasMarker = (snapshot, key) => getValue(snapshot, key, L.MARKER) !== null;

function uniqueKeys(keys) {
  const seen = new Map();
  for (const k of keys) if (!seen.has(lc(k))) seen.set(lc(k), k);
  return [...seen.values()];
}

/** Every key that has to be read to plan any change. */
function keysToRead() {
  const keys = [];
  for (const t of L.TARGETS) {
    for (const w of L.targetValueNames(t)) keys.push(...L.creatableChain(w.key));
    for (const b of t.blockers || []) keys.push(b.key);
  }
  keys.push(...L.creatableChain(L.STATE_KEY));
  return uniqueKeys(keys);
}

function parseBackup(snapshot) {
  const raw = getValue(snapshot, L.STATE_KEY, L.BACKUP_VALUE);
  if (!raw) return null;
  try {
    const b = JSON.parse(raw);
    if (b && b.version === BACKUP_VERSION && Array.isArray(b.values) && Array.isArray(b.createdKeys)) return b;
  } catch {
    /* unreadable backup: fall back to the markers */
  }
  return null;
}

/**
 * @param {object} opts
 * @param {{read: Function, apply: Function}} opts.registry  registry implementation (see registry.js)
 * @param {string} opts.exePath        executable to register (MoonExplorer.exe; electron.exe in development)
 * @param {string[]} [opts.launchArgs] arguments placed before the path, e.g. the app folder in development
 * @param {(p: string) => boolean} [opts.fileExists]  used to detect a moved or deleted exe
 * @param {() => Date} [opts.now]
 */
function createDefaultFileManager({ registry, exePath, launchArgs = [], fileExists = () => true, now = () => new Date() }) {
  async function snapshot() {
    return registry.read(keysToRead());
  }

  function plannedWrites() {
    return L.TARGETS.flatMap((t) => L.targetWrites(t, exePath, launchArgs).map((w) => ({ ...w, target: t.id })));
  }

  /** Current state, per target. */
  async function status() {
    if (!exePath) throw new Error('exePath is required');
    const snap = await snapshot();
    const backup = parseBackup(snap);
    const targets = L.TARGETS.map((t) => {
      const writes = L.targetWrites(t, exePath, launchArgs);
      const takeover = writes.find((w) => w.takeover);
      const command = writes.find((w) => w.command);
      const current = getValue(snap, command.key, command.name);
      const ownsTakeover =
        t.kind === 'verb'
          ? getValue(snap, takeover.key, '') === L.VERB
          : hasMarker(snap, command.key) || (backup && backup.values.some((v) => valueId(v.key, v.name) === valueId(command.key, command.name) && v.written === current));
      let state;
      if (!ownsTakeover) state = current !== null && t.kind === 'verb' ? 'overridden' : 'off';
      else if (current !== command.data) state = 'stale';
      else if ((t.blockers || []).some((b) => !b.allowed.includes(getValue(snap, b.key, b.name)))) state = 'overridden';
      else state = 'on';
      return { id: t.id, label: t.label, state, command: ownsTakeover ? current : null };
    });

    const registeredCommand = targets.map((t) => t.command).find(Boolean) || null;
    const registeredExe = L.exeFromCommand(registeredCommand);
    const on = targets.filter((t) => t.state === 'on').length;
    const leftovers = targets.some((t) => t.state !== 'off') || !!backup;
    let state;
    if (on === targets.length) state = 'on';
    else if (!leftovers) state = 'off';
    else if (targets.some((t) => t.state === 'stale')) state = 'stale'; // exe moved / renamed
    else state = 'partial'; // e.g. another file manager took over folders since

    return {
      state,
      enabled: state !== 'off',
      needsAttention: state === 'stale' || state === 'partial',
      currentExe: exePath,
      registeredExe,
      registeredExeExists: registeredExe ? !!fileExists(registeredExe) : null,
      hasBackup: !!backup,
      targets,
    };
  }

  /** Register (or repair a registration that points to an old exe). Safe to call repeatedly. */
  async function enable() {
    if (!exePath) throw new Error('exePath is required');
    if (!fileExists(exePath)) throw new Error(`Moon Explorer executable not found: ${exePath}`);
    const snap = await snapshot();
    const old = parseBackup(snap);
    const writes = plannedWrites();
    // Neutralise values of other programs that would win over ours (kept while a backup of them exists).
    for (const t of L.TARGETS) {
      for (const b of t.blockers || []) {
        const cur = getValue(snap, b.key, b.name);
        const inBackup = old && old.values.some((v) => valueId(v.key, v.name) === valueId(b.key, b.name));
        if (inBackup || !b.allowed.includes(cur)) writes.unshift({ key: b.key, name: b.name, data: b.neutral, target: t.id });
      }
    }

    // Keys to create (and later remove): missing now, or created by us earlier (marker / old backup).
    const oldCreated = new Set((old ? old.createdKeys : []).map(lc));
    const created = [];
    const allKeys = uniqueKeys([...writes.flatMap((w) => L.creatableChain(w.key)), ...L.creatableChain(L.STATE_KEY)]);
    for (const key of allKeys) {
      if (!getKey(snap, key) || hasMarker(snap, key) || oldCreated.has(lc(key))) created.push(key);
    }
    const createdSet = new Set(created.map(lc));

    // Previous values of everything we overwrite in keys that are not ours.
    const oldValues = new Map((old ? old.values : []).map((v) => [valueId(v.key, v.name), v]));
    const values = [];
    for (const w of writes) {
      if (createdSet.has(lc(w.key))) continue;
      const id = valueId(w.key, w.name);
      const prev = oldValues.has(id)
        ? oldValues.get(id).previous
        : (() => {
            const cur = getValue(snap, w.key, w.name);
            // Without a backup, a default verb that already says MoonExplorer is a leftover of ours, not the original.
            return w.takeover && cur === L.VERB ? null : cur;
          })();
      values.push({ key: w.key, name: w.name, previous: prev, written: w.data });
    }

    const backup = {
      version: BACKUP_VERSION,
      updatedAt: now().toISOString(),
      exePath,
      createdKeys: created,
      values,
    };

    const ops = [];
    // 1. Backup first, so an interrupted run can always be undone.
    ops.push({ op: 'setValue', key: L.STATE_KEY, name: L.BACKUP_VALUE, data: JSON.stringify(backup) });
    // 2. Mark every key we create (top-down; setValue creates the key).
    for (const key of created) ops.push({ op: 'setValue', key, name: L.MARKER, data: L.MARKER_DATA });
    // 3. The actual registration; the default-verb switch comes last per target.
    for (const w of writes) ops.push({ op: 'setValue', key: w.key, name: w.name, data: w.data });

    await registry.apply(ops);
    return status();
  }

  /** Undo everything enable() did. Works from the backup, or from the markers if the backup is gone. */
  async function disable() {
    const snap = await snapshot();
    const backup = parseBackup(snap);
    const created = new Map(); // lower-case -> key, for every key Moon Explorer created
    for (const key of backup ? backup.createdKeys : []) created.set(lc(key), key);
    for (const key of keysToRead()) if (hasMarker(snap, key)) created.set(lc(key), key);

    const ops = [];
    const skipped = [];
    const byId = new Map((backup ? backup.values : []).map((v) => [valueId(v.key, v.name), v]));

    for (const t of L.TARGETS) {
      for (const w of L.targetValueNames(t)) {
        const current = getValue(snap, w.key, w.name);
        if (current === null) continue;
        if (created.has(lc(w.key))) {
          ops.push({ op: 'deleteValue', key: w.key, name: w.name });
          continue;
        }
        const entry = byId.get(valueId(w.key, w.name));
        const ours = entry ? current === entry.written : w.takeover && current === L.VERB;
        if (!ours) {
          if (entry || w.takeover) skipped.push({ key: w.key, name: w.name, current });
          continue;
        }
        const previous = entry ? entry.previous : null;
        ops.push(
          previous === null
            ? { op: 'deleteValue', key: w.key, name: w.name }
            : { op: 'setValue', key: w.key, name: w.name, data: previous },
        );
      }
    }

    // The backup goes last among the values, then our (now hopefully empty) keys, deepest first.
    if (getValue(snap, L.STATE_KEY, L.BACKUP_VALUE) !== null) {
      ops.push({ op: 'deleteValue', key: L.STATE_KEY, name: L.BACKUP_VALUE });
    }
    const createdKeys = [...created.values()].filter(L.isAllowedKey).sort((a, b) => L.depth(b) - L.depth(a));
    for (const key of createdKeys) {
      if (!getKey(snap, key)) continue;
      ops.push({ op: 'deleteValue', key, name: L.MARKER });
      ops.push({ op: 'deleteKeyIfEmpty', key });
    }

    const results = await registry.apply(ops);
    const kept = ops
      .map((op, i) => (op.op === 'deleteKeyIfEmpty' && results[i] === 'kept' ? op.key : null))
      .filter(Boolean);
    return { ...(exePath ? await status() : { state: 'off', enabled: false }), skipped, keptKeys: kept };
  }

  return { status, enable, disable, repair: enable, keysToRead };
}

module.exports = { createDefaultFileManager, keysToRead, parseBackup, BACKUP_VERSION };
