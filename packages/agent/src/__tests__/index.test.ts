
import { LumixAgent } from '../index';

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
  }
}));

describe('index exports', () => {
  it('should export LumixAgent class', () => {
    expect(LumixAgent).toBeDefined();
    expect(typeof LumixAgent).toBe('function');
  });
});
