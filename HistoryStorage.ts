import {TokenRingService} from "./types.js";

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
export default abstract class HistoryStorage implements TokenRingService {
  name = "HistoryStorage";
  description = "A service for storing CLI history";

  /** Configuration options */
  public config: HistoryConfig;
  /** Current position in history list when navigating */
  protected historyIndex: number = -1;
  /** Current line being edited */
  protected currentLine: string = "";

  // noinspection TypeScriptAbstractClassConstructorCanBeMadeProtected
  /**
   * Creates a new HistoryStorage instance
   */
  constructor(config: HistoryConfig = {}) {
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
   */
  abstract add(command: string): void;

  /**
   * Get the previous command in history
   */
  abstract getPrevious(): string | null;

  /**
   * Get the next command in history
   */
  abstract getNext(): string | null;

  /**
   * Get all commands in history
   */
  abstract getAll(): string[];

  /**
   * Set the current line of input (for saving when navigating history)
   */
  setCurrent(line: string): void {
    this.currentLine = line;
  }

  /**
   * Update configuration settings
   */
  setConfig(config: HistoryConfig): void {
    if (typeof config === "object") {
      this.config = {...this.config, ...config};
    }
  }
}