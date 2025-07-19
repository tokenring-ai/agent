import { Service } from "@token-ring/registry";

/**
 * @abstract
 */
export default class HumanInterfaceService extends Service {
	/**
	 * The name of the service
	 * @type {string}
	 */
	name = "HumanInterfaceService";

	/**
	 * Description of the service's functionality
	 * @type {string}
	 */
	description =
		"Provides a way to ask the user for a selection from a list of items.";

	/**
	 * Asks the user to select an item from a list.
	 * @abstract
	 * @param {object} options - The options for the selection.
	 * @param {string} options.title - The title of the selection prompt.
	 * @param {Array<string>} options.items - The items to choose from.
	 * @returns {Promise<string>} The selected item.
	 * @throws {Error} If the method is not implemented by the subclass.
	 */
	async askForSelection({ title, items }) {
		throw new Error(
			'Method "askForSelection()" must be implemented by subclass.',
		);
	}

	/**
	 * Asks the user a question and allows them to type in a multi-line answer.
	 * @abstract
	 * @param {string} question - The question to ask the user.
	 * @returns {Promise<string>} The user's answer.
	 * @throws {Error} If the method is not implemented by the subclass.
	 */
	async ask(question) {
		throw new Error('Method "ask()" must be implemented by subclass.');
	}

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
	async askForMultipleSelections({ title, items, message }) {
		throw new Error(
			'Method "askForMultipleSelections()" must be implemented by subclass.',
		);
	}

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
	async askForTreeSelection(options) {
		throw new Error(
			'Method "askForTreeSelection()" must be implemented by subclass.',
		);
	}

	/**
	 * Asks the user to select an item from a tree structure using a REPL interface.
	 * @param {import('@token-ring/filesystem').FileSystemService} fileSystem - The filesystem interface to use for the selection
	 * @param {object} [options] - Optional configuration for the file selection
	 * @param {string|Array<string>} [options.initialSelection] - Initial selection of files/directories (by path)
	 * @returns {Promise<string|Array<string>>} The selected item(s).
	 */

	async askForFileSelection(fileSystem, options = {}) {
		const buildTree = async (path = "") => {
			const children = [];

			try {
				for await (const itemPath of fileSystem.getDirectoryTree(path, {
					recursive: false,
				})) {
					if (itemPath.endsWith("/")) {
						// Directory
						const dirName = itemPath
							.substring(0, itemPath.length - 1)
							.split("/")
							.pop();
						children.push({
							name: dirName,
							value: itemPath,
							hasChildren: true,
							children: () => buildTree(itemPath),
						});
					} else {
						// File
						const fileName = itemPath.split("/").pop();
						children.push({
							name: fileName,
							value: itemPath,
						});
					}
				}
			} catch (error) {
				console.error(`Error reading directory ${path}:`, error);
			}

			return children;
		};

		const { initialSelection } = options;

		return await this.askForTreeSelection({
			message: "Select a file or directory:",
			tree: {
				name: "File Selection",
				children: buildTree,
			},
			multiple: true,
			allowCancel: true,
			loop: false,
			...(initialSelection && { initialSelection }),
		});
	}
}
