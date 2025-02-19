import { EventEmitter } from 'events';
import * as semver from 'semver';
import { Plugin, PluginMetadata } from './types';
import { logger } from '../monitoring';
import { AlertManager, AlertType, AlertSeverity, Alert } from '@lumix/types';

export interface VersionInfo {
  version: string;
  timestamp: number;
  changes: string[];
  dependencies: Record<string, string>;
  compatibility: {
    core: string;
    plugins: Record<string, string>;
  };
  metadata: {
    author: string;
    homepage?: string;
    repository?: string;
    license?: string;
    keywords?: string[];
  };
  checksum?: string;
}

export interface VersionHistory {
  current: VersionInfo;
  previous: VersionInfo[];
  rollbackVersion?: string;
  lastUpdate: number;
  updateHistory: Array<{
    from: string;
    to: string;
    timestamp: number;
    success: boolean;
    error?: string;
  }>;
}

export interface VersionCheckResult {
  compatible: boolean;
  issues: string[];
  suggestedVersion?: string;
  details: {
    coreCompatible: boolean;
    dependenciesCompatible: boolean;
    pluginsCompatible: boolean;
    missingDependencies: string[];
    incompatibleDependencies: Array<{
      name: string;
      required: string;
      actual: string;
    }>;
  };
}

export interface VersionUpdateOptions {
  force?: boolean;
  skipCompatibilityCheck?: boolean;
  backupBefore?: boolean;
  notifyOnUpdate?: boolean;
  updateDependencies?: boolean;
}

export interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string[];
  build?: string[];
}

export interface VersionRange {
  operator: string;
  version: Version;
}

export class PluginVersionManager extends EventEmitter {
  private versions: Map<string, VersionHistory>;
  private compatibilityMatrix: Map<string, Set<string>>;
  private alertManager: AlertManager;
  private readonly BACKUP_DIR = '.version_backups';
  private coreVersion: string;

  constructor(coreVersion: string) {
    super();
    this.versions = new Map();
    this.compatibilityMatrix = new Map();
    this.alertManager = AlertManager.getInstance();
    this.coreVersion = coreVersion;
  }

  public async registerPlugin(plugin: Plugin): Promise<void> {
    const { id, version, dependencies, ...metadata } = plugin.metadata;

    // 验证版本格式
    if (!semver.valid(version)) {
      throw new Error(`Invalid version format for plugin ${id}: ${version}`);
    }

    // 获取或创建版本历史
    const history = this.versions.get(id) || {
      current: this.createVersionInfo(version, dependencies, metadata),
      previous: [],
      lastUpdate: Date.now(),
      updateHistory: []
    };

    // 更新版本历史
    if (history.current.version !== version) {
      history.previous.push({ ...history.current });
      history.current = this.createVersionInfo(version, dependencies, metadata);
      history.lastUpdate = Date.now();
      history.updateHistory.push({
        from: history.previous[history.previous.length - 1].version,
        to: version,
        timestamp: Date.now(),
        success: true
      });
    }

    this.versions.set(id, history);
    this.updateCompatibilityMatrix(id, version);

    // 发出版本更新事件
    this.emit('pluginRegistered', {
      pluginId: id,
      version,
      timestamp: Date.now()
    });
  }

  private createVersionInfo(
    version: string,
    dependencies: Record<string, string>,
    metadata: Partial<PluginMetadata>
  ): VersionInfo {
    return {
      version,
      timestamp: Date.now(),
      changes: [],
      dependencies: { ...dependencies },
      compatibility: {
        core: this.coreVersion,
        plugins: {}
      },
      metadata: {
        author: metadata.author || 'unknown',
        homepage: metadata.homepage,
        repository: metadata.repository,
        license: metadata.license,
        keywords: metadata.keywords
      }
    };
  }

