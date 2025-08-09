/**
 * @abstract
 */
export default class HumanInterfaceService extends Service {
    /**
     * Asks the user to select an item from a list.
     * @abstract
     * @param {object} options - The options for the selection.
     * @param {string} options.title - The title of the selection prompt.
     * @param {Array<string>} options.items - The items to choose from.
     * @returns {Promise<string>} The selected item.
     * @throws {Error} If the method is not implemented by the subclass.
     */
    askForSelection({ title, items }: {
        title: string;
        items: Array<string>;
    }): Promise<string>;
    /**
     * Asks the user a question and allows them to type in a multi-line answer.
     * @abstract
     * @param {string} question - The question to ask the user.
     * @returns {Promise<string>} The user's answer.
     * @throws {Error} If the method is not implemented by the subclass.
     */
    ask(_question: any): Promise<string>;
    /**
     * Asks the user to select multiple items from a list.
     * @abstract
     * @param {object} options - The options for the selection.
     * @param {string} options.title - The title of the selection prompt.
     * @param {Array<string>} options.items - The items to choose from.
     * @param {string} [options.message] - An optional message to display above the items.
     * @returns {Promise<Array<string>>} A promise that resolves to an array of selected items.
     * @throws {Error} If the method is not implemented by the subclass.
     */
    askForMultipleSelections({ title, items, message }: {
        title: string;
        items: Array<string>;
        message?: string;
    }): Promise<Array<string>>;
    /**
     * @typedef {Object} TreeLeaf
     * @property {string} name
     * @property {string} [value]
     * @property {Array<() => Promise<TreeLeaf>|TreeLeaf>}
     */
    /**
     * Asks the user to select items from a tree structure
     * @param {object} options - The options for the tree selection.
     * @param {string} [options.message] - The message to display to the user.
     * @param {TreeLeaf} options.tree - Tree data structure or function that returns tree data.
     * @param {boolean} [options.multiple=false] - Whether to allow multiple selections.
     * @param {boolean} [options.allowCancel=true] - Whether to allow canceling the selection.
     * @param {string|Array<string>} [options.initialSelection] - Initial selection of items.
     * @param {boolean} [options.loop=false] - Whether to loop through choices when reaching the end.
     * @returns {Promise<string|Array<string>>} The selected item(s).
     */
    askForTreeSelection(_options: any): Promise<string | Array<string>>;
    /**
     * Asks the user to select an item from a tree structure using a REPL interface.
     * @param {import('@token-ring/filesystem').FileSystemService} fileSystem - The filesystem interface to use for the selection
     * @param {object} [options] - Optional configuration for the file selection
     * @param {string|Array<string>} [options.initialSelection] - Initial selection of files/directories (by path)
     * @returns {Promise<string|Array<string>>} The selected item(s).
     */
    askForFileSelection(fileSystem: import("@token-ring/filesystem").FileSystemService, options?: {
        initialSelection?: string | Array<string>;
    }): Promise<string | Array<string>>;
}
import { Service } from "@token-ring/registry";
