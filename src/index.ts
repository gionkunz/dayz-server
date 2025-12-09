#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import chalk from 'chalk';

import { DayZServerConfig, DEFAULT_CONFIG, validateConfig, getSteamCredentials } from './config/schema';
import { SteamCMDInstaller } from './steamcmd/installer';
import { ModManager } from './mods/manager';
import { ServerConfigGenerator } from './server/config-generator';

const CONFIG_FILE = process.env.DAYZ_CONFIG || '/config/dayz-config.yaml';
const program = new Command();

function loadConfig(): DayZServerConfig {
  const configPath = CONFIG_FILE;
  
  if (!fs.existsSync(configPath)) {
    console.error(chalk.red(`❌ Configuration file not found: ${configPath}`));
    console.log(chalk.yellow('💡 Run `dayz-manager init` to create a sample configuration'));
    process.exit(1);
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const config = YAML.parse(content) as DayZServerConfig;
  
  // Merge with defaults
  return {
    ...DEFAULT_CONFIG,
    ...config,
    server: { ...DEFAULT_CONFIG.server, ...config.server },
    paths: { ...DEFAULT_CONFIG.paths, ...config.paths },
  };
}

program
  .name('dayz-manager')
  .description('DayZ Server Manager CLI - Manage your DayZ server with ease')
  .version('1.0.0');

// Init command - create sample configuration
program
  .command('init')
  .description('Create a sample configuration file')
  .option('-o, --output <path>', 'Output path for configuration', CONFIG_FILE)
  .action((options) => {
    const outputPath = options.output;
    
    if (fs.existsSync(outputPath)) {
      console.log(chalk.yellow(`⚠️ Configuration file already exists: ${outputPath}`));
      console.log(chalk.yellow('   Use --output to specify a different path'));
      return;
    }

    const sampleConfig: DayZServerConfig = {
      ...DEFAULT_CONFIG,
      server: {
        ...DEFAULT_CONFIG.server,
        name: 'My DayZ Server',
        adminPassword: 'changeme123',
      },
      mods: [
        {
          workshopId: '1559212036',
          name: '@CF',
          clientRequired: true,
          serverSide: false,
        },
        {
          workshopId: '1708571776',
          name: '@VPPAdminTools',
          clientRequired: true,
          serverSide: false,
        },
      ],
      modConfigs: {
        vppAdminTools: {
          superAdmins: ['76561198000000000'], // Replace with real Steam64 ID
          disablePassword: false,
          password: 'adminpassword',
        },
      },
    };

    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, YAML.stringify(sampleConfig, { indent: 2 }));
    
    console.log(chalk.green(`✅ Created sample configuration: ${outputPath}`));
    console.log(chalk.cyan('\n📝 Next steps:'));
    console.log('   1. Edit the configuration file with your server settings');
    console.log('   2. Set Steam credentials via environment variables:');
    console.log(chalk.cyan('      export STEAM_USERNAME=your_username'));
    console.log(chalk.cyan('      export STEAM_PASSWORD=your_password'));
    console.log('   3. Add your Steam64 ID to the superAdmins list');
    console.log('   4. Run `dayz-manager install` to install the server');
  });

// Validate command - validate configuration
program
  .command('validate')
  .description('Validate the configuration file')
  .action(() => {
    console.log(chalk.cyan('🔍 Validating configuration...\n'));
    
    const config = loadConfig();
    const errors = validateConfig(config);
    const credentials = getSteamCredentials();
    
    if (errors.length > 0) {
      console.log(chalk.red('❌ Configuration validation failed:\n'));
      errors.forEach(err => console.log(chalk.red(`   • ${err}`)));
      process.exit(1);
    }
    
    console.log(chalk.green('✅ Configuration is valid'));
    console.log(chalk.cyan(`\n📋 Server: ${config.server.name}`));
    console.log(chalk.cyan(`   Port: ${config.server.port}`));
    console.log(chalk.cyan(`   Max Players: ${config.server.maxPlayers}`));
    console.log(chalk.cyan(`   Mods: ${config.mods.length}`));
    console.log(chalk.cyan(`   Steam login: ${credentials.username || 'anonymous'}`));
  });

// Install SteamCMD
program
  .command('install-steamcmd')
  .description('Install SteamCMD')
  .action(async () => {
    const config = loadConfig();
    const installer = new SteamCMDInstaller(config);
    
    if (installer.isSteamCMDInstalled()) {
      console.log(chalk.yellow('⚠️ SteamCMD is already installed'));
      return;
    }
    
    const result = await installer.installSteamCMD();
    
    if (result.success) {
      console.log(chalk.green(`✅ ${result.message}`));
    } else {
      console.log(chalk.red(`❌ ${result.message}`));
      process.exit(1);
    }
  });