  public async checkCompatibility(plugin: Plugin): Promise<{
    compatible: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Check core version compatibility
      if (!this.isVersionCompatible(this.coreVersion, plugin.metadata.version)) {
        issues.push(
          `Plugin version ${plugin.metadata.version} is not compatible with core version ${this.coreVersion}`
        );
      }

      // Check dependencies
      if (plugin.metadata.dependencies) {
        for (const [depName, depVersion] of Object.entries(plugin.metadata.dependencies)) {
          if (!this.isVersionCompatible(depVersion, depVersion)) {
            issues.push(
              `Dependency ${depName}@${depVersion} is not compatible`
            );
          }
        }
      }

      return {
        compatible: issues.length === 0,
        issues
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      issues.push(`Version check failed: ${message}`);
      return {
        compatible: false,
        issues
      };
    }
  }

  private isVersionCompatible(required: string, actual: string): boolean {
    try {
      // Simple semver comparison
      const [reqMajor, reqMinor] = required.split('.').map(Number);
      const [actMajor, actMinor] = actual.split('.').map(Number);

      if (reqMajor !== actMajor) {
        return false;
      }

      return actMinor >= reqMinor;
    } catch {
      return false;
    }
  }

  public async updateVersion(
    pluginId: string,
    newVersion: string,
    changes: string[],
    options: VersionUpdateOptions = {}
  ): Promise<void> {
    const history = this.versions.get(pluginId);
    if (!history) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    // 验证版本号
    if (!semver.valid(newVersion)) {
      throw new Error(`Invalid version format: ${newVersion}`);
    }

    // 检查版本是否更新
    if (!options.force && semver.lte(newVersion, history.current.version)) {
      throw new Error(
        `New version ${newVersion} must be greater than current version ${history.current.version}`
      );
    }

    try {
      // 创建备份
      if (options.backupBefore) {
        await this.createVersionBackup(pluginId);
      }

      // 检查兼容性
      if (!options.skipCompatibilityCheck) {
        const compatibility = await this.checkCompatibility({
          metadata: {
            id: pluginId,
            version: newVersion,
            dependencies: history.current.dependencies
          }
        } as Plugin);

        if (!compatibility.compatible) {
          throw new Error(`Version ${newVersion} is not compatible: ${compatibility.issues.join(', ')}`);
        }
      }

      // 备份当前版本
      history.previous.push({ ...history.current });

      // 更新到新版本
      history.current = {
        ...history.current,
        version: newVersion,
        timestamp: Date.now(),
        changes
      };

      // 更新兼容性矩阵
      this.updateCompatibilityMatrix(pluginId, newVersion);

      // 更新历史记录
      history.updateHistory.push({
        from: history.previous[history.previous.length - 1].version,
        to: newVersion,
        timestamp: Date.now(),
        success: true
      });

      // 更新依赖
      if (options.updateDependencies) {
        await this.updateDependencies(pluginId, newVersion);
      }

      // 发送通知
      if (options.notifyOnUpdate) {
        this.alertManager.createAlert({
          type: AlertType.PLUGIN,
          severity: AlertSeverity.INFO,
          message: `Plugin ${pluginId} updated to version ${newVersion}`,
          details: changes.join('\n')
        });
      }

      // 发出版本更新事件
      this.emit('versionUpdated', {
        pluginId,
        oldVersion: history.previous[history.previous.length - 1].version,
        newVersion,
        timestamp: Date.now()
      });

      logger.info('Version', `Updated plugin ${pluginId} to version ${newVersion}`);
    } catch (error) {
      // 记录更新失败
      history.updateHistory.push({
        from: history.current.version,
        to: newVersion,
        timestamp: Date.now(),
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  private async updateDependencies(pluginId: string, version: string): Promise<void> {
    const history = this.versions.get(pluginId);
    if (!history) return;

    // 更新依赖插件的兼容性信息
    for (const [depId, depVersion] of Object.entries(history.current.dependencies)) {
      const depHistory = this.versions.get(depId);
      if (depHistory) {
        depHistory.current.compatibility.plugins[pluginId] = version;
        this.versions.set(depId, depHistory);
      }
    }
  }

  private async createVersionBackup(pluginId: string): Promise<void> {
    const history = this.versions.get(pluginId);
    if (!history) return;

    const backup = {
      timestamp: Date.now(),
      version: history.current.version,
      data: { ...history }
    };

    // TODO: 实现备份存储逻辑
  }

  public async rollback(pluginId: string, targetVersion?: string): Promise<void> {
    const history = this.versions.get(pluginId);
    if (!history) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (history.previous.length === 0) {
      throw new Error(`No previous versions found for plugin ${pluginId}`);
    }

    let rollbackTo: VersionInfo;
    if (targetVersion) {
      // 查找指定版本
      const targetVersionInfo = history.previous.find(v => v.version === targetVersion);
      if (!targetVersionInfo) {
        throw new Error(`Version ${targetVersion} not found in history`);
      }
      rollbackTo = targetVersionInfo;
    } else {
      // 回滚到上一个版本
      rollbackTo = history.previous[history.previous.length - 1];
    }

    try {
      // 保存当前版本用于可能的恢复
      const currentVersion = { ...history.current };

      // 更新到回滚版本
      history.current = { ...rollbackTo };
      history.rollbackVersion = currentVersion.version;

      // 更新兼容性矩阵
      this.updateCompatibilityMatrix(pluginId, rollbackTo.version);

      // 更新历史记录
      history.updateHistory.push({
        from: currentVersion.version,
        to: rollbackTo.version,
        timestamp: Date.now(),
        success: true
      });

      // 发出回滚事件
      this.emit('versionRollback', {
        pluginId,
        fromVersion: currentVersion.version,
        toVersion: rollbackTo.version,
        timestamp: Date.now()
      });

      logger.info(
        'Version',
        `Rolled back plugin ${pluginId} from v${currentVersion.version} to v${rollbackTo.version}`
      );
    } catch (error) {
      // 记录回滚失败
      history.updateHistory.push({
        from: history.current.version,
        to: rollbackTo.version,
        timestamp: Date.now(),
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  public getVersionHistory(pluginId: string): VersionHistory | undefined {
    return this.versions.get(pluginId);
  }

  public getCompatibleVersions(pluginId: string): string[] {
    const compatibleVersions = this.compatibilityMatrix.get(pluginId);
    return compatibleVersions ? Array.from(compatibleVersions) : [];
  }

  private updateCompatibilityMatrix(pluginId: string, version: string): void {
    let compatibleVersions = this.compatibilityMatrix.get(pluginId);
    if (!compatibleVersions) {
      compatibleVersions = new Set();
      this.compatibilityMatrix.set(pluginId, compatibleVersions);
    }
    compatibleVersions.add(version);
  }

  private checkCoreCompatibility(pluginVersion: string): boolean {
    return semver.satisfies(this.coreVersion, `^${pluginVersion}`);
  }

  private findCompatibleVersion(pluginId: string, currentVersion: string): string | undefined {
    const history = this.versions.get(pluginId);
    if (!history) return undefined;

    // 查找最近的兼容版本
    return history.previous
      .filter(v => this.compatibilityMatrix.get(pluginId)?.has(v.version))
      .sort((a, b) => semver.compare(b.version, a.version))[0]?.version;
  }

  public async createVersionAlert(
    plugin: Plugin,
    changes: string[]
  ): Promise<Omit<Alert, 'id' | 'timestamp'>> {
    return {
      type: AlertType.PLUGIN,
      severity: AlertSeverity.INFO,
      source: plugin.metadata.name,
      message: `Plugin ${plugin.metadata.name} updated to version ${plugin.metadata.version}`,
      data: {
        changes: changes.join('\n')
      }
    };
  }

  public async handleVersionError(
    plugin: Plugin,
    error: Error
  ): Promise<Omit<Alert, 'id' | 'timestamp'>> {
    return {
      type: AlertType.PLUGIN,
      severity: AlertSeverity.ERROR,
      source: plugin.metadata.name,
      message: `Plugin version check failed: ${error.message}`,
      data: {
        error: error.message,
        plugin: plugin.metadata.name,
        version: plugin.metadata.version
      }
    };
  }
}

export class VersionManager {
  private static readonly VERSION_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  private static readonly RANGE_REGEX = /^([<>]=?|=)\s*(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

  private alertManager: AlertManager;

  constructor(alertManager: AlertManager) {
    this.alertManager = alertManager;
  }

  static isValidVersion(version: string): boolean {
    return semver.valid(version) !== null;
  }

  static isValidVersionRange(range: string): boolean {
    return semver.validRange(range) !== null;
  }

  static parseVersion(version: string): Version {
    const parsed = semver.parse(version);
    if (!parsed) {
      throw new Error(`Invalid version format: ${version}`);
    }

    return {
      major: parsed.major,
      minor: parsed.minor,
      patch: parsed.patch,
      prerelease: parsed.prerelease.length > 0 ? parsed.prerelease : undefined,
      build: parsed.build.length > 0 ? parsed.build : undefined
    };
  }

  static parseVersionRange(range: string): VersionRange {
    const match = range.match(VersionManager.RANGE_REGEX);
    if (!match) {
      throw new Error(`Invalid version range format: ${range}`);
    }

    const [, operator, major, minor, patch, prerelease, build] = match;
    return {
      operator,
      version: {
        major: parseInt(major),
        minor: parseInt(minor),
        patch: parseInt(patch),
        prerelease: prerelease ? prerelease.split('.') : undefined,
        build: build ? build.split('.') : undefined
      }
    };
  }

  static satisfiesRange(version: Version, range: VersionRange): boolean {
    const versionStr = VersionManager.formatVersion(version);
    const rangeStr = `${range.operator}${VersionManager.formatVersion(range.version)}`;
    return semver.satisfies(versionStr, rangeStr);
  }

  static formatVersion(version: Version): string {
    let formatted = `${version.major}.${version.minor}.${version.patch}`;
    if (version.prerelease) {
      formatted += `-${version.prerelease.join('.')}`;
    }
    if (version.build) {
      formatted += `+${version.build.join('.')}`;
    }
    return formatted;
  }

  static incrementVersion(version: Version, type: 'major' | 'minor' | 'patch'): Version {
    const versionStr = VersionManager.formatVersion(version);
    const incremented = semver.inc(versionStr, type);
    if (!incremented) {
      throw new Error(`Failed to increment version: ${versionStr}`);
    }
    return VersionManager.parseVersion(incremented);
  }

  async validatePluginVersion(plugin: Plugin): Promise<boolean> {
    try {
      const version = plugin.metadata.version;
      if (!VersionManager.isValidVersion(version)) {
        await this.alertManager.createAlert({
          type: AlertType.PLUGIN_ERROR,
          severity: AlertSeverity.WARNING,
          message: `Invalid plugin version format: ${version}`,
          metadata: {
            type: 'invalid_version',
            plugin: plugin.metadata.name,
            version
          }
        });
        return false;
      }

      // 检查是否有更新版本可用
      const latestVersion = await this.getLatestVersion(plugin.metadata);
      if (latestVersion && semver.gt(latestVersion, version)) {
        await this.alertManager.createAlert({
          type: AlertType.PLUGIN_ERROR,
          severity: AlertSeverity.INFO,
          message: `New version available for plugin ${plugin.metadata.name}`,
          metadata: {
            type: 'update_available',
            plugin: plugin.metadata.name,
            currentVersion: version,
            latestVersion
          }
        });
      }

      return true;
    } catch (error) {
      logger.error('Version Manager', `Failed to validate plugin version: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  private async getLatestVersion(metadata: PluginMetadata): Promise<string | null> {
    try {
      // 这里可以实现从插件仓库或注册表获取最新版本的逻辑
      // 目前返回 null 表示无法获取最新版本
      return null;
    } catch (error) {
      logger.error('Version Manager', `Failed to get latest version: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }
} 