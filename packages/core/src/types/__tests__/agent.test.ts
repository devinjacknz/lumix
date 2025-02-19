import { z } from 'zod';
import { 
  AgentConfig,
  ConsultationMode,
  AgentOptions,
  AgentError
} from '../agent';

describe('Agent Types', () => {
  describe('AgentConfig', () => {
    const AgentConfigSchema = z.object({
      apiKey: z.string(),
      systemPrompt: z.string().optional(),
      maxTokens: z.number().optional(),
      temperature: z.number().optional(),
      model: z.string().optional()
    });

    it('validates valid config with only required fields', () => {
      const config: AgentConfig = {
        apiKey: 'test-api-key'
      };
      
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('validates valid config with all fields', () => {
      const config: AgentConfig = {
        apiKey: 'test-api-key',
        systemPrompt: 'test prompt',
        maxTokens: 100,
        temperature: 0.7,
        model: 'gpt-4'
      };
      
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('fails when apiKey is missing', () => {
      const config = {
        systemPrompt: 'test prompt',
        maxTokens: 100
      };
      
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('fails when maxTokens is not a number', () => {
      const config = {
        apiKey: 'test-api-key',
        maxTokens: '100'
      };
      
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('ConsultationMode', () => {
    const ConsultationModeSchema = z.enum(['beginner', 'expert']);

    it('validates beginner mode', () => {
      const mode: ConsultationMode = 'beginner';
      const result = ConsultationModeSchema.safeParse(mode);
      expect(result.success).toBe(true);
    });

    it('validates expert mode', () => {
      const mode: ConsultationMode = 'expert';
      const result = ConsultationModeSchema.safeParse(mode);
      expect(result.success).toBe(true);
    });

    it('fails on invalid mode', () => {
      const mode = 'invalid';
      const result = ConsultationModeSchema.safeParse(mode);
      expect(result.success).toBe(false);
    });
  });

  describe('AgentOptions', () => {
    const AgentOptionsSchema = z.object({
      config: z.object({
        apiKey: z.string(),
        systemPrompt: z.string().optional(),
        maxTokens: z.number().optional(),
        temperature: z.number().optional(),
        model: z.string().optional()
      }),
      tools: z.array(z.any()).optional(),
      systemPrompt: z.string().optional(),
      consultationMode: z.enum(['beginner', 'expert']).optional()
    });

    it('validates options with only required fields', () => {
      const options: AgentOptions = {
        config: {
          apiKey: 'test-api-key'
        }
      };
      
      const result = AgentOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });

    it('validates options with all fields', () => {
      const options: AgentOptions = {
        config: {
          apiKey: 'test-api-key',
          systemPrompt: 'test prompt',
          maxTokens: 100,
          temperature: 0.7,
          model: 'gpt-4'
        },
        tools: [],
        systemPrompt: 'test system prompt',
        consultationMode: 'expert'
      };
      
      const result = AgentOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });

    it('fails when config is missing', () => {
      const options = {
        tools: [],
        systemPrompt: 'test prompt'
      };
      
      const result = AgentOptionsSchema.safeParse(options);
      expect(result.success).toBe(false);
    });

    it('fails when config is invalid', () => {
      const options = {
        config: {
          systemPrompt: 'test prompt'
        },
        tools: []
      };
      
      const result = AgentOptionsSchema.safeParse(options);
      expect(result.success).toBe(false);
    });
  });

  describe('AgentError', () => {
    it('creates error with message and code', () => {
      const error = new AgentError('test error', 'TEST_ERROR');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AgentError);
      expect(error.message).toBe('test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('AgentError');
    });

    it('maintains error prototype chain', () => {
      const error = new AgentError('test error', 'TEST_ERROR');
      
      expect(Object.getPrototypeOf(error)).toBe(AgentError.prototype);
      expect(Object.getPrototypeOf(Object.getPrototypeOf(error))).toBe(Error.prototype);
    });

    it('supports instanceof checks', () => {
      const error = new AgentError('test error', 'TEST_ERROR');
      
      expect(error instanceof Error).toBe(true);
      expect(error instanceof AgentError).toBe(true);
    });
  });
}); 