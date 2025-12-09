import * as path from 'path';
import * as crypto from 'crypto';
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
    
    let content = `// VPP Admin Tools - Super Admins Configuration
// Add Steam64 IDs of super admins (one per line)
// Super admins have access to ALL permissions
// 
// Example:
// 76561198420222029
//
// Find your Steam64 ID at: https://steamid.io/
//

`;

    for (const adminId of config.superAdmins || []) {
      content += `${adminId}\n`;
    }

    this.writeFile(superAdminsFile, content);
  }

  private configureCredentials(basePath: string, config: VPPAdminToolsConfig): void {
    const credentialsFile = path.join(basePath, 'credentials.txt');

    if (config.disablePassword) {
      // Write empty credentials file
      const content = `// Password authentication is disabled via serverDZ.cfg
// Set vppDisablePassword = 1; in serverDZ.cfg
//
// To enable password protection:
// 1. Remove vppDisablePassword from serverDZ.cfg
// 2. Add your hashed password below
//
// Password hash format: sha256(password)
`;
      this.writeFile(credentialsFile, content);
      return;
    }

    if (!config.password) {
      console.log('⚠️ No password set for VPPAdminTools');
      return;
    }

    // Hash the password using SHA256 (as per VPP documentation)
    const hashedPassword = this.hashPassword(config.password);

    const content = `// VPP Admin Tools - Credentials Configuration
// DO NOT share this file!
// The password below is hashed using SHA256
//
// To change the password:
// 1. Update the password in your dayz-config.yaml
// 2. Run: dayz-manager configure-mods
//
${hashedPassword}
`;

    this.writeFile(credentialsFile, content);
  }

  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
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

