import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { marked } from 'marked';
import * as handlebars from 'handlebars';
import * as prettier from 'prettier';

export interface DocConfig {
  input: {
    sourceDirs: string[];
    include?: string[];
    exclude?: string[];
  };
  output: {
    dir: string;
    format: 'html' | 'markdown' | 'pdf';
    theme?: string;
  };
  templates: {
    dir: string;
    api?: string;
    guide?: string;
    readme?: string;
  };
  metadata: {
    title: string;
    version: string;
    description: string;
    repository?: string;
    author?: string;
  };
}

export interface DocNode {
  kind: 'class' | 'interface' | 'type' | 'enum' | 'function' | 'variable';
  name: string;
  description: string;
  signature?: string;
  modifiers?: string[];
  members?: DocNode[];
  params?: DocParam[];
  returns?: DocType;
  examples?: string[];
  source?: {
    file: string;
    line: number;
  };
}

export interface DocParam {
  name: string;
  type: DocType;
  description: string;
  optional: boolean;
  defaultValue?: string;
}

export interface DocType {
  name: string;
  type: string;
  description?: string;
  members?: DocType[];
}

export class DocumentationGenerator {
  private program: ts.Program;
  private checker: ts.TypeChecker;
  private nodes: Map<string, DocNode> = new Map();
  private dependencies: Map<string, Set<string>> = new Map();

  constructor(private config: DocConfig) {
    // 初始化TypeScript编译器
    this.program = ts.createProgram(this.getSourceFiles(), {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    });
    this.checker = this.program.getTypeChecker();
  }

  private getSourceFiles(): string[] {
    const files: string[] = [];
    for (const dir of this.config.input.sourceDirs) {
      this.walkDirectory(dir, (file) => {
        if (this.shouldIncludeFile(file)) {
          files.push(file);
        }
      });
    }
    return files;
  }

