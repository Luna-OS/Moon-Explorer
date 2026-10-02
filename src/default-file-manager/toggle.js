// Settings toggle "Als Standard-Dateimanager verwenden" – plain DOM, no framework, for the renderer.
//
//   <script src="default-file-manager/toggle.js"></script>
//   window.mountDefaultFileManagerToggle(document.querySelector('#settings-default-fm'), {
//     status: () => window.moon.defaultFm.status(),          // ipcRenderer.invoke('default-fm:status')
//     setEnabled: (on) => window.moon.defaultFm.set(on),     // ipcRenderer.invoke('default-fm:set', on)
//   });
//
// Plain script in the browser (defines window.mountDefaultFileManagerToggle), CommonJS in Node (tests).

const TEXT = {
  label: 'Als Standard-Dateimanager verwenden',
  hint: 'Ordner, Laufwerke, „Dieser PC“ und Win+E öffnen Moon Explorer statt des Windows Explorers. Nur für dein Benutzerkonto, ohne Administratorrechte.',
  on: 'Aktiv',
  off: 'Aus – Windows Explorer ist Standard',
  stale: 'Die Registrierung zeigt auf eine andere Moon-Explorer-Datei. Schalter aus- und wieder einschalten oder unten neu registrieren.',
  partial: 'Ein anderes Programm hat einen Teil der Einträge übernommen.',
  repair: 'Neu registrieren',
  unsupported: 'Nur unter Windows verfügbar.',
  busy: 'Wird gespeichert …',
};

function mountDefaultFileManagerToggle(container, api, doc = container.ownerDocument) {
  container.textContent = '';
  const row = doc.createElement('label');
  row.className = 'dfm-toggle';
  const input = doc.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  const title = doc.createElement('span');
  title.className = 'dfm-toggle__label';
  title.textContent = TEXT.label;
  row.append(input, title);

  const hint = doc.createElement('p');
  hint.className = 'dfm-toggle__hint';
  hint.textContent = TEXT.hint;
  const state = doc.createElement('p');
  state.className = 'dfm-toggle__state';
  state.setAttribute('aria-live', 'polite');
  const repair = doc.createElement('button');
  repair.type = 'button';
  repair.textContent = TEXT.repair;
  repair.hidden = true;
  container.append(row, hint, state, repair);

  function render(s) {
    input.disabled = s.state === 'unsupported';
    input.checked = !!s.enabled;
    input.setAttribute('aria-checked', String(!!s.enabled));
    repair.hidden = !s.needsAttention;
    state.textContent =
      s.state === 'unsupported' ? TEXT.unsupported : s.state === 'stale' ? TEXT.stale : s.state === 'partial' ? TEXT.partial : s.enabled ? TEXT.on : TEXT.off;
    state.dataset.state = s.state;
  }

  async function run(fn) {
    input.disabled = true;
    repair.disabled = true;
    state.textContent = TEXT.busy;
    try {
      render(await fn());
    } catch (err) {
      state.textContent = `Fehler: ${err && err.message ? err.message : err}`;
      state.dataset.state = 'error';
      input.disabled = false;
    } finally {
      repair.disabled = false;
    }
  }

  input.addEventListener('change', () => run(() => api.setEnabled(input.checked)));
  repair.addEventListener('click', () => run(() => api.setEnabled(true)));
  const ready = run(() => api.status());
  return { refresh: () => run(() => api.status()), ready };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { mountDefaultFileManagerToggle, TEXT };
else globalThis.mountDefaultFileManagerToggle = mountDefaultFileManagerToggle;
