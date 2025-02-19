import {
  PluginLoaderError,
  PluginDescriptor,
  PluginState
} from '../types';

export class DependencyResolver {
  private plugins: Map<string, PluginDescriptor>;
  private dependencyGraph: Map<string, Set<string>>;
  private reverseGraph: Map<string, Set<string>>;

  constructor() {
    this.plugins = new Map();
    this.dependencyGraph = new Map();
    this.reverseGraph = new Map();
  }

  /**
   * 添加插件
   */
  addPlugin(plugin: PluginDescriptor): void {
    // 保存插件信息
    this.plugins.set(plugin.id, plugin);

    // 初始化依赖图
    if (!this.dependencyGraph.has(plugin.id)) {
      this.dependencyGraph.set(plugin.id, new Set());
    }
    if (!this.reverseGraph.has(plugin.id)) {
      this.reverseGraph.set(plugin.id, new Set());
    }

    // 添加依赖关系
    for (const depId of plugin.dependencies) {
      this.dependencyGraph.get(plugin.id)?.add(depId);
      if (!this.reverseGraph.has(depId)) {
        this.reverseGraph.set(depId, new Set());
      }
      this.reverseGraph.get(depId)?.add(plugin.id);
    }
  }

  /**
   * 移除插件
   */
  removePlugin(pluginId: string): void {
    // 移除依赖关系
    const dependencies = this.dependencyGraph.get(pluginId);
    if (dependencies) {
      for (const depId of dependencies) {
        this.reverseGraph.get(depId)?.delete(pluginId);
      }
    }

    // 移除反向依赖
    const dependents = this.reverseGraph.get(pluginId);
    if (dependents) {
      for (const depId of dependents) {
        this.dependencyGraph.get(depId)?.delete(pluginId);
      }
    }

    // 移除插件
    this.plugins.delete(pluginId);
    this.dependencyGraph.delete(pluginId);
    this.reverseGraph.delete(pluginId);
  }

  /**
   * 获取插件的依赖
   */
  getDependencies(pluginId: string): Set<string> {
    return this.dependencyGraph.get(pluginId) || new Set();
  }

  /**
   * 获取依赖插件的插件
   */
  getDependents(pluginId: string): Set<string> {
    return this.reverseGraph.get(pluginId) || new Set();
  }

  /**
   * 检查是否存在循环依赖
   */
  hasCyclicDependencies(pluginId: string): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (currentId: string): boolean => {
      // 如果节点在递归栈中，说明存在循环
      if (recursionStack.has(currentId)) {
        return true;
      }

      // 如果节点已访问且不在递归栈中，说明这条路径安全
      if (visited.has(currentId)) {
        return false;
      }

      // 标记节点为已访问并加入递归栈
      visited.add(currentId);
      recursionStack.add(currentId);

      // 递归检查所有依赖
      const dependencies = this.dependencyGraph.get(currentId);
      if (dependencies) {
        for (const depId of dependencies) {
          if (dfs(depId)) {
            return true;
          }
        }
      }

      // 回溯时从递归栈中移除节点
      recursionStack.delete(currentId);
      return false;
    };

