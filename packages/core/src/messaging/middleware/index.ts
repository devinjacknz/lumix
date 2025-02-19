import { MiddlewareFunction, MessagingMiddleware } from '@lumix/types';

export { MiddlewareFunction, MessagingMiddleware };

export class MessagingMiddlewareManager {
  private static instance: MessagingMiddlewareManager;
  private middlewares: MessagingMiddleware[] = [];

  private constructor() {}

  public static getInstance(): MessagingMiddlewareManager {
    if (!MessagingMiddlewareManager.instance) {
      MessagingMiddlewareManager.instance = new MessagingMiddlewareManager();
    }
    return MessagingMiddlewareManager.instance;
  }

  public addMiddleware(middleware: MessagingMiddleware): void {
    this.middlewares.push(middleware);
  }

  public removeMiddleware(name: string): void {
    this.middlewares = this.middlewares.filter(m => m.name !== name);
  }

  public async process(message: any): Promise<any> {
    let result = message;
    for (const middleware of this.middlewares) {
      result = await middleware.execute(result);
    }
    return result;
  }
}

export default MessagingMiddlewareManager; 