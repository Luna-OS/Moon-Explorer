'use strict';
// Which HKCU keys Moon Explorer writes to become the default file manager.
// All paths are relative to HKEY_CURRENT_USER. See docs/default-file-manager.md.

const CLASSES = 'Software\\Classes';
const VERB = 'MoonExplorer';
const VERB_LABEL = 'In Moon Explorer öffnen';

/** Value written into every key Moon Explorer creates, so it can find its own keys even without a backup. */
const MARKER = 'MoonExplorer.Owner';
const MARKER_DATA = 'Moon Explorer';

/** Where the backup of the previous values lives (one REG_SZ holding JSON). */
const STATE_KEY = 'Software\\Luna-OS\\Moon Explorer\\DefaultFileManager';
const BACKUP_VALUE = 'Backup';

const THIS_PC_CLSID = '{20D04FE0-3AEA-1069-A2D8-08002B30309D}';
const FILE_EXPLORER_CLSID = '{52205fd8-5dfb-447d-801a-d0b52f2e83e1}';

/** Argument the "This PC" verb passes so the app opens its drives overview. */
const THIS_PC_ARG = '--this-pc';

/**
 * Writes are only ever allowed in these HKCU subtrees. Software\Classes itself is never created or removed;
 * Software\Luna-OS may be, when Moon Explorer was the one that created it.
 */
const ALLOWED_ROOTS = [`${CLASSES}\\`, 'Software\\Luna-OS'];
const underRoot = (key) =>
  key.startsWith(`${CLASSES}\\`) || key === 'Software\\Luna-OS' || key.startsWith('Software\\Luna-OS\\');

/** Only items with file attributes, i.e. real file-system folders – not the Recycle Bin, Control Panel, Libraries, … */
const FILESYSTEM_ONLY = 'System.FileAttributes:>0';

/**
 * The targets Moon Explorer takes over.
 * - kind 'verb': adds shell\MoonExplorer\command and makes it the default verb of `shellKey`.
 * - kind 'command': overrides an existing verb's command (used for Win+E, the way Files does it).
 *
 * Folders are taken over at Folder\shell, not Directory\shell: with a default verb under HKCU Directory\shell, a
 * verb with Position=Top there (NordVPN adds one) becomes the double-click action instead. Folder\shell is consulted
 * after Directory's "none", and AppliesTo keeps virtual folders with Explorer. `blockers` are values another program
 * can set that win over ours (status() then reports the target as 'overridden').
 */
const TARGETS = [
  {
    id: 'folder',
    label: 'Ordner',
    kind: 'verb',
    shellKey: `${CLASSES}\\Folder\\shell`,
    appliesTo: FILESYSTEM_ONLY,
    args: ['%1'],
    // Another file manager's default verb on Directory wins over Folder; enable() backs it up and sets Windows' own "none".
    blockers: [{ key: `${CLASSES}\\Directory\\shell`, name: '', allowed: [null, '', 'none'], neutral: 'none' }],
  },
  { id: 'drive', label: 'Laufwerke', kind: 'verb', shellKey: `${CLASSES}\\Drive\\shell`, args: ['%1'] },
  {
    id: 'this-pc',
    label: 'Dieser PC',
    kind: 'verb',
    shellKey: `${CLASSES}\\CLSID\\${THIS_PC_CLSID}\\shell`,
    args: [THIS_PC_ARG],
  },
  {
    id: 'win-e',
    label: 'Win+E / Explorer-Fenster',
    kind: 'command',
    commandKey: `${CLASSES}\\CLSID\\${FILE_EXPLORER_CLSID}\\shell\\opennewwindow\\command`,
    args: [],
  },
];

const quote = (s) => `"${s}"`;

/** `"<exe>" "<launch arg>" ... "<arg>"` – every part quoted, as the shell expects. */
function buildCommand(exePath, launchArgs, args) {
  return [exePath, ...launchArgs, ...args].map(quote).join(' ');
}

/** The executable a registered command points to (first token, quoted or not). */
function exeFromCommand(command) {
  if (typeof command !== 'string') return null;
  const m = command.match(/^\s*"([^"]+)"/) || command.match(/^\s*(\S+)/);
  return m ? m[1] : null;
}

/**
 * Every value one target writes. `takeover` marks the value that actually makes Windows use Moon Explorer;
 * the others are only Moon Explorer's own verb definition.
 */
function targetWrites(target, exePath, launchArgs = []) {
  const command = buildCommand(exePath, launchArgs, target.args);
  if (target.kind === 'verb') {
    const verbKey = `${target.shellKey}\\${VERB}`;
    return [
      { key: verbKey, name: '', data: VERB_LABEL },
      { key: verbKey, name: 'Icon', data: `${exePath},0` },
      ...(target.appliesTo ? [{ key: verbKey, name: 'AppliesTo', data: target.appliesTo }] : []),
      { key: `${verbKey}\\command`, name: '', data: command, command: true },
      { key: target.shellKey, name: '', data: VERB, takeover: true },
    ];
  }
  return [
    { key: target.commandKey, name: '', data: command, command: true, takeover: true },
    // An empty DelegateExecute in HKCU hides the COM handler from HKLM so the command above is used.
    { key: target.commandKey, name: 'DelegateExecute', data: '' },
  ];
}

/** Value names a target may have written into `key`, independent of the exe path (used when disabling). */
function targetValueNames(target) {
  return [
    ...targetWrites(target, 'x').map(({ key, name, takeover }) => ({ key, name, takeover: !!takeover })),
    ...(target.blockers || []).map(({ key, name }) => ({ key, name, takeover: false })),
  ];
}

/** `a\b\c` -> [`a`, `a\b`, `a\b\c`] */
function ancestry(key) {
  const parts = key.split('\\');
  return parts.map((_, i) => parts.slice(0, i + 1).join('\\'));
}

/** Keys Moon Explorer may create for `key`: everything below the allowed root (Software\Classes, Software\Luna-OS). */
function creatableChain(key) {
  return ancestry(key).filter(underRoot);
}

function isAllowedKey(key) {
  return (
    typeof key === 'string' &&
    !key.includes('/') &&
    !key.split('\\').some((p) => p === '' || p === '.' || p === '..') &&
    underRoot(key)
  );
}

const depth = (key) => key.split('\\').length;

module.exports = {
  CLASSES,
  VERB,
  VERB_LABEL,
  MARKER,
  MARKER_DATA,
  STATE_KEY,
  BACKUP_VALUE,
  THIS_PC_CLSID,
  FILE_EXPLORER_CLSID,
  THIS_PC_ARG,
  ALLOWED_ROOTS,
  TARGETS,
  FILESYSTEM_ONLY,
  buildCommand,
  exeFromCommand,
  targetWrites,
  targetValueNames,
  ancestry,
  creatableChain,
  isAllowedKey,
  depth,
};
