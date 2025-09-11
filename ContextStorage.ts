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
    this.registry.unregister(id);
  }

  getItemsInOrder(): ContextItem[] {
    const allItems = this.registry.getAllItems();
    return Object.values(allItems).sort((a, b) => (a.createdAt - b.createdAt));
  }
}