import {ChatInputMessage} from "@tokenring-ai/ai-client/client/AIChatClient";
import KeyedRegistry from "@tokenring-ai/utility/KeyedRegistry";

export type ContextItem = {
  id: string,
  compactable: boolean,
  content: ChatInputMessage[],
  createdAt: number,
  onDelete?: () => void,
}

export default class ContextStorage {
  private registry = new KeyedRegistry<ContextItem>();

  addItem(item: ContextItem) {
    this.registry.register(item.id, item);
  }

  getItem(id: string) {
    return this.registry.getItemByName(id);
  }

  removeItem(id: string) {
    const item = this.getItem(id);
    if (item && item.onDelete) item.onDelete();
    this.registry.unregister(id);
  }

  getItemsInOrder(): ContextItem[] {
    const allItems = this.registry.getAllItems();
    return Object.values(allItems).sort((a, b) => (a.createdAt - b.createdAt));
  }

  // For persistence
  toJSON(): ContextItem[] {
    return this.getItemsInOrder();
  }

  fromJSON(items: ContextItem[]): void {
    items.forEach(item => this.addItem(item));
  }
}