#!/usr/bin/env node

/**
 * Docker Entrypoint for DayZ Server
 * Handles container lifecycle, environment variables, and server management
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import chalk from 'chalk';

import { DayZServerConfig, DEFAULT_CONFIG, validateConfig } from './config/schema';
import { SteamCMDInstaller } from './steamcmd/installer';
import { ModManager } from './mods/manager';
import { ServerConfigGenerator } from './server/config-generator';

// Configuration
const CONFIG_FILE = process.env.DAYZ_CONFIG || '/config/dayz-config.yaml';
const SERVER_PATH = '/opt/dayz-server';
const SERVER_BINARY = path.join(SERVER_PATH, 'DayZServer');

// Track child processes for cleanup
let serverProcess: ChildProcess | null = null;

/**
 * Print banner
 */
function printBanner(): void {
  console.log(chalk.cyan(`
╔════════════════════════════════════════════════════════════╗
║           DayZ Server Docker Container                     ║
╚════════════════════════════════════════════════════════════╝
`));
}

/**
 * Print Steam Guard instructions
 */
function printSteamGuardInstructions(): void {
  console.log(chalk.yellow(`
════════════════════════════════════════════════════════════
  STEAM GUARD CODE REQUIRED
════════════════════════════════════════════════════════════
`));
  console.log(`A Steam Guard code has been sent to your email.

To continue, please:
  1. Check your email for the Steam Guard code
  2. Set the STEAM_GUARD_CODE environment variable:

     ${chalk.cyan('docker-compose down')}
     Edit docker-compose.yml or .env file:
       ${chalk.cyan('STEAM_GUARD_CODE=XXXXX')}
     ${chalk.cyan('docker-compose up -d')}

  Or update your dayz-config.yaml:
     ${chalk.cyan(`steam:
       steamGuardCode: "XXXXX"`)}

The container will exit now. Restart after adding the code.
`);
}

/**
 * Load configuration from file
 */
function loadConfig(): DayZServerConfig | null {
  if (!fs.existsSync(CONFIG_FILE)) {
    return null;
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = YAML.parse(content) as DayZServerConfig;

    // Merge with defaults
    return {
      ...DEFAULT_CONFIG,
      ...config,
      steam: { ...DEFAULT_CONFIG.steam, ...config.steam },
      server: { ...DEFAULT_CONFIG.server, ...config.server },
      paths: { ...DEFAULT_CONFIG.paths, ...config.paths },
    };
  } catch (error) {
    console.error(chalk.red(`Failed to load config: ${error}`));
    return null;
  }
}

/**
 * Save configuration to file
 */
function saveConfig(config: DayZServerConfig): void {
  const dir = path.dirname(CONFIG_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, YAML.stringify(config, { indent: 2 }));
}

/**
 * Update configuration with environment variables
 */
function mergeEnvIntoConfig(config: DayZServerConfig): DayZServerConfig {
  const updated = { ...config };
  updated.steam = { ...config.steam };

  // Override with environment variables if set
  if (process.env.STEAM_USERNAME) {
    updated.steam.username = process.env.STEAM_USERNAME;
  }
  if (process.env.STEAM_PASSWORD) {
    updated.steam.password = process.env.STEAM_PASSWORD;
  }
  if (process.env.STEAM_GUARD_CODE) {
    updated.steam.steamGuardCode = process.env.STEAM_GUARD_CODE;
  }

  return updated;
}

/**
 * Check if this is first run (server not installed)
 */
function isFirstRun(): boolean {
  return !fs.existsSync(SERVER_BINARY);
}

/**
 * Create default configuration
 */
function createDefaultConfig(): DayZServerConfig {
  const config: DayZServerConfig = {
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
        superAdmins: ['76561198000000000'],
        disablePassword: false,
        password: 'adminpassword',
      },
    },
  };

  return config;
}

/**
 * Initialize configuration
 */
async function cmdInit(): Promise<void> {
  console.log(chalk.cyan('Initializing configuration...'));

  if (fs.existsSync(CONFIG_FILE)) {
    console.log(chalk.yellow(`Configuration already exists at ${CONFIG_FILE}`));
    return;
  }

  const config = createDefaultConfig();
  saveConfig(config);

  console.log(chalk.green(`✅ Configuration created at ${CONFIG_FILE}`));
  console.log(chalk.yellow('Please edit the configuration and restart the container'));
}

/**
 * Full installation
 */
