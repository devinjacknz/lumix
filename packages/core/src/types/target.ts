import { z } from 'zod';

/**
 * 目标类型枚举
 */
export enum TargetType {
  TASK = 'task',
  GOAL = 'goal',
  MILESTONE = 'milestone',
  OBJECTIVE = 'objective'
}

/**
 * 目标状态枚举
 */
export enum TargetStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * 目标优先级枚举
 */
export enum TargetPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * 关系类型枚举
 */
export enum RelationType {
  DEPENDS_ON = 'depends_on',
  BLOCKS = 'blocks',
  RELATES_TO = 'relates_to',
  PARENT_OF = 'parent_of',
  CHILD_OF = 'child_of'
}

/**
 * 目标关系模式验证
 */
export const TargetRelationSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  type: z.nativeEnum(RelationType),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * 目标关系类型
 */
export type TargetRelation = z.infer<typeof TargetRelationSchema>;

/**
 * 目标模式验证
 */
export const TargetSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(TargetType),
  status: z.nativeEnum(TargetStatus),
  priority: z.nativeEnum(TargetPriority),
  title: z.string(),
  description: z.string().optional(),
  dueDate: z.date().optional(),
  assigneeId: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  relations: z.array(TargetRelationSchema).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * 目标类型
 */
export type Target = z.infer<typeof TargetSchema>;

/**
 * 目标创建输入验证
 */
export const CreateTargetSchema = TargetSchema.omit({
  id: true,
  relations: true,
  createdAt: true,
  updatedAt: true
});

/**
 * 目标创建输入类型
 */
export type CreateTarget = z.infer<typeof CreateTargetSchema>;

/**
 * 目标更新输入验证
 */
export const UpdateTargetSchema = TargetSchema.partial().omit({
  id: true,
  relations: true,
  createdAt: true,
  updatedAt: true
});

/**
 * 目标更新输入类型
 */
export type UpdateTarget = z.infer<typeof UpdateTargetSchema>;

/**
 * 目标查询选项
 */
export interface TargetQueryOptions {
  includeRelations?: boolean;
  relationTypes?: RelationType[];
  relationDepth?: number;
  filter?: Record<string, unknown>;
}
