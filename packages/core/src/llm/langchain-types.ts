import {
  BaseMessage,
  MessageContent,
  BaseMessageChunk
} from "langchain/schema";
import { BaseChatModel } from "langchain/chat_models/base";

// 扩展 BaseChatModel 类型
export interface ExtendedBaseChatModel extends BaseChatModel {
  call(messages: BaseMessage[]): Promise<BaseMessageChunk>;
}

// 扩展 BaseMessage 类型
export interface ExtendedBaseMessage extends BaseMessage {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

// 消息内容类型
export type ExtendedMessageContent = string | { [key: string]: any } | any;

// 消息类型
export interface ChatMessage {
  role: string;
  content: ExtendedMessageContent;
  metadata?: Record<string, any>;
}

// 使用情况统计
export interface UsageStatistics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latency?: number;
}

// 模型响应
export interface ModelResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>;
}

// 类型转换函数
export function convertToBaseMessage(message: ChatMessage): BaseMessage {
  const content = typeof message.content === 'string' 
    ? message.content 
    : JSON.stringify(message.content);
    
  return {
    content,
    name: undefined,
    additional_kwargs: message.metadata || {},
    example: false,
  } as BaseMessage;
}

export function convertFromBaseMessage(message: BaseMessage): ChatMessage {
  let content: ExtendedMessageContent;
  try {
    content = JSON.parse(message.content as string);
  } catch {
    content = message.content as string;
  }

  return {
    role: message.name as string,
    content,
    metadata: message.additional_kwargs
  };
}

export function convertToModelResponse(message: BaseMessageChunk): ModelResponse {
  return {
    content: message.content as string,
    usage: (message as any).usage,
    metadata: message.additional_kwargs
  };
}

// 类型保护函数
export function isExtendedBaseMessage(message: BaseMessage): message is ExtendedBaseMessage {
  return 'usage' in message;
}

export function isModelResponse(response: any): response is ModelResponse {
  return 'content' in response && typeof response.content === 'string';
}

export function isChatMessage(message: any): message is ChatMessage {
  return (
    'role' in message &&
    'content' in message &&
    (typeof message.content === 'string' || typeof message.content === 'object')
  );
} 