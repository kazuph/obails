import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(os.homedir(), '.config', 'obails');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.toml');
const BACKUP_PATH = path.join(CONFIG_DIR, 'config.toml.e2e-backup');
const TEST_VAULT_PATH = path.resolve(__dirname, '../fixtures/test-vault');

/**
 * テスト用Vaultを設定するヘルパー
 * config.tomlをバックアップし、テスト用Vaultパスに設定
 */
export async function setupTestVault(): Promise<void> {
  // 設定ディレクトリが存在することを確認
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // 既存のconfig.tomlをバックアップ
  if (fs.existsSync(CONFIG_PATH)) {
    fs.copyFileSync(CONFIG_PATH, BACKUP_PATH);
  }

  // テスト用config.tomlを作成
  const testConfig = `[vault]
  path = "${TEST_VAULT_PATH}"

[daily_notes]
  folder = "dailynotes"
  format = "2006-01-02"
  template = ""

[timeline]
  section = "## Memos"
  time_format = "15:04"

[templates]
  folder = ""

[editor]
  font_size = 14
  font_family = "SF Mono"
  line_numbers = true
  word_wrap = true

[ui]
  theme = "github-light"
  sidebar_width = 250
`;

  fs.writeFileSync(CONFIG_PATH, testConfig, 'utf8');
}

/**
 * テスト後にconfig.tomlを復元
 */
export async function restoreConfig(): Promise<void> {
  if (fs.existsSync(BACKUP_PATH)) {
    fs.copyFileSync(BACKUP_PATH, CONFIG_PATH);
    fs.unlinkSync(BACKUP_PATH);
  }
}

/**
 * テスト用Vaultのパスを取得
 */
export function getTestVaultPath(): string {
  return TEST_VAULT_PATH;
}
