'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MemoryRegistry, PowerShellRegistry } = require('../registry');
const { keysToRead } = require('../manager');

test('refuses keys outside HKCU\\Software\\Classes and HKCU\\Software\\Luna-OS', async () => {
  const reg = new MemoryRegistry();
  for (const key of [
    'HKLM\\Software\\Classes\\Directory\\shell',
    'HKEY_LOCAL_MACHINE\\Software\\Classes\\x',
    'Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    'Software\\Classes', // the root itself is never touched
    'Software\\Classes\\..\\Microsoft',
    'Software\\Classes\\\\Directory',
    'Software/Classes/Directory',
  ]) {
    await assert.rejects(reg.apply([{ op: 'setValue', key, name: '', data: 'x' }]), /outside the allowed/, key);
  }
});

test('deleteKeyIfEmpty never deletes a key with values or subkeys', async () => {
  const reg = new MemoryRegistry({ 'Software\\Classes\\A\\B': { v: '1' }, 'Software\\Classes\\C': {} });
  assert.deepEqual(
    await reg.apply([
      { op: 'deleteKeyIfEmpty', key: 'Software\\Classes\\A' },
      { op: 'deleteKeyIfEmpty', key: 'Software\\Classes\\A\\B' },
      { op: 'deleteKeyIfEmpty', key: 'Software\\Classes\\C' },
      { op: 'deleteKeyIfEmpty', key: 'Software\\Classes\\Nope' },
    ]),
    ['kept', 'kept', 'deleted', 'missing'],
  );
});

test('the fake registry is case-insensitive like Windows', async () => {
  const reg = new MemoryRegistry({ 'Software\\Classes\\Directory\\Shell': { '': 'none' } });
  const r = await reg.read(['Software\\Classes\\directory\\shell']);
  assert.deepEqual(r['Software\\Classes\\directory\\shell'].values, { '': 'none' });
});

// Read-only check of the real implementation: it only reads keys, never writes.
test('PowerShellRegistry reads HKCU (read-only)', { skip: process.platform !== 'win32' }, async () => {
  const reg = new PowerShellRegistry();
  const keys = keysToRead();
  const snap = await reg.read(keys);
  assert.deepEqual(Object.keys(snap).sort(), [...keys].sort());
  for (const v of Object.values(snap)) assert.ok(v === null || (typeof v.values === 'object' && Array.isArray(v.subkeys)));
  await assert.rejects(reg.apply([{ op: 'setValue', key: 'HKLM\\Software\\x', name: '', data: 'x' }]), /outside the allowed/);
});
