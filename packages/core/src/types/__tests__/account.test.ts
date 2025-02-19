import { 
  AccountStatus, 
  AccountType, 
  AccountPermission,
  AccountSchema,
  CreateAccountSchema,
  UpdateAccountSchema
} from '../account';

describe('Account Types', () => {
  describe('Enums', () => {
    test('AccountStatus should have correct values', () => {
      expect(Object.values(AccountStatus)).toEqual(['active', 'inactive', 'suspended']);
    });

    test('AccountType should have correct values', () => {
      expect(Object.values(AccountType)).toEqual(['user', 'agent', 'system']);
    });

    test('AccountPermission should have correct values', () => {
      expect(Object.values(AccountPermission)).toEqual(['read', 'write', 'admin']);
    });
  });

  describe('AccountSchema Validation', () => {
    const validAccount = {
      id: '123',
      type: AccountType.USER,
      status: AccountStatus.ACTIVE,
      permissions: [AccountPermission.READ],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    test('should validate correct account data', () => {
      expect(() => AccountSchema.parse(validAccount)).not.toThrow();
    });

    test('should validate with optional metadata', () => {
      const accountWithMeta = {
        ...validAccount,
        metadata: { key: 'value' }
      };
      expect(() => AccountSchema.parse(accountWithMeta)).not.toThrow();
    });

    test('should reject invalid account type', () => {
      const invalid = {
        ...validAccount,
        type: 'invalid'
      };
      expect(() => AccountSchema.parse(invalid)).toThrow();
    });

    test('should reject invalid status', () => {
      const invalid = {
        ...validAccount,
        status: 'invalid'
      };
      expect(() => AccountSchema.parse(invalid)).toThrow();
    });

    test('should reject invalid permissions', () => {
      const invalid = {
        ...validAccount,
        permissions: ['invalid']
      };
      expect(() => AccountSchema.parse(invalid)).toThrow();
    });
  });

  describe('CreateAccountSchema Validation', () => {
    const validCreateAccount = {
      type: AccountType.USER,
      status: AccountStatus.ACTIVE,
      permissions: [AccountPermission.READ]
    };

    test('should validate correct create account data', () => {
      expect(() => CreateAccountSchema.parse(validCreateAccount)).not.toThrow();
    });

    test('should reject if id is provided', () => {
      const invalid = {
        ...validCreateAccount,
        id: '123'
      };
      expect(() => CreateAccountSchema.parse(invalid)).toThrow();
    });
  });

  describe('UpdateAccountSchema Validation', () => {
    test('should allow partial updates', () => {
      const partialUpdate = {
        status: AccountStatus.INACTIVE
      };
      expect(() => UpdateAccountSchema.parse(partialUpdate)).not.toThrow();
    });

    test('should reject if id is provided', () => {
      const invalid = {
        id: '123',
        status: AccountStatus.INACTIVE
      };
      expect(() => UpdateAccountSchema.parse(invalid)).toThrow();
    });

    test('should validate metadata updates', () => {
      const update = {
        metadata: { newKey: 'newValue' }
      };
      expect(() => UpdateAccountSchema.parse(update)).not.toThrow();
    });
  });
}); 