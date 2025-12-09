import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SteamCredentials, DayZServerConfig } from '../config/schema';

const DAYZ_SERVER_APP_ID = '223350';
const DAYZ_APP_ID = '221100'; // Used for workshop mods

export interface InstallResult {
  success: boolean;
  message: string;
  steamGuardRequired?: boolean;
}

export class SteamCMDInstaller {
  private steamcmdPath: string;
  private serverPath: string;

  constructor(config: DayZServerConfig) {
    this.steamcmdPath = config.paths.steamcmd;
    this.serverPath = config.paths.serverInstall;
  }

  /**
   * Check if SteamCMD is installed
   */
  isSteamCMDInstalled(): boolean {
    const steamcmdExe = path.join(this.steamcmdPath, 'steamcmd.sh');
    return fs.existsSync(steamcmdExe);
  }

  /**
   * Install SteamCMD
   */
  async installSteamCMD(): Promise<InstallResult> {
    console.log('📦 Installing SteamCMD...');

    try {
      // Create directory
      fs.mkdirSync(this.steamcmdPath, { recursive: true });

      // Download and extract SteamCMD
      const commands = [
        `cd ${this.steamcmdPath}`,
        'curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar zxvf -',
      ];

      execSync(commands.join(' && '), { stdio: 'inherit' });

      // Run steamcmd once to update itself
      console.log('🔄 Updating SteamCMD...');
      execSync(`${this.steamcmdPath}/steamcmd.sh +quit`, { stdio: 'inherit' });

      return { success: true, message: 'SteamCMD installed successfully' };
    } catch (error) {
      return {
        success: false,
        message: `Failed to install SteamCMD: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Escape a string for shell usage
   */
  private shellEscape(str: string): string {
    // Wrap in single quotes and escape any single quotes within
    return `'${str.replace(/'/g, "'\\''")}'`;
  }

  /**
   * Build login command based on credentials
   */
  private buildLoginCommand(credentials: SteamCredentials): string {
    if (!credentials.username) {
      return '+login anonymous';
    }

    // Escape username and password for shell safety
    const username = this.shellEscape(credentials.username);
    let loginCmd = `+login ${username}`;
    
    if (credentials.password) {
      const password = this.shellEscape(credentials.password);
      loginCmd += ` ${password}`;
    }

    if (credentials.steamGuardCode) {
      // Steam guard codes are alphanumeric, but escape anyway for safety
      const code = this.shellEscape(credentials.steamGuardCode);
      loginCmd += ` ${code}`;
    }

    return loginCmd;
  }

  /**
   * Install or update DayZ server
   */
  async installServer(credentials: SteamCredentials): Promise<InstallResult> {
    console.log('🎮 Installing/Updating DayZ Server...');
    console.log(`   Steam login: ${credentials.username || 'anonymous'}`);

    if (!this.isSteamCMDInstalled()) {
      return { success: false, message: 'SteamCMD is not installed. Run install-steamcmd first.' };
    }

    try {
      fs.mkdirSync(this.serverPath, { recursive: true });

      const loginCmd = this.buildLoginCommand(credentials);
      const command = [
        `${this.steamcmdPath}/steamcmd.sh`,
        loginCmd,
        `+force_install_dir ${this.serverPath}`,
        `+app_update ${DAYZ_SERVER_APP_ID}`,
        'validate',
        '+quit',
      ].join(' ');

      // Use spawn for interactive output
      return new Promise((resolve) => {
        const proc = spawn('bash', ['-c', command], {
          stdio: 'inherit',
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true, message: 'DayZ Server installed/updated successfully' });
          } else if (code === 5) {
            resolve({
              success: false,
              message: 'Steam Guard code required. Please check your email and update config with the code.',
              steamGuardRequired: true,
            });
          } else {
            resolve({ success: false, message: `Installation failed with exit code ${code}` });
          }
        });
      });
    } catch (error) {
      return {
        success: false,
        message: `Failed to install server: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Install a workshop mod
   */
  async installMod(credentials: SteamCredentials, workshopId: string, modName: string): Promise<InstallResult> {
    console.log(`📦 Installing mod: ${modName} (${workshopId})...`);

    if (!this.isSteamCMDInstalled()) {
      return { success: false, message: 'SteamCMD is not installed.' };
    }

    try {
      const loginCmd = this.buildLoginCommand(credentials);
      const workshopPath = path.join(this.steamcmdPath, 'steamapps/workshop/content', DAYZ_APP_ID);
      
      const command = [
        `${this.steamcmdPath}/steamcmd.sh`,
        loginCmd,
        `+workshop_download_item ${DAYZ_APP_ID} ${workshopId}`,
        '+quit',
      ].join(' ');

      return new Promise((resolve) => {
        const proc = spawn('bash', ['-c', command], {
          stdio: 'inherit',
        });

        proc.on('close', (code) => {
          if (code === 0) {
            // Link mod to server mods directory
            const modSource = path.join(workshopPath, workshopId);
            const modDest = path.join(this.serverPath, modName);

            if (fs.existsSync(modSource)) {
              // Remove existing symlink/directory
              if (fs.existsSync(modDest)) {
                fs.rmSync(modDest, { recursive: true });
              }
              // Create symlink
              fs.symlinkSync(modSource, modDest, 'dir');
              console.log(`✅ Mod ${modName} linked to ${modDest}`);
            }

            resolve({ success: true, message: `Mod ${modName} installed successfully` });
          } else if (code === 5) {
            resolve({
              success: false,
              message: 'Steam Guard code required.',
              steamGuardRequired: true,
            });
          } else {
            resolve({ success: false, message: `Mod installation failed with exit code ${code}` });
          }
        });
      });
    } catch (error) {
      return {
        success: false,
        message: `Failed to install mod: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Copy mod keys to server keys folder
   */
  copyModKeys(modName: string): void {
    const modPath = path.join(this.serverPath, modName);
    const keysSource = path.join(modPath, 'keys');
    const keysDest = path.join(this.serverPath, 'keys');

    if (!fs.existsSync(keysSource)) {
      // Try alternate path
      const altKeysSource = path.join(modPath, 'Keys');
      if (fs.existsSync(altKeysSource)) {
        this.copyKeysFromDir(altKeysSource, keysDest);
        return;
      }
      console.log(`⚠️ No keys folder found for ${modName}`);
      return;
    }

    this.copyKeysFromDir(keysSource, keysDest);
  }

  private copyKeysFromDir(source: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    
    const files = fs.readdirSync(source);
    for (const file of files) {
      if (file.endsWith('.bikey')) {
        const srcFile = path.join(source, file);
        const destFile = path.join(dest, file);
        fs.copyFileSync(srcFile, destFile);
        console.log(`🔑 Copied key: ${file}`);
      }
    }
  }

  /**
   * Build the mod startup parameter string
   */
  buildModString(mods: { name: string; serverSide: boolean }[]): string {
    const clientMods = mods.filter(m => !m.serverSide).map(m => m.name);
    return clientMods.join(';');
  }

  /**
   * Build the server mod startup parameter string
   */
  buildServerModString(mods: { name: string; serverSide: boolean }[]): string {
    const serverMods = mods.filter(m => m.serverSide).map(m => m.name);
    return serverMods.join(';');
  }
}

