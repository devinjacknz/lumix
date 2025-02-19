import { MessagingMiddleware, MessagingEvent, MessagingPayload } from '@lumix/types';
import { logger } from '../monitoring';

export class MessagingMiddlewareManager implements MessagingMiddleware {
  private eventHandlers: Map<string, ((payload: MessagingPayload) => Promise<void>)[]>;
  public name: string;

  constructor(name: string) {
    this.name = name;
    this.eventHandlers = new Map();
  }

  async execute(message: any): Promise<any> {
    logger.debug('MessagingMiddleware', `Executing middleware ${this.name}`, { message });
    return message;
  }

  async emit(event: string, payload: MessagingPayload): Promise<void> {
    const handlers = this.eventHandlers.get(event) || [];
    await Promise.all(handlers.map(handler => handler(payload)));
  }

  on(event: string, handler: (payload: MessagingPayload) => Promise<void>): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  off(event: string, handler: (payload: MessagingPayload) => Promise<void>): void {
    const handlers = this.eventHandlers.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
      this.eventHandlers.set(event, handlers);
    }
  }
}

export const messagingMiddleware = new MessagingMiddlewareManager('core'); 