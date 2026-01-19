/**
 * Playwright Global Teardown
 * テスト終了後にconfig.tomlを復元
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'obails');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.toml');
const BACKUP_PATH = path.join(CONFIG_DIR, 'config.toml.e2e-backup');

async function globalTeardown(): Promise<void> {
  console.log('[E2E Teardown] Restoring config.toml...');

  if (fs.existsSync(BACKUP_PATH)) {
    fs.copyFileSync(BACKUP_PATH, CONFIG_PATH);
    fs.unlinkSync(BACKUP_PATH);
    console.log('[E2E Teardown] Config restored from backup');
  } else {
    console.log('[E2E Teardown] No backup found, keeping test config');
  }
}

export default globalTeardown;
