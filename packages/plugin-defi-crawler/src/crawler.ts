import axios, { AxiosInstance } from 'axios';
import { Chain, CrawlerResult, DeFiCrawlerConfig, DeFiProtocol, DeFiSource } from './types';

export class DeFiCrawler {
  private readonly config: DeFiCrawlerConfig;
  private readonly httpClient: AxiosInstance;
  private rateLimitTimeout: number;

  constructor(config: DeFiCrawlerConfig) {
    this.config = config;
    this.rateLimitTimeout = 1000 / config.rateLimit.requestsPerSecond;

    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Lumix-DeFi-Crawler/1.0.0'
      }
    });

    // Add rate limiting interceptor
    this.httpClient.interceptors.request.use(async (reqConfig: any) => {
      await this.rateLimit();
      return reqConfig;
    });
  }

  private async rateLimit(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, this.rateLimitTimeout));
  }

  private async fetchWithRetry<T>(
    url: string, 
    options: { 
      method?: string; 
      params?: Record<string, unknown>;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    let attempts = 0;
    
    while (attempts < this.config.maxRetries) {
      try {
        const response = await this.httpClient.request<T>({
          url,
          method: options.method || 'GET',
          params: options.params,
          headers: options.headers
        });
        return response.data;
      } catch (error) {
        attempts++;
        if (attempts === this.config.maxRetries) {
          throw error;
        }
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, attempts) * 1000)
        );
      }
    }
    
    throw new Error('Max retries exceeded');
  }

  public async getProtocols(chain: Chain): Promise<CrawlerResult<DeFiProtocol[]>> {
    const sources = this.config.sources[chain];
    const protocols: DeFiProtocol[] = [];
    const errors: CrawlerError[] = [];

    for (const source of sources) {
      try {
        const data = await this.fetchFromSource(source, chain);
        protocols.push(...data);
      } catch (error) {
        errors.push({
          name: 'FetchError',
          message: (error as Error).message,
          code: 'FETCH_ERROR',
          source: source.name
        });
      }
    }

    return {
      success: errors.length === 0,
      data: {
        success: errors.length === 0,
        data: protocols,
        error: errors.length > 0 ? {
          name: 'FetchError',
          message: `Failed to fetch from some sources: ${errors.map(e => e.message).join(', ')}`,
          code: 'FETCH_ERROR'
        } : undefined
      }
    };
  }

  private async fetchFromSource(source: DeFiSource, chain: Chain): Promise<DeFiProtocol[]> {
    const headers: Record<string, string> = {};
    
    if (source.auth && this.config.apiKeys?.[source.name]) {
      headers['Authorization'] = `Bearer ${this.config.apiKeys[source.name]}`;
    }

    const response = await this.fetchWithRetry<any>(
      source.url,
      {
        params: source.params,
        headers
      }
    );

    return this.normalizeProtocolData(response, chain, source);
  }

  private normalizeProtocolData(
    data: any, 
    chain: Chain,
    source: DeFiSource
  ): DeFiProtocol[] {
    // Handle different source data formats
    switch (source.name) {
      case 'DeFiLlama':
        return this.normalizeDeFiLlamaData(data, chain);
      case 'Solscan':
        return this.normalizeSolscanData(data, chain);
      default:
        throw new Error(`Unknown source: ${source.name}`);
    }
  }

  private normalizeDeFiLlamaData(data: any, chain: Chain): DeFiProtocol[] {
    return data.protocols
      .filter((p: any) => p.chain.toUpperCase() === chain)
      .map((p: any) => ({
        chain,
        name: p.name,
        contractAddress: p.address || '',
        tvl: p.tvl || 0,
        apy: p.apy || 0,
        risks: {
          auditStatus: p.audit ? 'verified' : 'none',
          insurance: !!p.insurance,
          centralizationRisks: []
        },
        liquidityPools: p.pools?.map((pool: any) => ({
          pair: pool.symbol,
          volume24h: pool.volume24h || 0,
          feeRate: pool.fee || 0
        })) || [],
        createdAt: p.createdAt || Date.now(),
        updatedAt: Date.now()
      }));
  }

  private normalizeSolscanData(data: any, chain: Chain): DeFiProtocol[] {
    return data.data.map((p: any) => ({
      chain,
      name: p.name,
      contractAddress: p.programId,
      tvl: p.tvl || 0,
      apy: p.apy || 0,
      risks: {
        auditStatus: p.audited ? 'verified' : 'none',
        insurance: false,
        centralizationRisks: []
      },
      liquidityPools: p.pools?.map((pool: any) => ({
        pair: pool.name,
        volume24h: pool.volume24h || 0,
        feeRate: pool.fee || 0
      })) || [],
      createdAt: p.createdAt || Date.now(),
      updatedAt: Date.now()
    }));
  }

  public async getProtocolDetails(
    chain: Chain,
    address: string
  ): Promise<CrawlerResult<DeFiProtocol>> {
    try {
      const protocols = await this.getProtocols(chain);
      const protocol = protocols.data?.data?.find((p: DeFiProtocol) => 
        p.contractAddress.toLowerCase() === address.toLowerCase()
      );

      if (!protocol) {
        return {
          success: false,
          data: {
            success: false,
            error: {
            name: 'NotFoundError',
            message: `Protocol not found: ${address}`,
            code: 'NOT_FOUND'
            }
          }
        };
      }

      return {
        success: true,
        data: {
          success: true,
          data: protocol
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'FetchError',
          message: (error as Error).message,
          code: 'FETCH_ERROR'
        }
      };
    }
  }

  public async getChainStats(chain: Chain): Promise<CrawlerResult> {
    try {
      const protocols = await this.getProtocols(chain);
      
      if (!protocols.success || !protocols.data?.data) {
        return protocols;
      }

      const protocolsData = protocols.data.data;
      const totalTvl = protocolsData.reduce((sum: number, p: DeFiProtocol) => sum + p.tvl, 0);
      const totalProtocols = protocolsData.length;
      const averageApy = protocolsData.reduce((sum: number, p: DeFiProtocol) => sum + (p.apy || 0), 0) / totalProtocols;

      const tvlByProtocol = protocolsData.reduce((acc: Record<string, number>, p: DeFiProtocol) => {
        acc[p.name] = p.tvl;
        return acc;
      }, {});

      return {
        success: true,
        data: {
          success: true,
          stats: {
            chain,
            totalTvl,
            totalProtocols,
            averageApy,
            protocols: protocolsData,
            tvlByProtocol
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        data: {
          success: false,
          error: {
            name: 'StatsError',
            message: (error as Error).message,
            code: 'STATS_ERROR'
          }
        }
      };
    }
  }
}
