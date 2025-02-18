import { z } from 'zod';

/**
 * 账户状态枚举
 */
export enum AccountStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended'
}

/**
 * 账户类型枚举
 */
export enum AccountType {
  USER = 'user',
  AGENT = 'agent',
  SYSTEM = 'system'
}

/**
 * 账户权限枚举
 */
export enum AccountPermission {
  READ = 'read',
  WRITE = 'write',
  ADMIN = 'admin'
}

/**
 * 账户模式验证
 */
export const AccountSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(AccountType),
  status: z.nativeEnum(AccountStatus),
  permissions: z.array(z.nativeEnum(AccountPermission)),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * 账户接口类型
 */
export type Account = z.infer<typeof AccountSchema>;

/**
 * 账户创建输入验证
 */
export const CreateAccountSchema = AccountSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

/**
 * 账户创建输入类型
 */
export type CreateAccount = z.infer<typeof CreateAccountSchema>;

/**
 * 账户更新输入验证
 */
export const UpdateAccountSchema = AccountSchema.partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

/**
 * 账户更新输入类型
 */
export type UpdateAccount = z.infer<typeof UpdateAccountSchema>;
