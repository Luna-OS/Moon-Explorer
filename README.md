# Moon-Explorer

## Default file manager

Moon Explorer can open folders, drives, "This PC" and Win+E instead of Windows
Explorer (per user, no admin rights), and switch back cleanly:
`"Moon Explorer.exe" --set-default` / `--unset-default`, or the setting
„Als Standard-Dateimanager verwenden“. See
[docs/default-file-manager.md](docs/default-file-manager.md).

```sh
node --test "src/default-file-manager/test/*.test.js"
```
