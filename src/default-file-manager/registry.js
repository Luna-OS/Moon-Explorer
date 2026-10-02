'use strict';
// Registry access for the default-file-manager feature.
//
// Interface (all keys are relative to HKEY_CURRENT_USER, e.g. "Software\\Classes\\Directory\\shell"):
//   read(keys)  -> { [key]: null | { values: { [name]: string }, subkeys: string[] } }   ('' is the default value)
//   apply(ops)  -> [result per op]; ops run in order:
//     { op: 'setValue', key, name, data }   creates the key if needed, writes REG_SZ
//     { op: 'deleteValue', key, name }      no-op if missing
//     { op: 'deleteKeyIfEmpty', key }       deletes only a key with no values and no subkeys -> 'deleted' | 'kept' | 'missing'
//
// There is no recursive delete and no way to address another hive: the real implementation only ever opens
// [Microsoft.Win32.Registry]::CurrentUser, and both implementations refuse keys outside the allowed roots.

const { execFile } = require('child_process');
const { isAllowedKey } = require('./layout');

function assertAllowed(key) {
  if (!isAllowedKey(key)) throw new Error(`Registry key outside the allowed HKCU paths: ${key}`);
}

function validateOps(ops) {
  for (const op of ops) {
    if (!['setValue', 'deleteValue', 'deleteKeyIfEmpty'].includes(op.op)) throw new Error(`Unknown registry op: ${op.op}`);
    assertAllowed(op.key);
    if (op.op !== 'deleteKeyIfEmpty' && typeof op.name !== 'string') throw new Error('Value name must be a string');
    if (op.op === 'setValue' && typeof op.data !== 'string') throw new Error('Only REG_SZ string data is supported');
  }
}

// ------------------------------------------------------------------ in-memory fake (tests, dry runs)

/** Case-insensitive like the real registry. Seed with { 'Software\\Classes\\X': { '': 'default', Name: 'v' } }. */
class MemoryRegistry {
  constructor(seed = {}) {
    this.keys = new Map(); // lower-case path -> { path, values: Map(lower name -> { name, data }) }
    this.log = [];
    this._ensure('Software\\Classes'); // always present in a real HKCU
    for (const [key, values] of Object.entries(seed)) {
      this._ensure(key);
      for (const [name, data] of Object.entries(values || {})) this._set(key, name, data);
    }
  }

  _ensure(key) {
    const parts = key.split('\\');
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('\\');
      if (!this.keys.has(p.toLowerCase())) this.keys.set(p.toLowerCase(), { path: p, values: new Map() });
    }
    return this.keys.get(key.toLowerCase());
  }

  _set(key, name, data) {
    this._ensure(key).values.set(name.toLowerCase(), { name, data });
  }

  _subkeys(key) {
    const prefix = `${key.toLowerCase()}\\`;
    return [...this.keys.values()]
      .filter((k) => k.path.toLowerCase().startsWith(prefix) && !k.path.slice(prefix.length).includes('\\'))
      .map((k) => k.path.slice(prefix.length));
  }

  async read(keys) {
    const out = {};
    for (const key of keys) {
      const k = this.keys.get(key.toLowerCase());
      out[key] = k
        ? { values: Object.fromEntries([...k.values.values()].map((v) => [v.name, v.data])), subkeys: this._subkeys(key) }
        : null;
    }
    return out;
  }

  async apply(ops) {
    validateOps(ops);
    return ops.map((op) => {
      this.log.push(op);
      const k = this.keys.get(op.key.toLowerCase());
      if (op.op === 'setValue') {
        this._set(op.key, op.name, op.data);
        return 'ok';
      }
      if (op.op === 'deleteValue') {
        if (k) k.values.delete(op.name.toLowerCase());
        return 'ok';
      }
      if (!k) return 'missing';
      if (k.values.size || this._subkeys(op.key).length) return 'kept';
      this.keys.delete(op.key.toLowerCase());
      return 'deleted';
    });
  }

  /** Test helper: plain snapshot of everything. */
  dump() {
    const out = {};
    for (const k of [...this.keys.values()].sort((a, b) => a.path.localeCompare(b.path))) {
      out[k.path] = Object.fromEntries([...k.values.values()].map((v) => [v.name, v.data]));
    }
    return out;
  }
}

// ------------------------------------------------------------------ real registry (Windows, HKCU only)

