export interface Event {
  id: string;
  type: string;
  timestamp: number;
  data: any;
}

export interface EventEmitter {
  emit(event: Event): void;
  on(type: string, handler: (event: Event) => void): void;
  off(type: string, handler: (event: Event) => void): void;
}
