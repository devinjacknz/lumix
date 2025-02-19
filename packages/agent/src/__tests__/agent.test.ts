import { SolanaAgent } from '../agent';

import { StructuredTool } from '@langchain/core/tools';
import { AgentExecutor, initializeAgentExecutorWithOptions } from 'langchain/agents';

// Mock dependencies
jest.mock('@lumix/core', () => ({
  AgentConfig: {},
  ConsultationMode: {
    EXPERT: 'expert',
    BEGINNER: 'beginner'
  },
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  systemMonitor: {
    getInstance: jest.fn(() => ({
      trackAgentInitialization: jest.fn(),
      trackAgentExecution: jest.fn()
    }))
  },
  AgentError: class extends Error {
    code?: string;
    constructor(message: string, code?: string) {
      super(message);
      this.name = 'AgentError';
      if (code) this.code = code;
    }
  }
}));

jest.mock('@lumix/models', () => ({
  createModelAdapter: jest.fn().mockImplementation((config) => {
    if (config.provider === 'openai') {
      return {
        getModel: jest.fn().mockResolvedValue({
          invoke: jest.fn().mockResolvedValue('mocked response')
        })
      };
    }
    throw new Error(`Unsupported model provider: ${config.provider}`);
  })
}));

jest.mock('langchain/agents', () => ({
  AgentExecutor: {
    fromAgentAndTools: jest.fn()
  },
  initializeAgentExecutorWithOptions: jest.fn().mockResolvedValue({
    invoke: jest.fn().mockResolvedValue({ output: 'mocked response' })
  })
}));

describe('SolanaAgent', () => {
  let agent: SolanaAgent;
  const mockOptions = {
    config: {
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-3.5-turbo'
    },
    tools: [],
    consultationMode: 'expert',
    systemPrompt: 'test prompt'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new SolanaAgent(mockOptions);
  });

  describe('constructor', () => {
    it('should initialize with provided options', () => {
      expect(agent).toBeInstanceOf(SolanaAgent);
    });

    it('should use default system prompt if not provided', () => {
      const agentWithoutPrompt = new SolanaAgent({
        ...mockOptions,
        systemPrompt: undefined
      });
      expect(agentWithoutPrompt).toBeInstanceOf(SolanaAgent);
    });

    it('should use default consultation mode if not provided', () => {
      const agentWithoutMode = new SolanaAgent({
        ...mockOptions,
        consultationMode: undefined
      });
      expect(agentWithoutMode).toBeInstanceOf(SolanaAgent);
    });
  });

  describe('initialize', () => {
    it('should initialize agent executor', async () => {
      await agent.initialize();
      expect(jest.mocked(initializeAgentExecutorWithOptions)).toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', async () => {
      await agent.initialize();
      await agent.initialize();
      expect(jest.mocked(initializeAgentExecutorWithOptions)).toHaveBeenCalledTimes(1);
    });

    it('should throw error if initialization fails', async () => {
      jest.mocked(initializeAgentExecutorWithOptions).mockRejectedValueOnce(new Error('Init error'));
      await expect(agent.initialize()).rejects.toThrow('Failed to initialize agent');
    });
  });

  describe('chat', () => {
    it('should initialize if not already initialized', async () => {
      await agent.chat('test message');
      expect(jest.mocked(initializeAgentExecutorWithOptions)).toHaveBeenCalled();
    });

    it('should return formatted response', async () => {
      const response = await agent.chat('test message');
      expect(response).toBe('mocked response');
    });

    it('should throw error if chat fails', async () => {
      jest.mocked(initializeAgentExecutorWithOptions).mockResolvedValueOnce({
        invoke: jest.fn().mockRejectedValue(new Error('Chat error'))
      } as any);
      await expect(agent.chat('test')).rejects.toThrow('Chat error');
    });
  });

  describe('registerTools', () => {
    it('should update tools and reset executor', () => {
      const newTools: StructuredTool[] = [];
      agent.registerTools(newTools);
      expect(agent.getTools()).toBe(newTools);
    });
  });

  describe('getTools', () => {
    it('should return current tools', () => {
      expect(agent.getTools()).toEqual([]);
    });
  });

  describe('response formatting', () => {
    it('should format response in expert mode without simplification', async () => {
      const response = await agent.chat('What is DEX?');
      expect(response).toBe('mocked response');
    });

    it('should format response in beginner mode with simplification', async () => {
      const beginnerAgent = new SolanaAgent({
        ...mockOptions,
        consultationMode: 'beginner'
      });
      
      jest.mocked(initializeAgentExecutorWithOptions).mockResolvedValueOnce({
        invoke: jest.fn().mockResolvedValue({ output: 'DEX is a trading platform' })
      } as any);

      const response = await beginnerAgent.chat('What is DEX?');
      expect(response).toContain('去中心化交易所');
      expect(response).toContain('一个可以直接交易代币的平台');
    });
  });

  describe('system prompt', () => {
    it('should generate expert mode system prompt', () => {
      const expertAgent = new SolanaAgent(mockOptions);
      const prompt = expertAgent['getDefaultSystemPrompt']();
      expect(prompt).toContain('专业的 Solana DeFi 助手');
      expect(prompt).toContain('提供详细的技术分析');
    });

    it('should generate beginner mode system prompt', () => {
      const beginnerAgent = new SolanaAgent({
        ...mockOptions,
        consultationMode: 'beginner'
      });
      const prompt = beginnerAgent['getDefaultSystemPrompt']();
      expect(prompt).toContain('友好的 Solana DeFi 助手');
      expect(prompt).toContain('通俗易懂的语言');
    });
  });
});
