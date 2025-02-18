/// <reference types="jest" />

declare global {
  const describe: jest.Describe;
  const expect: jest.Expect;
  const it: jest.It;
  const beforeEach: jest.Hook;
  const afterEach: jest.Hook;
  const beforeAll: jest.Hook;
  const afterAll: jest.Hook;
  const test: jest.It;
  const jest: jest.Jest;
}

export {};
