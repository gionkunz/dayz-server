import * as fs from 'fs';
import * as path from 'path';
import { DayZServerConfig } from '../../config/schema';

export abstract class ModConfigurator {
  protected config: DayZServerConfig;
  protected serverPath: string;
  protected profilesPath: string;

  constructor(config: DayZServerConfig) {
    this.config = config;
    this.serverPath = config.paths.serverInstall;
    this.profilesPath = config.paths.profiles;
  }

  abstract get modName(): string;
  abstract configure(): void;

  protected ensureDir(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  protected writeFile(filePath: string, content: string): void {
    this.ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`📝 Written: ${filePath}`);
  }

  protected fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  protected readFile(filePath: string): string | null {
    if (!this.fileExists(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
  }
}