async function cmdInstall(): Promise<boolean> {
  let config = loadConfig();

  if (!config) {
    console.log(chalk.yellow('No configuration found. Creating default...'));
    config = createDefaultConfig();
    saveConfig(config);
    console.log(chalk.yellow(`Please edit ${CONFIG_FILE} and restart the container`));
    return false;
  }

  // Merge environment variables
  config = mergeEnvIntoConfig(config);

  // Validate
  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.error(chalk.red('Configuration validation failed:'));
    errors.forEach(err => console.error(chalk.red(`  • ${err}`)));
    return false;
  }

  console.log(chalk.cyan('🚀 Starting full installation...\n'));
  console.log(chalk.cyan(`📋 Server: ${config.server.name}`));
  console.log(chalk.cyan(`   Mods to install: ${config.mods.length}\n`));

  const installer = new SteamCMDInstaller(config);

  // Step 1: Install SteamCMD
  if (!installer.isSteamCMDInstalled()) {
    console.log(chalk.cyan('\n═══ Step 1/5: Installing SteamCMD ═══\n'));
    const steamResult = await installer.installSteamCMD();
    if (!steamResult.success) {
      console.error(chalk.red(`❌ ${steamResult.message}`));
      return false;
    }
  } else {
    console.log(chalk.green('✅ SteamCMD already installed'));
  }

  // Step 2: Install server
  console.log(chalk.cyan('\n═══ Step 2/5: Installing DayZ Server ═══\n'));
  const serverResult = await installer.installServer(config.steam);

  if (!serverResult.success) {
    console.error(chalk.red(`❌ ${serverResult.message}`));
    if (serverResult.steamGuardRequired) {
      printSteamGuardInstructions();
    }
    return false;
  }

  // Step 3: Install mods
  console.log(chalk.cyan('\n═══ Step 3/5: Installing Mods ═══\n'));
  const modManager = new ModManager(config);
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

  return true;
}

/**
 * Install SteamCMD only
 */
async function cmdInstallSteamcmd(): Promise<void> {
  const config = loadConfig() || createDefaultConfig();
  const installer = new SteamCMDInstaller(config);

  if (installer.isSteamCMDInstalled()) {
    console.log(chalk.yellow('⚠️ SteamCMD is already installed'));
    return;
  }

  console.log(chalk.cyan('📦 Installing SteamCMD...'));
  const result = await installer.installSteamCMD();

  if (result.success) {
    console.log(chalk.green(`✅ ${result.message}`));
  } else {
    console.error(chalk.red(`❌ ${result.message}`));
    process.exit(1);
  }
}

/**
 * Install server only
 */
async function cmdInstallServer(): Promise<void> {
  let config = loadConfig();

  if (!config) {
    console.error(chalk.red(`❌ Configuration file not found: ${CONFIG_FILE}`));
    process.exit(1);
  }

  config = mergeEnvIntoConfig(config);
  const installer = new SteamCMDInstaller(config);

  if (!installer.isSteamCMDInstalled()) {
    console.log(chalk.yellow('📦 SteamCMD not found, installing first...\n'));
    await installer.installSteamCMD();
  }

  console.log(chalk.cyan('🎮 Installing DayZ Server...\n'));
  const result = await installer.installServer(config.steam);

  if (result.success) {
    console.log(chalk.green(`\n✅ ${result.message}`));
  } else {
    console.error(chalk.red(`\n❌ ${result.message}`));
    if (result.steamGuardRequired) {
      printSteamGuardInstructions();
    }
    process.exit(1);
  }
}

/**
 * Install mods only
 */
async function cmdInstallMods(): Promise<void> {
  let config = loadConfig();

  if (!config) {
    console.error(chalk.red(`❌ Configuration file not found: ${CONFIG_FILE}`));
    process.exit(1);
  }

  config = mergeEnvIntoConfig(config);
  const modManager = new ModManager(config);

  console.log(chalk.cyan('📦 Installing mods...\n'));
  await modManager.installAllMods();
}

/**
 * Configure server and mods
 */
async function cmdConfigure(): Promise<void> {
  const config = loadConfig();

  if (!config) {
    console.error(chalk.red(`❌ Configuration file not found: ${CONFIG_FILE}`));
    process.exit(1);
  }

  console.log(chalk.cyan('🔧 Configuring server and mods...\n'));

  const generator = new ServerConfigGenerator(config);
  generator.writeConfigs();

  const modManager = new ModManager(config);
  modManager.configureAllMods();

  console.log(chalk.green('\n✅ Configuration complete'));
}

/**
 * Update server and mods
 */
async function cmdUpdate(): Promise<void> {
  let config = loadConfig();

  if (!config) {
    console.error(chalk.red(`❌ Configuration file not found: ${CONFIG_FILE}`));
    process.exit(1);
  }

  config = mergeEnvIntoConfig(config);

  console.log(chalk.cyan('🔄 Updating server and mods...\n'));

  const installer = new SteamCMDInstaller(config);
  await installer.installServer(config.steam);

  const modManager = new ModManager(config);
  await modManager.installAllMods();

  console.log(chalk.green('\n✅ Update complete'));
}