  private walkDirectory(dir: string, callback: (file: string) => void) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        this.walkDirectory(fullPath, callback);
      } else if (stat.isFile()) {
        callback(fullPath);
      }
    }
  }

  private shouldIncludeFile(file: string): boolean {
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) return false;
    if (file.endsWith('.d.ts')) return false;

    const relativePath = path.relative(process.cwd(), file);
    
    if (this.config.input.include) {
      return this.config.input.include.some(pattern => 
        this.matchGlobPattern(relativePath, pattern)
      );
    }

    if (this.config.input.exclude) {
      return !this.config.input.exclude.some(pattern =>
        this.matchGlobPattern(relativePath, pattern)
      );
    }

    return true;
  }

  private matchGlobPattern(path: string, pattern: string): boolean {
    // 简单的glob匹配实现
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regexPattern}$`).test(path);
  }

  async generate(): Promise<void> {
    // 解析源代码
    await this.parseSourceFiles();

    // 分析依赖关系
    this.analyzeDependencies();

    // 生成文档
    await this.generateDocs();
  }

  private async parseSourceFiles() {
    for (const sourceFile of this.program.getSourceFiles()) {
      if (!sourceFile.isDeclarationFile) {
        this.visitNode(sourceFile);
      }
    }
  }

  private visitNode(node: ts.Node) {
    if (ts.isClassDeclaration(node) && node.name) {
      this.parseClass(node);
    } else if (ts.isInterfaceDeclaration(node) && node.name) {
      this.parseInterface(node);
    } else if (ts.isTypeAliasDeclaration(node) && node.name) {
      this.parseTypeAlias(node);
    } else if (ts.isEnumDeclaration(node) && node.name) {
      this.parseEnum(node);
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      this.parseFunction(node);
    } else if (ts.isVariableStatement(node)) {
      this.parseVariable(node);
    }

    ts.forEachChild(node, child => this.visitNode(child));
  }

  private parseClass(node: ts.ClassDeclaration) {
    const symbol = this.checker.getSymbolAtLocation(node.name!);
    if (!symbol) return;

    const docNode: DocNode = {
      kind: 'class',
      name: node.name!.text,
      description: ts.displayPartsToString(symbol.getDocumentationComment(this.checker)),
      modifiers: node.modifiers?.map(m => m.getText()) || [],
      members: [],
      source: this.getSourceLocation(node),
    };

    // 解析构造函数
    const constructor = node.members.find(m => ts.isConstructorDeclaration(m));
    if (constructor && ts.isConstructorDeclaration(constructor)) {
      docNode.members!.push(this.parseConstructor(constructor));
    }

    // 解析方法和属性
    for (const member of node.members) {
      if (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) {
        const memberDoc = this.parseMember(member);
        if (memberDoc) {
          docNode.members!.push(memberDoc);
        }
      }
    }

    this.nodes.set(docNode.name, docNode);
  }

  private parseInterface(node: ts.InterfaceDeclaration) {
    const symbol = this.checker.getSymbolAtLocation(node.name);
    if (!symbol) return;

    const docNode: DocNode = {
      kind: 'interface',
      name: node.name.text,
      description: ts.displayPartsToString(symbol.getDocumentationComment(this.checker)),
      members: [],
      source: this.getSourceLocation(node),
    };

    // 解析属性和方法
    for (const member of node.members) {
      const memberDoc = this.parseMember(member);
      if (memberDoc) {
        docNode.members!.push(memberDoc);
      }
    }

    this.nodes.set(docNode.name, docNode);
  }

  private parseConstructor(node: ts.ConstructorDeclaration): DocNode {
    return {
      kind: 'function',
      name: 'constructor',
      description: ts.displayPartsToString(
        this.checker.getSymbolAtLocation(node)?.getDocumentationComment(this.checker) || []
      ),
      params: this.parseParameters(node.parameters),
      source: this.getSourceLocation(node),
    };
  }

  private parseMember(node: ts.ClassElement | ts.TypeElement): DocNode | null {
    if (!node.name) return null;

    const symbol = this.checker.getSymbolAtLocation(node.name);
    if (!symbol) return null;

    const docNode: DocNode = {
      kind: ts.isMethodDeclaration(node) ? 'function' : 'variable',
      name: symbol.getName(),
      description: ts.displayPartsToString(symbol.getDocumentationComment(this.checker)),
      modifiers: node.modifiers?.map(m => m.getText()),
      source: this.getSourceLocation(node),
    };

    if (ts.isMethodDeclaration(node)) {
      docNode.params = this.parseParameters(node.parameters);
      docNode.returns = this.parseReturnType(node);
    } else if (ts.isPropertyDeclaration(node)) {
      docNode.signature = this.parsePropertyType(node);
    }

    return docNode;
  }

  private parseParameters(params: ts.NodeArray<ts.ParameterDeclaration>): DocParam[] {
    return params.map(param => {
      const symbol = this.checker.getSymbolAtLocation(param.name);
      return {
        name: param.name.getText(),
        type: this.parseType(param.type),
        description: symbol ? ts.displayPartsToString(symbol.getDocumentationComment(this.checker)) : '',
        optional: !!param.questionToken,
        defaultValue: param.initializer?.getText(),
      };
    });
  }

  private parseType(typeNode?: ts.TypeNode): DocType {
    if (!typeNode) {
      return { name: 'any', type: 'any' };
    }

    const type = this.checker.getTypeFromTypeNode(typeNode);
    return {
      name: this.checker.typeToString(type),
      type: typeNode.kind === ts.SyntaxKind.TypeLiteral ? 'object' : 'primitive',
      members: this.parseTypeMembers(type),
    };
  }

  private parseTypeMembers(type: ts.Type): DocType[] | undefined {
    if (!(type.flags & ts.TypeFlags.Object)) return undefined;

    const properties = type.getProperties();
    if (properties.length === 0) return undefined;

    return properties.map(prop => ({
      name: prop.getName(),
      type: this.checker.typeToString(
        this.checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration!)
      ),
      description: ts.displayPartsToString(prop.getDocumentationComment(this.checker)),
    }));
  }

  private parseReturnType(node: ts.MethodDeclaration): DocType {
    const signature = this.checker.getSignatureFromDeclaration(node);
    if (!signature) return { name: 'void', type: 'primitive' };

    const returnType = this.checker.getReturnTypeOfSignature(signature);
    return {
      name: this.checker.typeToString(returnType),
      type: 'primitive',
      description: ts.displayPartsToString(signature.getDocumentationComment(this.checker)),
    };
  }

  private parsePropertyType(node: ts.PropertyDeclaration): string {
    if (!node.type) return 'any';
    return node.type.getText();
  }

  private getSourceLocation(node: ts.Node): { file: string; line: number } {
    const sourceFile = node.getSourceFile();
    const { line } = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart());
    return {
      file: path.relative(process.cwd(), sourceFile.fileName),
      line: line + 1,
    };
  }

  private analyzeDependencies() {
    for (const [name, node] of this.nodes.entries()) {
      const deps = new Set<string>();
      this.collectDependencies(node, deps);
      this.dependencies.set(name, deps);
    }
  }

  private collectDependencies(node: DocNode, deps: Set<string>) {
    // 收集类型依赖
    if (node.returns) {
      this.addTypeDependency(node.returns, deps);
    }

    if (node.params) {
      for (const param of node.params) {
        this.addTypeDependency(param.type, deps);
      }
    }

    if (node.members) {
      for (const member of node.members) {
        this.collectDependencies(member, deps);
      }
    }
  }

  private addTypeDependency(type: DocType, deps: Set<string>) {
    if (this.nodes.has(type.name)) {
      deps.add(type.name);
    }

    if (type.members) {
      for (const member of type.members) {
        this.addTypeDependency(member, deps);
      }
    }
  }

  private async generateDocs() {
    // 创建输出目录
    if (!fs.existsSync(this.config.output.dir)) {
      fs.mkdirSync(this.config.output.dir, { recursive: true });
    }

    // 生成API文档
    await this.generateApiDocs();

    // 生成指南文档
    await this.generateGuideDocs();

    // 生成README
    await this.generateReadme();

    // 生成索引
    await this.generateIndex();
  }

  private async generateApiDocs() {
    const template = await this.loadTemplate('api');
    const groups = this.groupNodes();

    for (const [group, nodes] of groups) {
      const content = template({
        group,
        nodes,
        config: this.config,
      });

      const formattedContent = await this.formatContent(content);
      const outputPath = path.join(
        this.config.output.dir,
        'api',
        `${group}.${this.config.output.format}`
      );

      await this.writeFile(outputPath, formattedContent);
    }
  }

  private groupNodes(): Map<string, DocNode[]> {
    const groups = new Map<string, DocNode[]>();

    for (const node of this.nodes.values()) {
      const group = this.getNodeGroup(node);
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(node);
    }

    return groups;
  }

  private getNodeGroup(node: DocNode): string {
    const source = node.source?.file || '';
    const parts = source.split('/');
    return parts[parts.length - 2] || 'misc';
  }

  private async generateGuideDocs() {
    const template = await this.loadTemplate('guide');
    const guides = this.collectGuides();

    for (const guide of guides) {
      const content = template({
        guide,
        config: this.config,
      });

      const formattedContent = await this.formatContent(content);
      const outputPath = path.join(
        this.config.output.dir,
        'guides',
        `${guide.name}.${this.config.output.format}`
      );

      await this.writeFile(outputPath, formattedContent);
    }
  }

  private collectGuides(): any[] {
    // 实现指南文档收集逻辑
    return [];
  }

  private async generateReadme() {
    const template = await this.loadTemplate('readme');
    const content = template({
      config: this.config,
      stats: this.collectStats(),
    });

    const formattedContent = await this.formatContent(content);
    const outputPath = path.join(
      this.config.output.dir,
      `README.${this.config.output.format}`
    );

    await this.writeFile(outputPath, formattedContent);
  }

  private collectStats() {
    return {
      totalFiles: this.program.getSourceFiles().length,
      totalTypes: this.nodes.size,
      coverage: this.calculateCoverage(),
    };
  }

  private calculateCoverage(): number {
    let documented = 0;
    let total = 0;

    for (const node of this.nodes.values()) {
      total++;
      if (node.description) documented++;

      if (node.members) {
        for (const member of node.members) {
          total++;
          if (member.description) documented++;
        }
      }
    }

    return total > 0 ? documented / total : 0;
  }

  private async generateIndex() {
    const groups = this.groupNodes();
    const index = {
      metadata: this.config.metadata,
      groups: Array.from(groups.entries()).map(([name, nodes]) => ({
        name,
        nodes: nodes.map(node => ({
          name: node.name,
          kind: node.kind,
          description: node.description,
        })),
      })),
    };

    const content = JSON.stringify(index, null, 2);
    const outputPath = path.join(this.config.output.dir, 'index.json');
    await this.writeFile(outputPath, content);
  }

  private async loadTemplate(name: string): Promise<handlebars.TemplateDelegate> {
    const templatePath = path.join(
      this.config.templates.dir,
      `${name}.${this.config.output.format}.hbs`
    );
    const template = await fs.promises.readFile(templatePath, 'utf-8');
    return handlebars.compile(template);
  }

  private async formatContent(content: string): Promise<string> {
    switch (this.config.output.format) {
      case 'html':
        return prettier.format(content, { parser: 'html' });
      case 'markdown':
        return prettier.format(content, { parser: 'markdown' });
      default:
        return content;
    }
  }

  private async writeFile(filePath: string, content: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content);
  }
}

export { DocumentationGenerator, DocConfig, DocNode, DocParam, DocType }; 