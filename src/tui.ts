/* eslint-disable @typescript-eslint/no-explicit-any */
import { ollama } from './utils/ollama';
import { updateElo, saveSession } from './utils/storage';
import { Session, ArenaResult, PROMPT_LIBRARY, ModelElo } from './types';

const blessed = require('blessed');

interface ModelInstance {
  name: string;
  result?: ArenaResult;
  streaming: boolean;
  fullResponse: string;
}

export class LLMArenaTUI {
  private screen: any;
  private models: string[] = [];
  private selectedModels: string[] = [];
  private modelInstances: Map<string, ModelInstance> = new Map();
  private prompt: string = '';
  private blindMode: boolean = false;
  private hasVoted: boolean = false;
  private promptIndex: number = 0;
  private categoryPrompts = PROMPT_LIBRARY;
  private sidebar: any;
  private header: any;
  private promptBox: any;
  private modelBoxes: Map<string, any> = new Map();
  private input: any;
  private statusBar: any;
  private currentView: 'setup' | 'arena' | 'results' = 'setup';

  constructor() {
    this.init();
  }

  private init(): void {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Local LLM Arena',
    });

    // Create header
    this.header = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      style: {
        fg: 'cyan',
        bold: true,
      },
      content: '{center}{bold}{cyan-fg}Local LLM Arena{/cyan-fg}{/bold} - Compare local models side-by-side{/center}',
    });

    // Create sidebar (model list)
    this.sidebar = blessed.box({
      parent: this.screen,
      top: 3,
      left: 0,
      width: '25%',
      height: '100%-6',
      border: { type: 'line', fg: 'cyan' },
      style: {
        fg: 'white',
        border: { fg: 'cyan' },
      },
      content: '{bold}Models{/bold}\n\nLoading...',
    });

    // Create main content area
    this.promptBox = blessed.box({
      parent: this.screen,
      top: 3,
      left: '25%',
      width: '75%',
      height: 10,
      border: { type: 'line', fg: 'cyan' },
      style: {
        fg: 'white',
        border: { fg: 'cyan' },
      },
      content: '{bold}Prompt{/bold}\n\nEnter a prompt to start\n\nClick models on left to select\nPress Enter to run arena',
    });

    // Create input box
    this.input = blessed.textbox({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line', fg: 'cyan' },
      style: {
        fg: 'white',
        border: { fg: 'cyan' },
        focus: { border: { fg: 'green' } },
      },
      placeholder: 'Type your prompt here...',
    });

    // Create status bar
    this.statusBar = blessed.box({
      parent: this.screen,
      bottom: 3,
      left: 0,
      width: '100%',
      height: 1,
      style: {
        fg: 'white',
        bg: 'blue',
      },
      content: '{center}[Click] Select | [Enter] Run | [A/B/C] Vote | [N] Next | [R] Regen | [B] Blind | [Q] Quit{/center}',
    });

    this.setupEventListeners();
    this.start();
  }

  private async start(): Promise<void> {
    // Check Ollama connection
    const connected = await ollama.checkConnection();
    if (!connected) {
      this.sidebar.setContent('{bold}Error: Cannot connect to Ollama{/bold}\n\nMake sure Ollama is running:\n  ollama serve');
      this.screen.render();
      return;
    }

    // Load models
    try {
      const availableModels = await ollama.listModels();
      this.models = availableModels.map(m => m.name);
      this.updateSidebar();
    } catch (error) {
      this.sidebar.setContent('{bold}Error loading models{/bold}');
    }

    // Focus input
    this.input.focus();
    this.screen.render();
  }

  private setupEventListeners(): void {
    // Quit on Escape or Ctrl+C
    this.screen.key(['escape', 'q', 'C-c'], () => {
      process.exit(0);
    });

    // Input handling
    this.input.key('enter', () => {
      const value = this.input.getValue().trim();
      if (value) {
        this.prompt = value;
        this.runArena();
      }
    });

    // Keyboard shortcuts
    this.screen.key(['a', 'b', 'c', 'd', 'e', 'f'], (ch: string) => {
      if ((this.currentView === 'arena' || this.currentView === 'results') && !this.hasVoted) {
        this.voteForModel(ch.toUpperCase());
      }
    });

    this.screen.key(['t'], () => {
      if ((this.currentView === 'arena' || this.currentView === 'results') && !this.hasVoted) {
        this.recordTie();
      }
    });

    this.screen.key(['n'], () => {
      if (this.hasVoted) {
        this.nextPrompt();
      }
    });

    this.screen.key(['r'], () => {
      if (this.prompt) {
        this.runArena();
      }
    });

    this.screen.key(['b'], () => {
      this.toggleBlindMode();
    });

    // Click on sidebar to select models
    this.sidebar.on('click', (data: { y: number }) => {
      const line = Math.floor(data.y) - 2;
      if (line >= 0 && line < this.models.length) {
        this.toggleModel(this.models[line]);
      }
    });

    // Resize handler
    this.screen.on('resize', () => {
      this.screen.render();
    });
  }

  private updateSidebar(): void {
    let content = '{bold}Available Models{/bold}\n\n';
    
    for (const model of this.models) {
      const selected = this.selectedModels.includes(model);
      const label = selected ? '[x] ' : '[ ] ';
      const color = selected ? 'green' : 'white';
      const shortName = model.length > 28 ? model.substring(0, 25) + '...' : model;
      content += `{${color}-fg}${label}${shortName}{/}${color}-fg\n`;
    }

    content += '\n{bold}Selected:{/bold} ' + this.selectedModels.length + '/6\n';
    content += '\n{dim}Click to toggle selection{/dim}';
    
    this.sidebar.setContent(content);
  }

  private toggleModel(model: string): void {
    const index = this.selectedModels.indexOf(model);
    if (index === -1) {
      if (this.selectedModels.length < 6) {
        this.selectedModels.push(model);
      }
    } else {
      this.selectedModels.splice(index, 1);
    }
    this.updateSidebar();
    this.screen.render();
  }

  private toggleBlindMode(): void {
    this.blindMode = !this.blindMode;
    this.updateStatusBar();
    this.screen.render();
  }

  private updateStatusBar(): void {
    const mode = this.blindMode ? 'BLIND ON' : 'BLIND OFF';
    const voteStatus = this.hasVoted ? 'VOTED' : 'VOTE NOW';
    const content = `{center}[Click] Select | [Enter] Run | [A/B/C] Vote | [N] Next | [R] Regen | [B] ${mode} | [Q] Quit | ${voteStatus}{/center}`;
    this.statusBar.setContent(content);
  }

  private async runArena(): Promise<void> {
    if (this.selectedModels.length < 2) {
      this.promptBox.setContent('{bold}Error{/bold}\n\nPlease select at least 2 models\nClick on models in the left panel');
      this.screen.render();
      return;
    }

    this.currentView = 'arena';
    this.hasVoted = false;
    this.modelInstances.clear();

    // Update header
    const modeLabel = this.blindMode ? 'BLIND MODE' : 'REVEALED';
    this.header.setContent(`{center}{bold}{cyan-fg}Local LLM Arena{/cyan-fg}{/bold} - ${this.selectedModels.length} models | ${modeLabel}{/center}`);

    // Update prompt box
    this.promptBox.setContent(`{bold}Prompt{/bold}\n\n${this.prompt}`);

    // Initialize model instances
    for (const model of this.selectedModels) {
      this.modelInstances.set(model, {
        name: model,
        streaming: true,
        fullResponse: '',
      });
    }

    // Create response boxes
    this.createResponseBoxes();

    // Run models in parallel
    await Promise.all(
      this.selectedModels.map(model => this.generateResponse(model))
    );

    this.currentView = 'results';
    this.updateStatusBar();
    this.screen.render();
  }

  private createResponseBoxes(): void {
    // Remove old boxes
    this.modelBoxes.forEach(box => box.detach());
    this.modelBoxes.clear();

    const count = this.selectedModels.length;
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    
    // Calculate positions based on model count
    let top = 13;
    const height = Math.floor((100 - 13 - 4) / count) - 1;

    for (let i = 0; i < this.selectedModels.length; i++) {
      const model = this.selectedModels[i];
      const label = labels[i];
      
      const box = blessed.box({
        parent: this.screen,
        top: top,
        left: '25%',
        width: '75%',
        height: height,
        border: { type: 'line', fg: 'cyan' },
        style: {
          fg: 'white',
          border: { fg: 'cyan' },
        },
        scrollable: true,
        alwaysScroll: true,
        content: `{bold}[${label}] ${this.blindMode ? 'Model' : model}{/bold}\n\nLoading...`,
      });

      this.modelBoxes.set(model, box);
      top += height + 1;
    }
  }

  private async generateResponse(model: string): Promise<void> {
    const instance = this.modelInstances.get(model)!;
    const box = this.modelBoxes.get(model)!;
    const index = this.selectedModels.indexOf(model);
    const label = ['A', 'B', 'C', 'D', 'E', 'F'][index];
    const displayName = this.blindMode ? 'Model' : model;

    try {
      const result = await ollama.generateResponse(model, this.prompt, (chunk) => {
        instance.fullResponse += chunk;
        const truncated = instance.fullResponse.length > 3000 
          ? instance.fullResponse.substring(0, 3000) + '...' 
          : instance.fullResponse;
        box.setContent(`{bold}[${label}] ${displayName}{/bold}\n\n${truncated}`);
        this.screen.render();
      });

      instance.result = result;
      instance.streaming = false;
      
      const stats = `⏱ ${result.totalTime}s | 🎯 ${result.tokensPerSecond} tok/s`;
      box.setContent(`{bold}[${label}] ${displayName}{/bold} ${stats}\n\n${instance.fullResponse}`);
      box.border = { type: 'line', fg: 'green' };
      
    } catch (error) {
      box.setContent(`{bold}[${label}] ${displayName}{/bold}\n\n{red}Error: ${error}{/red}`);
      box.border = { type: 'line', fg: 'red' };
    }

    this.screen.render();
  }

  private voteForModel(label: string): void {
    const index = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(label);
    if (index >= 0 && index < this.selectedModels.length) {
      const winner = this.selectedModels[index];
      this.hasVoted = true;

      // Highlight winner box
      const winnerBox = this.modelBoxes.get(winner)!;
      winnerBox.border = { type: 'line', fg: 'yellow' };
      winnerBox.setContent(winnerBox.content + '\n\n{yellow}★ WINNER ★{/yellow}');

      // Update Elo if 2 models
      if (this.selectedModels.length === 2) {
        const loser = this.selectedModels.find(m => m !== winner)!;
        updateElo(winner, loser, false);
      }

      // Save session
      this.saveCurrentSession(winner);

      this.updateStatusBar();
      this.screen.render();
    }
  }

  private recordTie(): void {
    if (this.selectedModels.length === 2) {
      updateElo(this.selectedModels[0], this.selectedModels[1], true);
    }
    this.hasVoted = true;
    this.saveCurrentSession('tie');
    this.updateStatusBar();
    this.screen.render();
  }

  private saveCurrentSession(winner: string): void {
    const results: ArenaResult[] = [];
    
    for (const model of this.selectedModels) {
      const instance = this.modelInstances.get(model);
      if (instance?.result) {
        results.push(instance.result);
      }
    }

    const session: Session = {
      id: Date.now().toString(36),
      prompt: this.prompt,
      results,
      votes: [{
        prompt: this.prompt,
        winnerId: winner,
        isTie: winner === 'tie',
        timestamp: Date.now(),
      }],
      timestamp: Date.now(),
    };

    saveSession(session);
  }

  private nextPrompt(): void {
    this.promptIndex++;
    if (this.promptIndex >= this.categoryPrompts.length) {
      this.promptIndex = 0;
    }
    this.prompt = this.categoryPrompts[this.promptIndex].text;
    this.promptBox.setContent(`{bold}Prompt (${this.categoryPrompts[this.promptIndex].name}){/bold}\n\n${this.prompt}`);
    this.input.setValue('');
    this.currentView = 'setup';
    this.hasVoted = false;
    
    // Clear model boxes
    this.modelBoxes.forEach(box => box.detach());
    this.modelBoxes.clear();
    
    this.updateStatusBar();
    this.screen.render();
  }
}

// Start the TUI if this is the main module
new LLMArenaTUI();
