# Moon Explorer – instructions for agents

## Language: English only

Everything in this repository and in the app is written in **English**. This
applies even when a request, issue or task description is written in German
(or any other language): translate the intent, and write the result in English.
If a task hands you a non-English UI label to use, translate it. For example,
the default-file-manager toggle is labelled **"Use as default file manager"**.

That covers:

- **App UI:** labels, menus, buttons, settings, dialogs, toasts, error
  messages, tooltips, `aria-label`/`title`/`alt` text, placeholders and sample
  data.
- **Code:** identifiers (variables, functions, types, components, CSS
  classes, storage keys), code comments, log messages and test names.
- **Files and docs:** file and folder names, README, `docs/`, changelogs.
- **Git and GitHub:** commit messages, PR titles and descriptions, review
  comments.

Before opening a pull request, check your changes for umlauts and German words
(for example the German words for file, folder, settings and default):

```sh
git diff origin/main --name-only | xargs grep -n -P "[\x{C4}\x{D6}\x{DC}\x{E4}\x{F6}\x{FC}\x{DF}]"
```

Proper names and user data (such as a user's own folder names) are fine; the
text that the app and the repo provide must be English.

If the app gets translations later, English stays the source language: the
English strings live in the code, and other languages go in separate locale
files.

## Checks before a pull request

All of these must pass before you open or update a pull request:

```sh
npm run build
npm run lint
npm test
npx prettier --check .
```
