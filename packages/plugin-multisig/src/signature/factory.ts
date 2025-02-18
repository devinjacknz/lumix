import { SignatureVerifier, SignatureConfig } from './verifier';

export class SignatureVerifierFactory {
  private verifiers: Map<number, SignatureVerifier>;
  private defaultConfig: Partial<SignatureConfig>;

  constructor(defaultConfig: Partial<SignatureConfig> = {}) {
    this.verifiers = new Map();
    this.defaultConfig = defaultConfig;
  }

  /**
   * 获取指定链的验证器实例
   */
  getVerifier(chainId: number): SignatureVerifier {
    let verifier = this.verifiers.get(chainId);
    
    if (!verifier) {
      verifier = new SignatureVerifier({
        chainId,
        ...this.defaultConfig
      });
      this.verifiers.set(chainId, verifier);
    }

    return verifier;
  }

  /**
   * 注册新的验证器实例
   */
  registerVerifier(chainId: number, config: SignatureConfig): SignatureVerifier {
    const verifier = new SignatureVerifier({
      ...this.defaultConfig,
      ...config,
      chainId
    });
    this.verifiers.set(chainId, verifier);
    return verifier;
  }

  /**
   * 移除验证器实例
   */
  removeVerifier(chainId: number): boolean {
    return this.verifiers.delete(chainId);
  }

  /**
   * 获取所有支持的链 ID
   */
  getSupportedChains(): number[] {
    return Array.from(this.verifiers.keys());
  }

  /**
   * 更新默认配置
   */
  updateDefaultConfig(config: Partial<SignatureConfig>): void {
    this.defaultConfig = {
      ...this.defaultConfig,
      ...config
    };
  }

  /**
   * 清理所有验证器实例
   */
  clear(): void {
    this.verifiers.clear();
  }
} 