# Moon Explorer as the default file manager

Moon Explorer can replace Windows Explorer for opening folders, drives, "This PC" and Win+E.
It only does this **for the current user** (registry hive `HKEY_CURRENT_USER`), **without admin rights**,
and it can be switched back at any time.

- In the app: **Settings → Use as default file manager**
- From an installer or a terminal:

  ```bat
  "Moon Explorer.exe" --set-default      :: register, exit code 0 on success
  "Moon Explorer.exe" --unset-default    :: give everything back to Windows Explorer
  "Moon Explorer.exe" --default-status   :: print the current state as JSON
  ```

- Without the app (moved, deleted, broken): [`scripts/reset-default-file-manager.ps1`](../scripts/reset-default-file-manager.ps1),
  or the manual steps [at the end of this page](#manual-undo).

The code lives in [`electron/default-file-manager/`](../electron/default-file-manager/). It is plain CommonJS with no
dependencies and runs in the Electron main process; how it plugs into the app is described [below](#how-it-fits-in).

## What is changed in the registry

All paths are below `HKEY_CURRENT_USER\Software\Classes` (the per-user part of `HKEY_CLASSES_ROOT`).
`<exe>` is the full path of `Moon Explorer.exe`.

| What | Key | Values |
| --- | --- | --- |
| Folders (double-click, Enter, `start C:\Some\Folder`, other apps opening a folder) | `Folder\shell\MoonExplorer` | `(Default)` = `Open in Moon Explorer`, `Icon` = `<exe>,0`, `AppliesTo` = `System.FileAttributes:>0` |
| | `Folder\shell\MoonExplorer\command` | `(Default)` = `"<exe>" "%1"` |
| | `Folder\shell` | `(Default)` = `MoonExplorer` (makes it the default verb) |
| Drives (`C:\`, USB sticks, …) | `Drive\shell\MoonExplorer` (+ `\command`) | same as above |
| | `Drive\shell` | `(Default)` = `MoonExplorer` |
| "This PC" (desktop icon, `shell:MyComputerFolder`) | `CLSID\{20D04FE0-3AEA-1069-A2D8-08002B30309D}\shell\MoonExplorer` (+ `\command`) | command `"<exe>" "--this-pc"` |
| | `CLSID\{20D04FE0-3AEA-1069-A2D8-08002B30309D}\shell` | `(Default)` = `MoonExplorer` |
| Win+E and "new Explorer window" | `CLSID\{52205fd8-5dfb-447d-801a-d0b52f2e83e1}\shell\opennewwindow\command` | `(Default)` = `"<exe>"`, `DelegateExecute` = *(empty)* |
| Only if another file manager set a default verb on `Directory\shell` (see below) | `Directory\shell` | `(Default)` = `none` (Windows' own value) |

In addition:

- Every key Moon Explorer **creates** gets a marker value `MoonExplorer.Owner` = `Moon Explorer`.
- The backup lives in `HKCU\Software\Luna-OS\Moon Explorer\DefaultFileManager`, value `Backup` (JSON).

### Why these keys

- **Shell verbs + default verb** is how third-party file managers do it ([Files](https://github.com/files-community/Files),
  Directory Opus, …): Windows looks up the default verb of the item's class and runs its `command`.
  Per-user values in `HKCU\Software\Classes` take precedence over the machine-wide `HKLM\Software\Classes`,
  so nothing machine-wide has to change.
- **`Folder`, not `Directory`.** On Windows the machine-wide `Directory\shell` default is `none`, which means
  "use `Folder`'s default". Setting a default verb under `HKCU\Directory\shell` works for ShellExecute, but on
  a double-click a verb with `Position=Top` under `HKCU\Directory\shell` takes over. NordVPN installs one
  ("Send with NordVPN Meshnet"), and testing confirmed that it would then run on every folder double-click.
  A default on `Folder\shell` is honoured in both cases. So Moon Explorer leaves `Directory\shell` alone,
  unless another program put its own default verb there, which would win over `Folder`. In that case the value
  is backed up and set to Windows' own `none` while Moon Explorer is the default, and restored afterwards.
- **`AppliesTo = System.FileAttributes:>0`** limits the verb to real file-system folders. Virtual folders (Recycle Bin,
  Control Panel, Libraries, Network, phones) have no file attributes, so they still open in Windows Explorer.
  Without this filter they would arrive as `::{GUID}` arguments that Moon Explorer can't show.
- **`Drive`** has the same `none` default as `Directory`. A default verb there catches drive roots, which `AppliesTo`
  excludes from the Folder verb.
- **This PC** (`{20D04FE0-…}`) is a virtual folder, so it gets its own verb with `--this-pc`, and Moon Explorer opens its drive overview.
- **Win+E** runs the `opennewwindow` verb of `{52205fd8-…}` ("File Explorer"). Its machine-wide handler is a COM
  object (`DelegateExecute`). An empty `DelegateExecute` next to our command in HKCU hides it, so the command runs. Files uses the same approach.
- Drive roots arrive as `C:"`, not `C:\`, because in `"C:\"` the backslash escapes the closing quote.
  `resolveStart()` in `electron/start.cjs` repairs this.

## Safety rules

1. **HKCU only.** The registry layer opens nothing but `[Microsoft.Win32.Registry]::CurrentUser`, and refuses any key outside
   `HKCU\Software\Classes\…` and `HKCU\Software\Luna-OS…`, both in JS and again in the PowerShell that does the writing.
   It never creates or deletes `Software\Classes` itself. It writes only REG_SZ values and has no recursive delete.
2. **Backup first.** Before the first change, the previous value of everything that gets overwritten is stored, together with
   the list of keys that did not exist before. This is the first operation of every `enable()`, so even an interrupted run
   can be undone (covered by a test that cuts the power at several points).
3. **Only delete what we created.** A key is removed only if Moon Explorer created it (backup list or marker value), and only once
   it is empty. If another program added something to it in the meantime, the key stays and is reported.
4. **Don't clobber others.** On disable, a value is restored only if it still holds what Moon Explorer wrote. If another
   program changed it since (for example another file manager became the default), it is left alone and reported.
5. **Repair keeps the original backup.** Enabling again (for example after the app moved) updates the commands and keeps the
   originally backed-up values, so switching off still returns to the state before Moon Explorer was first enabled.
6. **No backup? Still safe.** If the backup value is lost, the markers still identify Moon Explorer's keys, and a default verb
   is only treated as ours if it says `MoonExplorer`. The only thing that can't be restored then is a non-Windows
   value that was there before (e.g. another file manager's default verb). Re-enable that file manager in its own settings.

## Missing or moved exe

- **App moved or updated to another folder:** on start the app compares the registered command with its own path
  (`status().state === 'stale'`) and asks: **Register again** (update the commands) / **Restore Windows Explorer** / **Later**.
  The settings switch shows the same state and offers **Register again**. (Only the installed app checks this at
  start; a development run would otherwise offer to register `electron.exe`.)
- **Another program took over folders or drives** (`state === 'partial'`, the affected targets say `overridden`): same dialog.
- **App deleted:** double-clicking a folder then gives a Windows error. Run
  `scripts\reset-default-file-manager.ps1` (it doesn't need the exe), or follow the manual steps below.
  The uninstaller runs `"Moon Explorer.exe" --unset-default` before it deletes the app (`build/installer.nsh`),
  but not when it runs as part of an update, so an update keeps the registration.

## Manual undo

The quickest way: open **PowerShell** (no admin) and run

```powershell
powershell -ExecutionPolicy Bypass -File scripts\reset-default-file-manager.ps1 -WhatIf   # show what would change
powershell -ExecutionPolicy Bypass -File scripts\reset-default-file-manager.ps1
```

Or by hand in `regedit`, under `HKEY_CURRENT_USER\Software\Classes`:

1. `Folder\shell`: delete the `(Default)` value if it says `MoonExplorer` (or set it back to what it was), then delete the subkey `MoonExplorer`.
2. `Drive\shell`: same, then delete the subkey `MoonExplorer`.
3. `CLSID\{20D04FE0-3AEA-1069-A2D8-08002B30309D}\shell`: same, then delete the subkey `MoonExplorer`.
4. `CLSID\{52205fd8-5dfb-447d-801a-d0b52f2e83e1}\shell\opennewwindow\command`: delete this key if it has a `MoonExplorer.Owner` value.
5. `Directory\shell`: only if its `(Default)` is `none` and you had another file manager before, set it back to that one's verb
   (the original value is in the backup JSON, see below), or delete the value.
6. Delete any of the parent keys above that are now **empty** and have/had a `MoonExplorer.Owner` value
   (`Folder\shell`, `Folder`, `Drive\shell`, `Drive`, `CLSID\{20D04FE0-…}\shell`, `CLSID\{20D04FE0-…}`,
   `CLSID\{52205fd8-…}\shell\opennewwindow`, `…\shell`, `CLSID\{52205fd8-…}`). Leave keys that have other content.
7. `HKEY_CURRENT_USER\Software\Luna-OS\Moon Explorer\DefaultFileManager`: holds the backup (`Backup`, JSON with `previous`
   for each value). Delete it when done.

The app and the script notify Explorer (`SHChangeNotify(SHCNE_ASSOCCHANGED)`). After editing by hand, close open Explorer
windows if one still behaves the old way.

## How it fits in

| Path | What it does |
| --- | --- |
| `electron/default-file-manager/layout.cjs` | Which keys and values are written, and the allowed HKCU paths |
| `electron/default-file-manager/manager.cjs` | `status()`, `enable()` (also repairs) and `disable()`, with the backup and the rules above |
| `electron/default-file-manager/registry.cjs` | `PowerShellRegistry` (the real HKCU, through Windows PowerShell) and `MemoryRegistry` (an in-memory fake for the tests) |
| `electron/default-file-manager/cli.cjs` | `--set-default`, `--unset-default`, `--default-status` |
| `electron/default-file-manager/index.cjs` | The glue `electron/main.cjs` uses: `handleCliFlags()` before the single-instance lock, `status()` / `setEnabled()` for the IPC channels `sys:defaultFileManager` and `sys:setDefaultFileManager`, and `checkOnStartup()` once the window shows |
| `electron/start.cjs` | Turns what Windows passes (`"C:\Some\Folder"`, `C:"`, `--this-pc`, `::{GUID}`) into what to open |
| `src/explorer/DefaultFileManagerSetting.tsx` | The switch in **Settings** |

- The UI reaches it through `window.moon.defaultFileManager()` and `window.moon.setDefaultFileManager(enabled)`
  (`MoonBridge` in `src/fs/types.ts`). Outside Windows both report `state: 'unsupported'` and the switch is disabled.
- In development (`npm run app`) the registered command is `"electron.exe" "<app folder>" "%1"`. Packaged, it is `"Moon Explorer.exe" "%1"`.
- *Show in Windows Explorer* keeps using `explorer.exe <path>`. Tested: it opens Explorer and does not loop back
  into Moon Explorer, for folders and for `::{GUID}` items alike. Items without a file-system path (`::{GUID}`,
  `shell:…`) that reach Moon Explorer are handed to Windows Explorer the same way.
- `--this-pc` and the flags above start with `-` so they are never mistaken for a path. Real paths from Windows are always absolute.

## Tests

```sh
npm run test:main     # also part of npm test
```

The register/unregister tests run against `MemoryRegistry`, an in-memory, case-insensitive fake, so they never touch the real
registry. One test reads (never writes) the real HKCU on Windows to check the PowerShell bridge.