    return dfs(pluginId);
  }

  /**
   * 获取加载顺序
   */
  getLoadOrder(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (pluginId: string) => {
      // 如果节点已访问，跳过
      if (visited.has(pluginId)) {
        return;
      }

      // 标记节点为已访问
      visited.add(pluginId);

      // 先访问所有依赖
      const dependencies = this.dependencyGraph.get(pluginId);
      if (dependencies) {
        for (const depId of dependencies) {
          visit(depId);
        }
      }

      // 将节点加入顺序列表
      order.push(pluginId);
    };

    // 访问所有节点
    for (const pluginId of this.plugins.keys()) {
      visit(pluginId);
    }

    return order;
  }

  /**
   * 获取卸载顺序
   */
  getUnloadOrder(): string[] {
    // 卸载顺序与加载顺序相反
    return this.getLoadOrder().reverse();
  }

  /**
   * 验证依赖关系
   */
  validateDependencies(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new PluginLoaderError(`Plugin ${pluginId} not found`);
    }

    // 检查所有依赖是否存在
    for (const depId of plugin.dependencies) {
      if (!this.plugins.has(depId)) {
        throw new PluginLoaderError(
          `Dependency ${depId} not found for plugin ${pluginId}`
        );
      }
    }

    // 检查是否存在循环依赖
    if (this.hasCyclicDependencies(pluginId)) {
      throw new PluginLoaderError(
        `Cyclic dependency detected for plugin ${pluginId}`
      );
    }

    // 检查版本兼容性
    for (const depId of plugin.dependencies) {
      const dep = this.plugins.get(depId);
      if (dep && plugin.metadata.dependencies?.[depId]) {
        const requiredVersion = plugin.metadata.dependencies[depId];
        if (!this.isVersionCompatible(dep.metadata.version, requiredVersion)) {
          throw new PluginLoaderError(
            `Incompatible version for dependency ${depId}: required ${requiredVersion}, found ${dep.metadata.version}`
          );
        }
      }
    }
  }

  /**
   * 获取依赖树
   */
  getDependencyTree(pluginId: string): {
    id: string;
    dependencies: Array<{
      id: string;
      dependencies: any[];
    }>;
  } {
    const visited = new Set<string>();

    const buildTree = (currentId: string, visited: Set<string>) => {
      if (visited.has(currentId)) {
        return null;
      }

      visited.add(currentId);
      const dependencies: Array<{
        id: string;
        dependencies: any[];
      }> = [];

      const deps = this.dependencyGraph.get(currentId);
      if (deps) {
        for (const depId of deps) {
          const subTree = buildTree(depId, new Set(visited));
          if (subTree) {
            dependencies.push(subTree);
          }
        }
      }

      return {
        id: currentId,
        dependencies
      };
    };

    return buildTree(pluginId, visited) || {
      id: pluginId,
      dependencies: []
    };
  }

  /**
   * 获取影响分析
   */
  getImpactAnalysis(pluginId: string): {
    directDependents: string[];
    indirectDependents: string[];
    totalImpact: number;
  } {
    const directDependents = Array.from(this.getDependents(pluginId));
    const allDependents = new Set<string>();
    const visited = new Set<string>();

    // 使用 DFS 找出所有间接依赖
    const findAllDependents = (currentId: string) => {
      if (visited.has(currentId)) {
        return;
      }

      visited.add(currentId);
      const dependents = this.getDependents(currentId);
      for (const depId of dependents) {
        allDependents.add(depId);
        findAllDependents(depId);
      }
    };

    findAllDependents(pluginId);

    // 移除直接依赖，得到间接依赖
    const indirectDependents = Array.from(allDependents)
      .filter(id => !directDependents.includes(id));

    return {
      directDependents,
      indirectDependents,
      totalImpact: allDependents.size
    };
  }

  /**
   * 获取可选依赖
   */
  getOptionalDependencies(pluginId: string): string[] {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return [];
    }

    return Array.from(plugin.dependencies).filter(depId =>
      plugin.metadata.optionalDependencies?.[depId]
    );
  }

  /**
   * 检查依赖是否满足
   */
  areDependenciesSatisfied(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return false;
    }

    // 获取必需依赖（非可选依赖）
    const requiredDeps = Array.from(plugin.dependencies)
      .filter(depId => !plugin.metadata.optionalDependencies?.[depId]);

    // 检查每个必需依赖是否存在
    for (const depId of requiredDeps) {
      if (!this.plugins.has(depId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 获取缺失的依赖
   */
  getMissingDependencies(pluginId: string): string[] {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return [];
    }

    return Array.from(plugin.dependencies).filter(depId =>
      !this.plugins.has(depId) &&
      !plugin.metadata.optionalDependencies?.[depId]
    );
  }

  /**
   * 获取依赖统计信息
   */
  getDependencyStats(): {
    totalDependencies: number;
    averageDependencies: number;
    maxDependencies: number;
    cyclicDependencies: number;
    optionalDependencies: number;
  } {
    let totalDeps = 0;
    let maxDeps = 0;
    let cyclicDeps = 0;
    let optionalDeps = 0;

    for (const [pluginId, plugin] of this.plugins.entries()) {
      const depsCount = plugin.dependencies.size;
      totalDeps += depsCount;
      maxDeps = Math.max(maxDeps, depsCount);

      if (this.hasCyclicDependencies(pluginId)) {
        cyclicDeps++;
      }

      optionalDeps += this.getOptionalDependencies(pluginId).length;
    }

    return {
      totalDependencies: totalDeps,
      averageDependencies: totalDeps / this.plugins.size || 0,
      maxDependencies: maxDeps,
      cyclicDependencies: cyclicDeps,
      optionalDependencies: optionalDeps
    };
  }

  /**
   * 检查版本兼容性
   */
  private isVersionCompatible(
    actualVersion: string,
    requiredVersion: string
  ): boolean {
    // 简单的版本比较，可以根据需要扩展
    return actualVersion === requiredVersion ||
           actualVersion.startsWith(requiredVersion);
  }
} 