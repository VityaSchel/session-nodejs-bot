import { SignalService } from "../ts/protobuf";

type EventCallback = (...args: any[]) => void;

type Events = {
  message: (content: SignalService.Content) => any
}

class EventEmitter {
  private static instances: EventEmitter[] = [];

  private events: Record<string, EventCallback[]> = {};

  constructor() {
    EventEmitter.instances.push(this);
  }

  on(eventName: string, callback: EventCallback): void {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(callback);
  }

  emit(eventName: string, ...args: any[]): void {
    const callbacks = this.events[eventName];
    if (callbacks) {
      callbacks.forEach((callback) => callback(...args));
    }
  }

  off(eventName: string, callback: EventCallback): void {
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