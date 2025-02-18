import { Message } from '../types';

export interface MiddlewareFunction {
  (message: Message): Promise<Message>;
}

export class MessagingMiddleware {
  private static instance: MessagingMiddleware;
  private middlewares: MiddlewareFunction[] = [];

  private constructor() {}

  static getInstance(config?: any): MessagingMiddleware {
    if (!MessagingMiddleware.instance) {
      MessagingMiddleware.instance = new MessagingMiddleware();
    }
    return MessagingMiddleware.instance;
  }

  addMiddleware(middleware: MiddlewareFunction): void {
    this.middlewares.push(middleware);
  }

  async process(message: Message): Promise<Message> {
    let processedMessage = { ...message };
    
    for (const middleware of this.middlewares) {
      processedMessage = await middleware(processedMessage);
    }

    return processedMessage;
  }
}

export default MessagingMiddleware; 