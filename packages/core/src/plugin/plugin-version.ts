import { EventEmitter } from 'events';
import * as semver from 'semver';
import { Plugin, PluginMetadata } from './plugin-manager';
import { logger } from '../monitoring';
import { AlertManager, AlertType, AlertSeverity } from '../monitoring/alerts';

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

export class PluginVersionManager extends EventEmitter {
  private versions: Map<string, VersionHistory>;
  private compatibilityMatrix: Map<string, Set<string>>;
  private alertManager: AlertManager;
  private readonly BACKUP_DIR = '.version_backups';

  constructor(private coreVersion: string) {
    super();
    this.versions = new Map();
    this.compatibilityMatrix = new Map();
    this.alertManager = AlertManager.getInstance();
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

  public async checkCompatibility(plugin: Plugin): Promise<VersionCheckResult> {
    const { id, version, dependencies } = plugin.metadata;
    const issues: string[] = [];
    const details = {
      coreCompatible: false,
      dependenciesCompatible: false,
      pluginsCompatible: false,
      missingDependencies: [] as string[],
      incompatibleDependencies: [] as Array<{
        name: string;
        required: string;
        actual: string;
      }>
    };

    // 检查核心版本兼容性
    details.coreCompatible = this.checkCoreCompatibility(version);
    if (!details.coreCompatible) {
      issues.push(`Plugin ${id} v${version} is not compatible with core v${this.coreVersion}`);
    }

    // 检查依赖兼容性
    const dependencyCheck = await this.checkDependenciesCompatibility(dependencies);
    details.dependenciesCompatible = dependencyCheck.compatible;
    details.missingDependencies = dependencyCheck.missing;
    details.incompatibleDependencies = dependencyCheck.incompatible;

    if (!details.dependenciesCompatible) {
      issues.push(...dependencyCheck.issues);
    }

    // 检查插件间兼容性
    const pluginCheck = await this.checkPluginCompatibility(id, version);
    details.pluginsCompatible = pluginCheck.compatible;
    if (!details.pluginsCompatible) {
      issues.push(...pluginCheck.issues);
    }

    // 查找建议版本
    const suggestedVersion = this.findCompatibleVersion(id, version);

    return {
      compatible: issues.length === 0,
      issues,
      suggestedVersion,
      details
    };
  }

  private async checkDependenciesCompatibility(dependencies: Record<string, string>): Promise<{
    compatible: boolean;
    missing: string[];
    incompatible: Array<{ name: string; required: string; actual: string }>;
    issues: string[];
  }> {
    const missing: string[] = [];
    const incompatible: Array<{ name: string; required: string; actual: string }> = [];
    const issues: string[] = [];

    for (const [depId, requiredVersion] of Object.entries(dependencies)) {
      const depHistory = this.versions.get(depId);
      if (!depHistory) {
        missing.push(depId);
        issues.push(`Dependency ${depId} not found`);
        continue;
      }

      const actualVersion = depHistory.current.version;
      if (!semver.satisfies(actualVersion, requiredVersion)) {
        incompatible.push({
          name: depId,
          required: requiredVersion,
          actual: actualVersion
        });
        issues.push(
          `Dependency ${depId} v${actualVersion} does not satisfy required version ${requiredVersion}`
        );
      }
    }

    return {
      compatible: missing.length === 0 && incompatible.length === 0,
      missing,
      incompatible,
      issues
    };
  }

  private async checkPluginCompatibility(pluginId: string, version: string): Promise<{
    compatible: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    const compatibleVersions = this.compatibilityMatrix.get(pluginId);

    if (compatibleVersions && !compatibleVersions.has(version)) {
      issues.push(`Plugin version ${version} has known compatibility issues`);
      
      // 检查具体的兼容性问题
      const history = this.versions.get(pluginId);
      if (history) {
        const currentPlugins = Array.from(this.versions.entries());
        for (const [otherId, otherHistory] of currentPlugins) {
          if (otherId !== pluginId) {
            const compatible = this.checkPluginPairCompatibility(
              pluginId,
              version,
              otherId,
              otherHistory.current.version
            );
            if (!compatible) {
              issues.push(
                `Incompatible with plugin ${otherId} v${otherHistory.current.version}`
              );
            }
          }
        }
      }
    }

    return {
      compatible: issues.length === 0,
      issues
    };
  }

  private checkPluginPairCompatibility(
    plugin1Id: string,
    version1: string,
    plugin2Id: string,
    version2: string
  ): boolean {
    const history1 = this.versions.get(plugin1Id);
    const history2 = this.versions.get(plugin2Id);

    if (!history1 || !history2) {
      return false;
    }

    // 检查互相的依赖要求
    const plugin1Requires = history1.current.dependencies[plugin2Id];
    const plugin2Requires = history2.current.dependencies[plugin1Id];

    if (plugin1Requires && !semver.satisfies(version2, plugin1Requires)) {
      return false;
    }

    if (plugin2Requires && !semver.satisfies(version1, plugin2Requires)) {
      return false;
    }

    return true;
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
} 