// Runs inside Windows PowerShell 5.1. The request comes in through an environment variable as JSON,
// so no path or command line ever needs shell quoting.
const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$req = $env:MOON_REG_REQUEST | ConvertFrom-Json
$hkcu = [Microsoft.Win32.Registry]::CurrentUser
function Assert-Allowed([string]$k) {
  if (-not ($k -like 'Software\Classes\*' -or $k -eq 'Software\Luna-OS' -or $k -like 'Software\Luna-OS\*')) { throw "refused key: $k" }
}
$out = @()
if ($req.mode -eq 'read') {
  foreach ($k in $req.keys) {
    Assert-Allowed $k
    $key = $hkcu.OpenSubKey($k)
    if ($null -eq $key) { $out += ,@{ key = $k; exists = $false }; continue }
    $vals = @()
    foreach ($n in $key.GetValueNames()) {
      $v = $key.GetValue($n, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      if ($v -is [array]) { $v = ($v -join "\n") }
      $vals += ,@{ name = $n; data = [string]$v }
    }
    $out += ,@{ key = $k; exists = $true; values = $vals; subkeys = @($key.GetSubKeyNames()) }
    $key.Close()
  }
} else {
  foreach ($op in $req.ops) {
    Assert-Allowed $op.key
    try {
      switch ($op.op) {
        'setValue' {
          $key = $hkcu.CreateSubKey($op.key)
          $key.SetValue([string]$op.name, [string]$op.data, [Microsoft.Win32.RegistryValueKind]::String)
          $key.Close(); $out += 'ok'
        }
        'deleteValue' {
          $key = $hkcu.OpenSubKey($op.key, $true)
          if ($null -ne $key) { $key.DeleteValue([string]$op.name, $false); $key.Close() }
          $out += 'ok'
        }
        'deleteKeyIfEmpty' {
          $key = $hkcu.OpenSubKey($op.key)
          if ($null -eq $key) { $out += 'missing' }
          else {
            $empty = ($key.SubKeyCount -eq 0) -and ($key.ValueCount -eq 0)
            $key.Close()
            if ($empty) { $hkcu.DeleteSubKey($op.key, $false); $out += 'deleted' } else { $out += 'kept' }
          }
        }
        default { throw "unknown op: $($op.op)" }
      }
    } catch {
      $out += ('error: ' + $_.Exception.Message)
      break
    }
  }
  # Tell running Explorer windows (and the desktop) that associations changed: SHCNE_ASSOCCHANGED.
  try {
    Add-Type -Namespace MoonExplorer -Name Shell -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, uint f, System.IntPtr a, System.IntPtr b);'
    [MoonExplorer.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
  } catch { }
}
ConvertTo-Json -InputObject @($out) -Depth 6 -Compress
`;

const ENCODED_SCRIPT = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');

class PowerShellRegistry {
  constructor({ powershell = 'powershell.exe', timeout = 30000 } = {}) {
    if (process.platform !== 'win32') throw new Error('The Windows registry is only available on Windows');
    this.powershell = powershell;
    this.timeout = timeout;
  }

  _run(request) {
    return new Promise((resolve, reject) => {
      execFile(
        this.powershell,
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', ENCODED_SCRIPT],
        {
          windowsHide: true,
          timeout: this.timeout,
          encoding: 'utf8',
          env: { ...process.env, MOON_REG_REQUEST: JSON.stringify(request) },
        },
        (err, stdout, stderr) => {
          if (err) return reject(new Error(`Registry access failed: ${(stderr || err.message).trim()}`));
          try {
            const parsed = JSON.parse(stdout.trim() || '[]');
            resolve(Array.isArray(parsed) ? parsed : [parsed]);
          } catch {
            reject(new Error(`Unexpected registry output: ${stdout.slice(0, 200)}`));
          }
        },
      );
    });
  }

  async read(keys) {
    keys.forEach(assertAllowed);
    const rows = await this._run({ mode: 'read', keys });
    const out = {};
    for (const row of rows) {
      out[row.key] = row.exists
        ? {
            values: Object.fromEntries((row.values || []).map((v) => [v.name, v.data])),
            subkeys: row.subkeys || [],
          }
        : null;
    }
    return out;
  }

  async apply(ops) {
    validateOps(ops);
    if (!ops.length) return [];
    const results = await this._run({ mode: 'apply', ops });
    const failed = results.findIndex((r) => typeof r === 'string' && r.startsWith('error'));
    if (failed !== -1) {
      const err = new Error(`Registry change ${failed + 1}/${ops.length} failed (${ops[failed].key}): ${results[failed]}`);
      err.results = results;
      throw err;
    }
    return results;
  }
}

module.exports = { MemoryRegistry, PowerShellRegistry, validateOps };
