import {
  AccountStatus,
  AccountType,
  AccountPermission,
  AccountSchema,
  CreateAccountSchema,
  UpdateAccountSchema,
  type Account
} from '../../src/types/account';

describe('Account Types', () => {
  describe('Enums', () => {
    it('should have correct AccountStatus values', () => {
      expect(Object.values(AccountStatus)).toEqual(['active', 'inactive', 'suspended']);
    });

    it('should have correct AccountType values', () => {
      expect(Object.values(AccountType)).toEqual(['user', 'agent', 'system']);
    });

    it('should have correct AccountPermission values', () => {
      expect(Object.values(AccountPermission)).toEqual(['read', 'write', 'admin']);
    });
  });

  describe('AccountSchema', () => {
    const validAccount: Account = {
      id: '123',
      type: AccountType.USER,
      status: AccountStatus.ACTIVE,
      permissions: [AccountPermission.READ],
      metadata: { name: 'Test User' },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should validate a correct account object', () => {
      const result = AccountSchema.safeParse(validAccount);
      expect(result.success).toBe(true);
    });

    it('should require all mandatory fields', () => {
      const invalidAccount = {
        id: '123',
        // Missing type
        status: AccountStatus.ACTIVE,
        permissions: [AccountPermission.READ],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = AccountSchema.safeParse(invalidAccount);
      expect(result.success).toBe(false);
    });

    it('should validate account type enum values', () => {
      const invalidAccount = {
        ...validAccount,
        type: 'invalid_type'
      };

      const result = AccountSchema.safeParse(invalidAccount);
      expect(result.success).toBe(false);
    });

    it('should validate account status enum values', () => {
      const invalidAccount = {
        ...validAccount,
        status: 'invalid_status'
      };

      const result = AccountSchema.safeParse(invalidAccount);
      expect(result.success).toBe(false);
    });

    it('should validate permissions array', () => {
      const invalidAccount = {
        ...validAccount,
        permissions: ['invalid_permission']
      };

      const result = AccountSchema.safeParse(invalidAccount);
      expect(result.success).toBe(false);
    });

    it('should allow optional metadata', () => {
      const accountWithoutMetadata = { ...validAccount };
      delete accountWithoutMetadata.metadata;

      const result = AccountSchema.safeParse(accountWithoutMetadata);
      expect(result.success).toBe(true);
    });
  });

  describe('CreateAccountSchema', () => {
    const validCreateAccount = {
      type: AccountType.USER,
      status: AccountStatus.ACTIVE,
      permissions: [AccountPermission.READ],
      metadata: { name: 'Test User' }
    };

    it('should validate a correct create account object', () => {
      const result = CreateAccountSchema.safeParse(validCreateAccount);
      expect(result.success).toBe(true);
    });

    it('should not allow id field', () => {
      const invalidCreate = {
        ...validCreateAccount,
        id: '123'
      };

      const result = CreateAccountSchema.safeParse(invalidCreate);
      expect(result.success).toBe(false);
    });

    it('should not allow createdAt field', () => {
      const invalidCreate = {
        ...validCreateAccount,
        createdAt: new Date()
      };

      const result = CreateAccountSchema.safeParse(invalidCreate);
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateAccountSchema', () => {
    it('should allow partial updates', () => {
      const validUpdate = {
        status: AccountStatus.INACTIVE
      };

      const result = UpdateAccountSchema.safeParse(validUpdate);
      expect(result.success).toBe(true);
    });

    it('should validate enum values in partial updates', () => {
      const invalidUpdate = {
        status: 'invalid_status'
      };

      const result = UpdateAccountSchema.safeParse(invalidUpdate);
      expect(result.success).toBe(false);
    });

    it('should not allow id updates', () => {
      const invalidUpdate = {
        id: '123',
        status: AccountStatus.INACTIVE
      };

      const result = UpdateAccountSchema.safeParse(invalidUpdate);
      expect(result.success).toBe(false);
    });

    it('should allow metadata updates', () => {
      const validUpdate = {
        metadata: { name: 'Updated Name' }
      };

      const result = UpdateAccountSchema.safeParse(validUpdate);
      expect(result.success).toBe(true);
    });
  });
});