/**
 * Validate configuration
 */
async function cmdValidate(): Promise<void> {
  console.log(chalk.cyan('🔍 Validating configuration...\n'));

  const config = loadConfig();

  if (!config) {
    console.error(chalk.red(`❌ Configuration file not found: ${CONFIG_FILE}`));
    process.exit(1);
  }

  const errors = validateConfig(config);

  if (errors.length > 0) {
    console.error(chalk.red('❌ Configuration validation failed:\n'));
    errors.forEach(err => console.error(chalk.red(`   • ${err}`)));
    process.exit(1);
  }

  console.log(chalk.green('✅ Configuration is valid'));
  console.log(chalk.cyan(`\n📋 Server: ${config.server.name}`));
  console.log(chalk.cyan(`   Port: ${config.server.port}`));
  console.log(chalk.cyan(`   Max Players: ${config.server.maxPlayers}`));
  console.log(chalk.cyan(`   Mods: ${config.mods.length}`));
}

/**
 * Start the DayZ server
 */
async function cmdStart(): Promise<void> {
  // Check if server is installed
  if (isFirstRun()) {
    console.log(chalk.yellow('Server not installed. Running first-time setup...'));

    const success = await cmdInstall();
    if (!success) {
      process.exit(1);
    }
  }

  const config = loadConfig();

  if (!config) {
    console.error(chalk.red(`❌ Configuration file not found: ${CONFIG_FILE}`));
    process.exit(1);
  }

  const startScript = path.join(config.paths.serverInstall, 'start-server.sh');

  if (!fs.existsSync(startScript)) {
    console.error(chalk.red('❌ Startup script not found. Running configuration...'));
    await cmdConfigure();
  }

  console.log(chalk.green(`🎮 Starting DayZ Server: ${config.server.name}...`));

  // Spawn the server process
  serverProcess = spawn('bash', [startScript], {
    stdio: 'inherit',
    cwd: config.paths.serverInstall,
  });

  serverProcess.on('close', (code) => {
    console.log(chalk.yellow(`\nServer exited with code ${code}`));
    serverProcess = null;
    process.exit(code || 0);
  });

  serverProcess.on('error', (error) => {
    console.error(chalk.red(`Failed to start server: ${error.message}`));
    process.exit(1);
  });
}

/**
 * Start interactive shell
 */
async function cmdShell(): Promise<void> {
  console.log(chalk.cyan('Starting interactive shell...'));

  const shell = spawn('/bin/bash', [], {
    stdio: 'inherit',
  });

  shell.on('close', (code) => {
    process.exit(code || 0);
  });
}

/**
 * Print usage
 */
function printUsage(): void {
  console.log(`
${chalk.cyan('Usage:')} entrypoint <command>

${chalk.cyan('Commands:')}
  init              Create initial configuration file
  install           Full installation (SteamCMD, server, mods, config)
  install-steamcmd  Install SteamCMD only
  install-server    Install/update DayZ server
  install-mods      Install/update mods
  configure         Generate server config and configure mods
  update            Update server and mods
  start             Start the server (default)
  validate          Validate configuration
  shell             Start interactive bash shell
  help              Show this help message
`);
}

/**
 * Graceful shutdown handler
 */
function setupSignalHandlers(): void {
  const shutdown = (signal: string) => {
    console.log(chalk.yellow(`\nReceived ${signal}, shutting down...`));

    if (serverProcess) {
      // Forward signal to server process
      serverProcess.kill(signal as NodeJS.Signals);

      // Give it time to shut down gracefully
      setTimeout(() => {
        if (serverProcess) {
          console.log(chalk.yellow('Force killing server process...'));
          serverProcess.kill('SIGKILL');
        }
        process.exit(0);
      }, 10000);
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  setupSignalHandlers();
  printBanner();

  const command = process.argv[2] || 'start';

  try {
    switch (command) {
      case 'init':
        await cmdInit();
        break;

      case 'install':
        const success = await cmdInstall();
        if (!success) process.exit(1);
        break;

      case 'install-steamcmd':
        await cmdInstallSteamcmd();
        break;

      case 'install-server':
        await cmdInstallServer();
        break;

      case 'install-mods':
        await cmdInstallMods();
        break;

      case 'configure':
        await cmdConfigure();
        break;

      case 'update':
        await cmdUpdate();
        break;

      case 'start':
        await cmdStart();
        break;

      case 'validate':
        await cmdValidate();
        break;

      case 'shell':
        await cmdShell();
        break;

      case 'help':
      case '--help':
      case '-h':
        printUsage();
        break;

      default:
        console.error(chalk.red(`Unknown command: ${command}`));
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}

// Run
main();

