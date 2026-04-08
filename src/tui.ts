/* eslint-disable @typescript-eslint/no-explicit-any */
const blessed = require('blessed');

interface ModelInstance {
  name: string;
  result?: any;
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
  private categoryPrompts: any[] = [];
  private sidebar: any;
  private header: any;
  private promptBox: any;
  private modelBoxes: Map<string, any> = new Map();
  private input: any;
  private statusBar: any;
  private bottomBar: any;
  private currentView: 'setup' | 'arena' | 'results' = 'setup';
  private mainBox: any;

  constructor() {
    this.init();
  }

  private init(): void {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Local LLM Arena',
      forceUnicode: true,
    });

    const { screen } = this;
    const fullWidth = screen.width || 120;
    const sidebarWidth = 35;
    const mainWidth = fullWidth - sidebarWidth - 1;

    // Header
    this.header = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      style: {
        fg: 'cyan',
        bg: 'black',
        bold: true,
      },
      content: '',
      tags: true,
    });

    // Sidebar
    this.sidebar = blessed.box({
      parent: screen,
      top: 3,
      left: 0,
      width: sidebarWidth,
      height: '100%-6',
      border: {
        type: 'line',
        fg: 'magenta',
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'magenta', bold: true },
      },
      content: '',
      tags: true,
    });

    // Main content area (prompt + responses)
    this.mainBox = blessed.box({
      parent: screen,
      top: 3,
      left: sidebarWidth + 1,
      width: mainWidth,
      height: '100%-6',
      style: {
        fg: 'white',
        bg: 'black',
      },
      content: '',
      tags: true,
    });

    // Prompt box (inside mainBox)
    this.promptBox = blessed.box({
      parent: this.mainBox,
      top: 0,
      left: 0,
      width: '100%',
      height: 8,
      border: {
        type: 'line',
        fg: 'green',
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'green' },
      },
      content: '',
      tags: true,
    });

    // Input box
    this.input = blessed.textarea({
      parent: screen,
      bottom: 4,
      left: 0,
      width: '100%',
      height: 4,
      border: {
        type: 'line',
        fg: 'blue',
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'blue' },
        focus: { fg: 'green', border: { fg: 'green' } },
      },
      placeholder: 'Type your prompt here...',
    });

    // Status bar
    this.statusBar = blessed.box({
      parent: screen,
      bottom: 2,
      left: 0,
      width: '100%',
      height: 1,
      style: {
        fg: 'white',
        bg: 'blue',
      },
      content: '',
      tags: true,
    });

    // Bottom info bar
    this.bottomBar = blessed.box({
      parent: screen,
      bottom: 1,
      left: 0,
      width: '100%',
      height: 1,
      style: {
        fg: 'white',
        bg: 'black',
      },
      content: '',
      tags: true,
    });

    this.setupEventListeners();
    this.start();
  }

  private async start(): Promise<void> {
    const ollama = require('./utils/ollama').ollama;

    // Check Ollama connection
    this.updateHeader('Connecting to Ollama...');
    this.screen.render();

    const connected = await ollama.checkConnection();
    if (!connected) {
      this.sidebar.setContent('{red-fg}Error: Cannot connect{/red-fg}\n\nMake sure Ollama is running:\n\n  {green-fg}ollama serve{/green-fg}\n\nThen restart.');
      this.screen.render();
      return;
    }

    // Load models
    try {
      const availableModels = await ollama.listModels();
      this.models = availableModels.map((m: any) => m.name);
      
      // Auto-select first 2 models
      if (this.models.length >= 2) {
        this.selectedModels = [this.models[0], this.models[1]];
      }

      this.updateHeader(`Local LLM Arena | ${this.models.length} models loaded`);
      this.updateSidebar();
    } catch (error) {
      this.sidebar.setContent('{red-fg}Error loading models{/red-fg}');
    }

    this.updatePromptBox();
    this.updateStatusBar();
    this.input.focus();
    this.screen.render();
  }

  private setupEventListeners(): void {
    const { screen, input } = this;

    // Quit on Escape or Ctrl+C
    screen.key(['escape', 'q', 'C-c'], () => {
      process.exit(0);
    });

    // Input handling
    input.key('enter', () => {
      const value = input.getValue().trim();
      if (value) {
        this.prompt = value;
        this.runArena();
      }
    });

    // Tab to cycle through models
    input.key('tab', () => {
      if (this.models.length >= 2) {
        if (this.selectedModels.length === 0) {
          this.selectedModels = [this.models[0]];
        } else if (this.selectedModels.length === 1) {
          const idx = this.models.indexOf(this.selectedModels[0]);
          const nextIdx = (idx + 1) % this.models.length;
          this.selectedModels = [this.selectedModels[0], this.models[nextIdx]];
        } else {
          // Add next model
          const lastSelected = this.selectedModels[this.selectedModels.length - 1];
          const idx = this.models.indexOf(lastSelected);
          const nextIdx = (idx + 1) % this.models.length;
          if (!this.selectedModels.includes(this.models[nextIdx]) && this.selectedModels.length < 6) {
            this.selectedModels.push(this.models[nextIdx]);
          } else {
            this.selectedModels = [this.models[nextIdx]];
          }
        }
        this.updateSidebar();
        this.updateStatusBar();
        this.screen.render();
      }
    });

    // Keyboard shortcuts for voting
    screen.key(['a', 'A', 'b', 'B', 'c', 'C', 'd', 'D', 'e', 'E', 'f', 'F'], (ch: string) => {
      if ((this.currentView === 'arena' || this.currentView === 'results') && !this.hasVoted) {
        this.voteForModel(ch.toUpperCase());
      }
    });

    screen.key(['t', 'T'], () => {
      if ((this.currentView === 'arena' || this.currentView === 'results') && !this.hasVoted) {
        this.recordTie();
      }
    });

    screen.key(['n', 'N'], () => {
      if (this.hasVoted) {
        this.nextPrompt();
      }
    });

    screen.key(['r', 'R'], () => {
      if (this.prompt && (this.currentView === 'arena' || this.currentView === 'results')) {
        this.runArena();
      }
    });

    screen.key(['b', 'B'], () => {
      this.toggleBlindMode();
    });

    // Click on sidebar to select models
    this.sidebar.on('click', (data: any) => {
      const line = Math.floor(data.y) - 1;
      if (line >= 0 && line < this.models.length) {
        this.toggleModel(this.models[line]);
      }
    });

    // Resize handler
    screen.on('resize', () => {
      this.screen.render();
    });
  }

  private updateHeader(content: string): void {
    this.header.setContent(`{center}{bold}{cyan-fg}▓▒░ Local LLM Arena ░▒▓{/cyan-fg}{/bold}{/center}\n{center}${content}{/center}`);
  }

  private updateSidebar(): void {
    let content = `{bold}{magenta-fg}┌─ Models ─────────────────────────────────┐{/magenta-fg}{/bold}\n`;
    content += `│                                              │\n`;
    
    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      const selected = this.selectedModels.includes(model);
      const check = selected ? '{green-fg}◉{/green-fg}' : '○';
      const shortName = model.substring(0, 28).padEnd(28);
      const label = `${check} ${shortName}`;
      content += `│ {white-fg}${label}{/white-fg} │\n`;
    }
    
    content += `│                                              │\n`;
    content += `│ {bold}Selected:{/bold} {yellow-fg}${this.selectedModels.length}{/yellow-fg}/6                       │\n`;
    content += `{magenta-fg}└──────────────────────────────────────────────────┘{/magenta-fg}`;
    
    this.sidebar.setContent(content);
  }

  private updatePromptBox(): void {
    let content = `{bold}{green-fg}┌─ Prompt ─────────────────────────────────┐{/green-fg}{/bold}\n`;
    content += `│                                              │\n`;
    
    if (this.prompt) {
      const lines = this.wrapText(this.prompt, 44);
      for (const line of lines.slice(0, 3)) {
        content += `│ {white-fg}${line.padEnd(44)}{/white-fg} │\n`;
      }
    } else {
      content += `│ {dim-fg}Enter a prompt below to start{/dim-fg}           │\n`;
      content += `│ {dim-fg}Press Tab to cycle models{/dim-fg}                │\n`;
    }
    
    content += `│                                              │\n`;
    content += `{green-fg}└──────────────────────────────────────────────────┘{/green-fg}`;
    
    this.promptBox.setContent(content);
  }

  private updateStatusBar(): void {
    const mode = this.blindMode ? '{red-fg}BLIND{/red-fg}' : '{blue-fg}REVEAL{/blue-fg}';
    const vote = this.hasVoted ? '{yellow-fg}VOTED{/yellow-fg}' : '{green-fg}VOTE{/green-fg}';
    const models = `{cyan-fg}${this.selectedModels.length}{/cyan-fg} models`;
    const content = `{center}[{yellow-fg}A-F{/yellow-fg}] Vote | [T] Tie | [N] Next | [R] Regen | [B] ${mode} | [Tab] Models | [Q] Quit | ${models} | ${vote}{/center}`;
    this.statusBar.setContent(content);
  }

  private updateBottomBar(): void {
    const { promptIndex, categoryPrompts } = this;
    if (categoryPrompts.length > 0) {
      const prompt = categoryPrompts[promptIndex];
      this.bottomBar.setContent(`{center}{dim-fg}Prompt ${promptIndex + 1}/${categoryPrompts.length}: ${prompt.category} - ${prompt.name}{/dim-fg}{/center}`);
    }
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
    this.updateStatusBar();
    this.screen.render();
  }

  private toggleBlindMode(): void {
    this.blindMode = !this.blindMode;
    this.updateStatusBar();
    if (this.modelBoxes.size > 0) {
      this.updateResponseBoxes();
    }
    this.screen.render();
  }

  private async runArena(): Promise<void> {
    if (this.selectedModels.length < 2) {
      this.promptBox.setContent(`{red-fg}Select at least 2 models!{/red-fg}\n\nClick on models in the sidebar\nor press Tab to cycle.`);
      this.screen.render();
      return;
    }

    this.currentView = 'arena';
    this.hasVoted = false;
    this.modelInstances.clear();

    // Load category prompts
    const { PROMPT_LIBRARY } = require('./types');
    this.categoryPrompts = PROMPT_LIBRARY;
    this.promptIndex = 0;

    this.updateHeader(`Local LLM Arena | ${this.selectedModels.length} models | ${this.blindMode ? 'BLIND' : 'REVEALED'}`);
    this.updatePromptBox();
    this.updateStatusBar();
    this.updateBottomBar();

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
    this.hasVoted = true;
    this.updateStatusBar();
    this.screen.render();
  }

  private createResponseBoxes(): void {
    // Remove old boxes
    this.modelBoxes.forEach(box => box.detach());
    this.modelBoxes.clear();

    const count = this.selectedModels.length;
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    const boxHeight = Math.floor((90) / count);

    for (let i = 0; i < this.selectedModels.length; i++) {
      const model = this.selectedModels[i];
      const label = labels[i];
      
      const box = blessed.box({
        parent: this.mainBox,
        top: 8 + i * (boxHeight + 1),
        left: 0,
        width: '100%',
        height: boxHeight,
        border: {
          type: 'line',
          fg: 'cyan',
        },
        style: {
          fg: 'white',
          bg: 'black',
          border: { fg: 'cyan' },
        },
        scrollable: true,
        alwaysScroll: true,
        content: '',
        tags: true,
      });

      box.setContent(`{bold}{cyan-fg}[${label}] ${this.blindMode ? 'Model' : model}{/cyan-fg}{/bold}\n\n{cyan-fg}Generating response...{/cyan-fg}`);

      this.modelBoxes.set(model, box);
    }
  }

  private updateResponseBoxes(): void {
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    let i = 0;
    for (const model of this.selectedModels) {
      const box = this.modelBoxes.get(model);
      const label = labels[i];
      const instance = this.modelInstances.get(model);
      
      if (box && instance) {
        const header = `{bold}{cyan-fg}[${label}] ${this.blindMode ? 'Model' : model}{/cyan-fg}{/bold}`;
        const stats = instance.result ? `{dim-fg}⏱ ${instance.result.totalTime}s | 🎯 ${instance.result.tokensPerSecond} tok/s{/dim-fg}` : '';
        box.setContent(`${header} ${stats}\n\n${instance.fullResponse || '{cyan-fg}Generating...{/cyan-fg}'}`);
      }
      i++;
    }
  }

  private async generateResponse(model: string): Promise<void> {
    const ollama = require('./utils/ollama').ollama;
    const instance = this.modelInstances.get(model)!;
    const box = this.modelBoxes.get(model)!;
    const index = this.selectedModels.indexOf(model);
    const label = ['A', 'B', 'C', 'D', 'E', 'F'][index];
    const displayName = this.blindMode ? 'Model' : model;

    try {
      const result = await ollama.generateResponse(model, this.prompt, (chunk: string) => {
        instance.fullResponse += chunk;
        const truncated = instance.fullResponse.length > 5000 
          ? instance.fullResponse.substring(0, 5000) + '\n\n{dim-fg}[truncated]{/dim-fg}' 
          : instance.fullResponse;
        box.setContent(`{bold}{cyan-fg}[${label}] ${displayName}{/cyan-fg}{/bold}\n\n${truncated}`);
        this.screen.render();
      });

      instance.result = result;
      instance.streaming = false;
      
      box.border = { type: 'line', fg: 'green' };
      const truncated = instance.fullResponse.length > 5000 
        ? instance.fullResponse.substring(0, 5000) + '\n\n{dim-fg}[truncated]{/dim-fg}' 
        : instance.fullResponse;
      box.setContent(`{bold}{cyan-fg}[${label}] ${displayName}{/cyan-fg}{/bold} {yellow-fg}✓{/yellow-fg}\n{dim-fg}⏱ ${result.totalTime}s | 🎯 ${result.tokensPerSecond} tok/s{/dim-fg}\n\n${truncated}`);
      
    } catch (error: any) {
      box.border = { type: 'line', fg: 'red' };
      box.setContent(`{bold}{cyan-fg}[${label}] ${displayName}{/cyan-fg}{/bold}\n\n{red-fg}Error: ${error.message}{/red-fg}`);
    }

    this.screen.render();
  }

  private voteForModel(label: string): void {
    const index = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(label);
    if (index >= 0 && index < this.selectedModels.length) {
      const winner = this.selectedModels[index];
      this.hasVoted = true;

      // Highlight winner
      const winnerBox = this.modelBoxes.get(winner)!;
      winnerBox.border = { type: 'line', fg: 'yellow' };
      winnerBox.setContent(winnerBox.content + `\n\n{yellow-fg}{bold}★ VOTED ★{/bold}{/yellow-fg}`);

      // Dim losers
      for (const model of this.selectedModels) {
        if (model !== winner) {
          const box = this.modelBoxes.get(model)!;
          box.style.fg = 'gray';
          box.setContent(box.content);
        }
      }

      // Update Elo if 2 models
      if (this.selectedModels.length === 2) {
        const ollama = require('./utils/storage');
        const loser = this.selectedModels.find(m => m !== winner)!;
        ollama.updateElo(winner, loser, false);
      }

      // Save session
      this.saveCurrentSession(winner);

      this.updateStatusBar();
      this.screen.render();
    }
  }

  private recordTie(): void {
    if (this.selectedModels.length === 2) {
      const ollama = require('./utils/storage');
      ollama.updateElo(this.selectedModels[0], this.selectedModels[1], true);
    }
    this.hasVoted = true;
    this.saveCurrentSession('tie');
    this.updateStatusBar();
    this.screen.render();
  }

  private saveCurrentSession(winner: string): void {
    const storage = require('./utils/storage');
    const { Session } = require('./types');
    
    const results: any[] = [];
    for (const model of this.selectedModels) {
      const instance = this.modelInstances.get(model);
      if (instance?.result) {
        results.push(instance.result);
      }
    }

    const session = new Session({
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
    });

    storage.saveSession(session);
  }

  private nextPrompt(): void {
    if (this.categoryPrompts.length === 0) {
      const { PROMPT_LIBRARY } = require('./types');
      this.categoryPrompts = PROMPT_LIBRARY;
    }

    this.promptIndex++;
    if (this.promptIndex >= this.categoryPrompts.length) {
      this.promptIndex = 0;
    }
    
    this.prompt = this.categoryPrompts[this.promptIndex].text;
    this.promptBox.setContent(`{bold}{green-fg}┌─ Prompt ─────────────────────────────────┐{/green-fg}{/bold}\n│ {yellow-fg}${this.categoryPrompts[this.promptIndex].category}: ${this.categoryPrompts[this.promptIndex].name}{/yellow-fg} │\n│                                              │\n│ {white-fg}${this.prompt.substring(0, 44).padEnd(44)}{/white-fg} │\n│                                              │\n{green-fg}└──────────────────────────────────────────────────┘{/green-fg}`);
    
    this.input.setValue('');
    this.currentView = 'setup';
    this.hasVoted = false;
    this.updateBottomBar();

    // Clear model boxes
    this.modelBoxes.forEach(box => box.detach());
    this.modelBoxes.clear();
    
    this.updateStatusBar();
    this.screen.render();
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxWidth) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }
}

// Start the TUI
new LLMArenaTUI();
