import * as path from 'path';
import { ModConfigurator } from './base';
import { VPPAdminToolsConfig } from '../../config/schema';

/**
 * Configurator for VPP Admin Tools mod
 * @see https://github.com/VanillaPlusPlus/VPP-Admin-Tools/wiki/Installation-&-Configuration
 */
export class VPPAdminToolsConfigurator extends ModConfigurator {
  get modName(): string {
    return '@VPPAdminTools';
  }

  configure(): void {
    const modConfig = this.config.modConfigs?.vppAdminTools;
    
    if (!modConfig) {
      console.log('⚠️ No VPPAdminTools configuration found, skipping...');
      return;
    }

    console.log('🔧 Configuring VPP Admin Tools...');

    // Create VPPAdminTools directory structure in profiles
    const vppPath = path.join(this.profilesPath, 'VPPAdminTools');
    const permissionsPath = path.join(vppPath, 'Permissions');
    const superAdminsPath = path.join(permissionsPath, 'SuperAdmins');

    this.ensureDir(superAdminsPath);

    // Configure SuperAdmins
    this.configureSuperAdmins(superAdminsPath, modConfig);

    // Configure credentials (password)
    this.configureCredentials(permissionsPath, modConfig);

    // Update serverDZ.cfg if password is disabled
    if (modConfig.disablePassword) {
      this.updateServerConfig(modConfig);
    }

    console.log('✅ VPP Admin Tools configured successfully');
  }

  private configureSuperAdmins(basePath: string, config: VPPAdminToolsConfig): void {
    const superAdminsFile = path.join(basePath, 'SuperAdmins.txt');
    
    // Clean format - just Steam64 IDs, one per line
    const content = (config.superAdmins || []).join('\n') + '\n';

    this.writeFile(superAdminsFile, content);
  }

  private configureCredentials(basePath: string, config: VPPAdminToolsConfig): void {
    const credentialsFile = path.join(basePath, 'credentials.txt');

    if (config.disablePassword) {
      // Write empty credentials file
      this.writeFile(credentialsFile, '');
      return;
    }

    if (!config.password) {
      console.log('⚠️ No password set for VPPAdminTools');
      return;
    }

    // Write plaintext password - VPP will encrypt it on first startup
    this.writeFile(credentialsFile, config.password + '\n');
  }

  private updateServerConfig(config: VPPAdminToolsConfig): void {
    const serverConfigPath = path.join(this.serverPath, 'serverDZ.cfg');
    
    let content = this.readFile(serverConfigPath);
    
    if (!content) {
      console.log('⚠️ serverDZ.cfg not found, will add vppDisablePassword on generation');
      return;
    }

    // Check if vppDisablePassword already exists
    if (content.includes('vppDisablePassword')) {
      // Update existing value
      content = content.replace(
        /vppDisablePassword\s*=\s*\d+;/,
        `vppDisablePassword = ${config.disablePassword ? '1' : '0'};`
      );
    } else {
      // Add new setting
      content += `\n// VPP Admin Tools - Disable password requirement\nvppDisablePassword = ${config.disablePassword ? '1' : '0'};\n`;
    }

    this.writeFile(serverConfigPath, content);
  }
}

