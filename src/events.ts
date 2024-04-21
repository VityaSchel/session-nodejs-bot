import { SignalService } from "../session-messenger/ts/protobuf";
import { ConversationModel } from "../session-messenger/ts/models/conversation";

type EventCallback<T extends (...args: any[]) => any> = T;

type Events = {
  message: (content: SignalService.Content, options: {
    conversation: {
      type: 'group' | 'private'
      id: string
      raw: ConversationModel
    }
    timestamp: number
    id: string
  }) => any
}

class EventEmitter<E extends Record<string, (...args: any[]) => any> = Events> {
  private static instances: EventEmitter<any>[] = [];

  private events: Record<keyof E, EventCallback<E[keyof E]>[]> = {} as Record<
    keyof E,
    EventCallback<E[keyof E]>[]
  >;

  constructor() {
    EventEmitter.instances.push(this);
  }

  on<K extends keyof E>(eventName: K, callback: EventCallback<E[K]>): void {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(callback);
  }

  emit<K extends keyof E>(eventName: string, ...args: Parameters<E[K]>): ReturnType<E[K]>[] {
    const callbacks = this.events[eventName];
    const results: ReturnType<E[K]>[] = [];
    if (callbacks) {
      callbacks.forEach((callback) => results.push(callback(...args)));
    }
    return results;
  }

  off<K extends keyof E>(eventName: K, callback: EventCallback<E[K]>): void {
    const callbacks = this.events[eventName];
    if (callbacks) {
      this.events[eventName] = callbacks.filter((cb) => cb !== callback);
    }
  }

  static emitToAllInstances<K extends keyof Events>(eventName: K, ...args: Parameters<Events[K]>): void {
    EventEmitter.instances.forEach((instance) => {
      instance.emit(eventName, ...args);
    });
  }

}

export { EventEmitter }