// Install server
program
  .command('install-server')
  .description('Install or update DayZ server')
  .action(async () => {
    const config = loadConfig();
    const credentials = getSteamCredentials();
    const installer = new SteamCMDInstaller(config);
    
    console.log(chalk.cyan('🎮 Installing DayZ Server...\n'));
    
    if (!installer.isSteamCMDInstalled()) {
      console.log(chalk.yellow('📦 SteamCMD not found, installing first...\n'));
      await installer.installSteamCMD();
    }
    
    const result = await installer.installServer(credentials);
    
    if (result.success) {
      console.log(chalk.green(`\n✅ ${result.message}`));
    } else {
      console.log(chalk.red(`\n❌ ${result.message}`));
      if (result.steamGuardRequired) {
        console.log(chalk.yellow('\n💡 Steam Guard code required!'));
        console.log(chalk.yellow('   1. Check your email for the Steam Guard code'));
        console.log(chalk.yellow('   2. Set the environment variable:'));
        console.log(chalk.cyan('      export STEAM_GUARD_CODE=XXXXX'));
        console.log(chalk.yellow('   3. Run this command again'));
      }
      process.exit(1);
    }
  });

// Install mods
program
  .command('install-mods')
  .description('Install all configured mods')
  .action(async () => {
    const config = loadConfig();
    const credentials = getSteamCredentials();
    const modManager = new ModManager(config, credentials);
    
    console.log(chalk.cyan('📦 Installing mods...\n'));
    
    await modManager.installAllMods();
  });

// Configure mods
program
  .command('configure-mods')
  .description('Configure all installed mods')
  .action(() => {
    const config = loadConfig();
    const modManager = new ModManager(config);
    
    console.log(chalk.cyan('🔧 Configuring mods...\n'));
    
    modManager.configureAllMods();
  });

// Generate server config
program
  .command('generate-config')
  .description('Generate server configuration files (serverDZ.cfg, startup script)')
  .action(() => {
    const config = loadConfig();
    const generator = new ServerConfigGenerator(config);
    
    console.log(chalk.cyan('📝 Generating server configuration...\n'));
    
    generator.writeConfigs();
    
    console.log(chalk.green('\n✅ Server configuration generated'));
  });

// Full install
program
  .command('install')
  .description('Full installation: SteamCMD, server, mods, and configuration')
  .action(async () => {
    const config = loadConfig();
    const credentials = getSteamCredentials();
    
    console.log(chalk.cyan('🚀 Starting full installation...\n'));
    console.log(chalk.cyan(`📋 Server: ${config.server.name}`));
    console.log(chalk.cyan(`   Mods to install: ${config.mods.length}`));
    console.log(chalk.cyan(`   Steam login: ${credentials.username || 'anonymous'}\n`));
    
    // Step 1: Install SteamCMD
    const installer = new SteamCMDInstaller(config);
    
    if (!installer.isSteamCMDInstalled()) {
      console.log(chalk.cyan('\n═══ Step 1/5: Installing SteamCMD ═══\n'));
      const steamResult = await installer.installSteamCMD();
      if (!steamResult.success) {
        console.log(chalk.red(`❌ ${steamResult.message}`));
        process.exit(1);
      }
    } else {
      console.log(chalk.green('✅ SteamCMD already installed'));
    }
    
    // Step 2: Install server
    console.log(chalk.cyan('\n═══ Step 2/5: Installing DayZ Server ═══\n'));
    const serverResult = await installer.installServer(credentials);
    
    if (!serverResult.success) {
      console.log(chalk.red(`❌ ${serverResult.message}`));
      if (serverResult.steamGuardRequired) {
        console.log(chalk.yellow('\n💡 Steam Guard code required!'));
        console.log(chalk.yellow('   Set STEAM_GUARD_CODE environment variable and try again.'));
      }
      process.exit(1);
    }
    
    // Step 3: Install mods
    console.log(chalk.cyan('\n═══ Step 3/5: Installing Mods ═══\n'));
    const modManager = new ModManager(config, credentials);
    await modManager.installAllMods();
    
    // Step 4: Generate server config
    console.log(chalk.cyan('\n═══ Step 4/5: Generating Server Config ═══\n'));
    const generator = new ServerConfigGenerator(config);
    generator.writeConfigs();
    
    // Step 5: Configure mods
    console.log(chalk.cyan('\n═══ Step 5/5: Configuring Mods ═══\n'));
    modManager.configureAllMods();
    
    console.log(chalk.green('\n════════════════════════════════════════'));
    console.log(chalk.green('✅ Installation complete!'));
    console.log(chalk.green('════════════════════════════════════════'));
    console.log(chalk.cyan('\n📋 Next steps:'));
    console.log('   1. Review the generated configuration in serverDZ.cfg');
    console.log('   2. Start the server with: ./start-server.sh');
  });

// Start server command (for Docker)
program
  .command('start')
  .description('Start the DayZ server')
  .action(() => {
    const config = loadConfig();
    const serverPath = config.paths.serverInstall;
    const startScript = path.join(serverPath, 'start-server.sh');
    
    if (!fs.existsSync(startScript)) {
      console.log(chalk.red('❌ Startup script not found. Run `dayz-manager install` first.'));
      process.exit(1);
    }
    
    console.log(chalk.cyan(`🎮 Starting DayZ Server: ${config.server.name}...`));
    
    // Execute the startup script
    const { spawn } = require('child_process');
    const proc = spawn('bash', [startScript], {
      stdio: 'inherit',
      cwd: serverPath,
    });
    
    proc.on('close', (code: number) => {
      console.log(chalk.yellow(`\nServer exited with code ${code}`));
    });
  });

program.parse();
