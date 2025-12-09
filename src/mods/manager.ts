import { DayZServerConfig, ModConfig, SteamCredentials } from '../config/schema';
import { SteamCMDInstaller } from '../steamcmd/installer';
import { ModConfigurator } from './configurators/base';
import { VPPAdminToolsConfigurator } from './configurators/vpp-admin-tools';

export class ModManager {
  private config: DayZServerConfig;
  private credentials?: SteamCredentials;
  private installer: SteamCMDInstaller;
  private configurators: Map<string, ModConfigurator>;

  constructor(config: DayZServerConfig, credentials?: SteamCredentials) {
    this.config = config;
    this.credentials = credentials;
    this.installer = new SteamCMDInstaller(config);
    this.configurators = new Map();

    // Register mod configurators
    this.registerConfigurators();
  }

  private registerConfigurators(): void {
    const vppConfigurator = new VPPAdminToolsConfigurator(this.config);
    this.configurators.set('@VPPAdminTools', vppConfigurator);
    this.configurators.set('@vppAdminTools', vppConfigurator);
    this.configurators.set('VPPAdminTools', vppConfigurator);
  }

  /**
   * Install all mods from configuration
   */
  async installAllMods(): Promise<void> {
    if (!this.credentials) {
      throw new Error('Steam credentials required for mod installation');
    }

    console.log('📦 Installing all configured mods...\n');

    for (const mod of this.config.mods) {
      await this.installMod(mod);
    }

    console.log('\n✅ All mods installed');
  }

  /**
   * Install a single mod
   */
  async installMod(mod: ModConfig): Promise<void> {
    if (!this.credentials) {
      throw new Error('Steam credentials required for mod installation');
    }

    const result = await this.installer.installMod(
      this.credentials,
      mod.workshopId,
      mod.name
    );

    if (result.success) {
      // Copy keys
      this.installer.copyModKeys(mod.name);
    } else {
      console.error(`❌ Failed to install ${mod.name}: ${result.message}`);
      if (result.steamGuardRequired) {
        console.log('💡 Please set the STEAM_GUARD_CODE environment variable and try again.');
      }
    }
  }

  /**
   * Configure all mods
   */
  configureAllMods(): void {
    console.log('🔧 Configuring mods...\n');

    for (const mod of this.config.mods) {
      this.configureMod(mod.name);
    }

    console.log('\n✅ All mods configured');
  }

  /**
   * Configure a single mod
   */
  configureMod(modName: string): void {
    const configurator = this.configurators.get(modName);
    
    if (configurator) {
      console.log(`\n🔧 Configuring ${modName}...`);
      configurator.configure();
    } else {
      console.log(`ℹ️ No configurator found for ${modName}, skipping custom configuration`);
    }
  }

  /**
   * Get mod startup parameters
   */
  getModStartupParams(): { mods: string; serverMods: string } {
    const mods = this.installer.buildModString(this.config.mods);
    const serverMods = this.installer.buildServerModString(this.config.mods);
    
    return { mods, serverMods };
  }

  /**
   * List registered configurators
   */
  listConfiguratorSupport(): string[] {
    return Array.from(this.configurators.keys());
  }
}
