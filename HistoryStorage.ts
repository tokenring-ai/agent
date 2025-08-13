import {Service} from "@token-ring/registry";

/**
 * Configuration options for HistoryStorage
 */
export interface HistoryConfig {
  /** Maximum number of history entries to store */
  limit?: number;
  /** Commands to exclude from history */
  blacklist?: string[];
}

/**
 * Abstract base class for command line history storage implementations.
 * 
 * This class defines the interface for history storage providers, which can be
 * used by the command prompt to maintain command history across sessions.
 * 
 * Implementations must provide storage-specific logic for initialization,
 * adding commands, retrieving previous/next commands, and listing all commands.
 */
export default abstract class HistoryStorage extends Service {
  /** Current position in history list when navigating */
  protected historyIndex: number = -1;
  
  /** Current line being edited */
  protected currentLine: string = "";
  
  /** Configuration options */
  public config: HistoryConfig;

  /**
   * Creates a new HistoryStorage instance
   * @param config - Configuration options
   */
  protected constructor(config: HistoryConfig = {}) {
    super();
    this.config = {
      limit: 100,
      blacklist: [],
      ...config, // User-provided config overrides defaults
    };
  }

  /**
   * Initialize the history storage
   * This method should handle any setup needed before using the history
   */
  abstract init(): void;

  /**
   * Add a command to history
   * @param command - The command to add
   */
  abstract add(command: string): void;

  /**
   * Get the previous command in history
   * @returns The previous command or null if at beginning
   */
  abstract getPrevious(): string | null;

  /**
   * Get the next command in history
   * @returns The next command or null if at end
   */
  abstract getNext(): string | null;

  /**
   * Get all commands in history
   * @returns Array of all commands in history
   */
  abstract getAll(): string[];

  /**
   * Set the current line of input (for saving when navigating history)
   * @param line - The current line of input
   */
  setCurrent(line: string): void {
    this.currentLine = line;
  }

  /**
   * Update configuration settings
   * @param config - New configuration options
   */
  setConfig(config: HistoryConfig): void {
    if (typeof config === "object") {
      this.config = { ...this.config, ...config };
    }
  }
}