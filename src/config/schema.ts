/**
 * DayZ Server Configuration Schema
 */

/**
 * Steam credentials - obtained from environment variables only
 */
export interface SteamCredentials {
  username: string;
  password: string;
  steamGuardCode: string;
}

/**
 * Get Steam credentials from environment variables
 */
export function getSteamCredentials(): SteamCredentials {
  return {
    username: process.env.STEAM_USERNAME || '',
    password: process.env.STEAM_PASSWORD || '',
    steamGuardCode: process.env.STEAM_GUARD_CODE || '',
  };
}

export interface ServerConfig {
  /** Server name displayed in server browser */
  name: string;
  /** Server password (empty for no password) */
  password?: string;
  /** Admin password for RCON */
  adminPassword: string;
  /** Maximum number of players */
  maxPlayers: number;
  /** Server port */
  port: number;
  /** Steam query port */
  steamQueryPort: number;
  /** BattlEye enabled */
  battleEye: boolean;
  /** Verify signatures (0=disabled, 1=low, 2=high) */
  verifySignatures: number;
  /** Server time acceleration */
  timeAcceleration?: number;
  /** Night time acceleration */
  nightTimeAcceleration?: number;
  /** Persistence enabled */
  persistent: boolean;
  /** Disable third person view */
  disableThirdPerson?: boolean;
  /** Disable crosshair */
  disableCrosshair?: boolean;
  /** Server message of the day */
  motd?: string[];
  /** Mission/map name */
  mission: string;
}

export interface ModConfig {
  /** Steam Workshop ID */
  workshopId: string;
  /** Mod name (folder name, usually starts with @) */
  name: string;
  /** Whether this mod is required on client side */
  clientRequired: boolean;
  /** Whether this mod runs on server side */
  serverSide: boolean;
  /** Mod-specific configuration */
  config?: Record<string, unknown>;
}

export interface VPPAdminToolsConfig {
  /** Steam64 IDs of super admins */
  superAdmins: string[];
  /** Admin tool password (will be hashed) */
  password?: string;
  /** Disable password requirement */
  disablePassword?: boolean;
  /** Webhook configurations */
  webhooks?: {
    discord?: string;
  };
}

export interface DayZServerConfig {
  /** Server configuration */
  server: ServerConfig;
  /** List of mods to install */
  mods: ModConfig[];
  /** Mod-specific configurations */
  modConfigs?: {
    vppAdminTools?: VPPAdminToolsConfig;
    [key: string]: unknown;
  };
  /** Paths configuration */
  paths: {
    /** SteamCMD installation directory */
    steamcmd: string;
    /** DayZ server installation directory */
    serverInstall: string;
    /** Server profiles directory */
    profiles: string;
    /** Mods directory */
    mods: string;
  };
}

export const DEFAULT_CONFIG: DayZServerConfig = {
  server: {
    name: 'DayZ Server',
    password: '',
    adminPassword: 'changeme',
    maxPlayers: 60,
    port: 2302,
    steamQueryPort: 27016,
    battleEye: true,
    verifySignatures: 2,
    persistent: true,
    mission: 'dayzOffline.chernarusplus',
  },
  mods: [],
  modConfigs: {},
  paths: {
    steamcmd: '/opt/steamcmd',
    serverInstall: '/opt/dayz-server',
    profiles: '/opt/dayz-server/profiles',
    mods: '/opt/dayz-server/mods',
  },
};

export function validateConfig(config: DayZServerConfig): string[] {
  const errors: string[] = [];

  if (!config.server.name) {
    errors.push('Server name is required');
  }

  if (!config.server.adminPassword) {
    errors.push('Admin password is required');
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('Server port must be between 1 and 65535');
  }

  if (config.server.maxPlayers < 1 || config.server.maxPlayers > 127) {
    errors.push('Max players must be between 1 and 127');
  }

  // Validate mods
  for (const mod of config.mods) {
    if (!mod.workshopId) {
      errors.push(`Mod "${mod.name}" is missing workshopId`);
    }
    if (!mod.name) {
      errors.push(`Mod with workshopId "${mod.workshopId}" is missing name`);
    }
  }

  return errors;
}
