# Moon Explorer as an Open/Save dialog

Moon Explorer can run as a file dialog: the whole explorer, with a Moon-styled bar at the bottom for
the file name, the file type and **Save** / **Open** / **Cancel**. It returns the chosen path to
whatever started it.

This is Moon Explorer's **own** dialog. It does **not** replace the Open/Save window that Windows
draws inside other programs (Word, a browser, …) — Windows has no supported way to do that.

## Running it

```bat
"Moon Explorer.exe" --save-dialog --name "notes.txt" --filter "Text:txt,md" --filter "All files:*" --result out.txt
"Moon Explorer.exe" --open-dialog --filter "Images:png,jpg,webp" --result out.txt
"Moon Explorer.exe" --pick-folder --result out.txt
```

| Flag | What it does |
| --- | --- |
| `--save-dialog` / `--open-dialog` / `--pick-folder` | Which dialog to show. |
| `--name <name>` | The suggested file name (save). |
| `--filter "<label>:<ext>,<ext>"` | A file-type entry; repeatable. `*` means every file. |
| `--start-dir <path>` | The folder to open in (defaults to Downloads, then Home). |
| `--picker-title <text>` | The window title. |
| `--result <file>` | Where the chosen path is written. |

The chosen path is written to the `--result` file **and** printed to standard output. On **Cancel**
the result file stays empty and the exit code is `1`; on a choice the exit code is `0`.

- **Save:** type a name (or click a file to reuse its name) and choose a folder. If the name has no
  extension, the file type's first extension is added. Replacing an existing file asks first.
- **Open:** pick one file (double-click confirms).
- **Select folder:** returns the folder you are in.

A dialog never changes your saved tabs or settings.

## How it fits in

`electron/picker.cjs` reads the flags and hands the result back. `electron/main.cjs` gives a picker
launch its own window (no single-instance lock, so every caller gets its own) and exposes it over the
IPC channels `sys:picker` and `picker:resolve`. The bar is `PickerBar` in `src/App.tsx`, and the
logic (`confirmPicker`, filters, the replace prompt) lives on `Workspace` in
`src/explorer/model/workspace.ts`.
