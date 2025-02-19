export interface MessagingMiddleware {
  name: string;
  execute: MiddlewareFunction;
}

export interface MiddlewareFunction {
  (message: any): Promise<any>;
}
