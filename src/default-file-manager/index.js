'use strict';
// Moon Explorer as the default file manager – public entry point. See docs/default-file-manager.md.

const { createDefaultFileManager } = require('./manager');
const { MemoryRegistry, PowerShellRegistry } = require('./registry');
const { resolveStartPath, normalizeArg } = require('./start-path');
const { parseCliAction, runCliAction } = require('./cli');
const layout = require('./layout');

module.exports = {
  createDefaultFileManager,
  MemoryRegistry,
  PowerShellRegistry,
  resolveStartPath,
  normalizeArg,
  parseCliAction,
  runCliAction,
  layout,
};
