/* eslint-disable @typescript-eslint/no-explicit-any */
const blessed = require('blessed');
const Readline = require('readline');

interface ModelInstance {
  name: string;
  result?: any;
  streaming: boolean;
  fullResponse: string;
  done: boolean;
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
  private messages: any[] = [];
  private scrollableMessages: any;
  private promptInput: any;
  private sidebar: any;
  private header: any;
  private statusBar: any;
  private currentView: 'idle' | 'running' | 'done' = 'idle';
  private votingOpen: boolean = false;
  private winner: string | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Local LLM Arena',
      cursor: { artificial: true, shape: '▌', blink: true },
    });

    this.setupLayout();
    this.setupEventListeners();
    this.start();
  }

  private setupLayout(): void {
    const { screen } = this;
    const W = screen.width || 140;
    const H = screen.height || 40;
    const sidebarW = 32;

    // Header
    this.header = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      style: { bg: 'black', fg: 'cyan' },
      content: '',
      tags: true,
    });

    // Sidebar
    this.sidebar = blessed.box({
      parent: screen,
      top: 3,
      left: 0,
      width: sidebarW,
      height: H - 7,
      border: { type: 'line', fg: 'magenta' },
      style: { bg: 'black', fg: 'white', border: { fg: 'magenta' } },
      content: '',
      tags: true,
    });

    // Chat/Messages area
    this.scrollableMessages = blessed.box({
      parent: screen,
      top: 3,
      left: sidebarW,
      width: W - sidebarW,
      height: H - 7,
      border: { type: 'line', fg: 'blue' },
      style: { bg: 'black', fg: 'white', border: { fg: 'blue' } },
      content: '',
      tags: true,
      scrollable: true,
      alwaysScroll: true,
    });

    // Input area
    this.promptInput = blessed.textbox({
      parent: screen,
      bottom: 2,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line', fg: 'green' },
      style: { 
        bg: 'black', 
        fg: 'white', 
        border: { fg: 'green' },
        focus: { fg: 'green', border: { fg: 'green' } },
      },
      inputOnFocus: true,
    });

    // Status bar
    this.statusBar = blessed.box({
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      style: { bg: 'blue', fg: 'white' },
      content: '',
      tags: true,
    });

    this.updateHeader();
    this.updateStatusBar();
  }

  private async start(): Promise<void> {
    const ollama = require('./utils/ollama').ollama;

    this.updateHeader('Connecting to Ollama...');
    this.render();

    const connected = await ollama.checkConnection();
    if (!connected) {
      this.scrollableMessages.setContent(
        `{red-fg}╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ✖ Cannot connect to Ollama                                ║
║                                                              ║
║   Make sure Ollama is running:                              ║
║   {green-fg}   ollama serve{/green-fg}                                          ║
║                                                              ║
║   Then restart this application.                            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝{/red-fg}`
      );
      this.render();
      return;
    }

    try {
      const availableModels = await ollama.listModels();
      this.models = availableModels.map((m: any) => m.name);
      
      if (this.models.length >= 2) {
        this.selectedModels = [this.models[0], this.models[1]];
      }

      this.updateHeader(`Local LLM Arena | ${this.models.length} models | Press Enter to start`);
      this.updateSidebar();
      this.showWelcome();
    } catch (error) {
      this.scrollableMessages.setContent('{red-fg}Error loading models{/red-fg}');
    }

    this.updateStatusBar();
    this.promptInput.focus();
    this.render();
  }

  private setupEventListeners(): void {
    const { screen, promptInput } = this;

    // Quit
    screen.key(['escape', 'q', 'C-c'], () => process.exit(0));

    // Submit prompt
    promptInput.key('enter', () => {
      const value = promptInput.getValue().trim();
      if (value && this.currentView !== 'running') {
        this.prompt = value;
        this.runArena();
      }
    });

    // Arrow up/down for history (future)
    promptInput.key(['up', 'down'], () => {});

    // Voting keys
    screen.key(['a', 'A', 'b', 'B', 'c', 'C', 'd', 'D', 'e', 'E', 'f', 'F'], (ch: string) => {
      if (this.votingOpen && !this.hasVoted) {
        this.voteForModel(ch.toUpperCase());
      }
    });

    screen.key(['t', 'T'], () => {
      if (this.votingOpen && !this.hasVoted) {
        this.recordTie();
      }
    });

    screen.key(['n', 'N', 'right', 'l', 'L'], () => {
      if (this.hasVoted || this.currentView === 'done') {
        this.nextPrompt();
      }
    });

    screen.key(['r', 'R'], () => {
      if (this.prompt && this.currentView !== 'running') {
        this.runArena();
      }
    });

    screen.key(['b', 'B'], () => {
      this.blindMode = !this.blindMode;
      this.updateSidebar();
      if (this.messages.length > 0) {
        this.redrawMessages();
      }
      this.updateStatusBar();
    });

    // Click on sidebar
    this.sidebar.on('click', (data: any) => {
      const line = Math.floor(data.y) - 2;
      if (line >= 0 && line < this.models.length) {
        this.toggleModel(this.models[line]);
      }
    });

    // Resize
    screen.on('resize', () => this.render());
  }

  private showWelcome(): void {
    const content = `
{cyan-fg}╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║   {white-fg}{bold}Welcome to Local LLM Arena{/bold}{/white-fg}                                      ║
║                                                                    ║
║   {dim-fg}Compare local LLM models side-by-side{/dim-fg}                             ║
║   {dim-fg}Vote for the best response{/dim-fg}                                       ║
║                                                                    ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║   {yellow-fg}Quick Start:{/yellow-fg}                                                    ║
║   1. Select models in the sidebar (or use defaults)                ║
║   2. Type your prompt below                                       ║
║   3. Press {white-fg}Enter{/white-fg} to run                                              ║
║   4. Vote for the best response with {white-fg}A/B/C{/white-fg} keys                ║
║                                                                    ║
║   {dim-fg}Press Tab to cycle models, B to toggle blind mode{/dim-fg}               ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝{/cyan-fg}
`;
    this.scrollableMessages.setContent(content);
  }

  private updateHeader(msg?: string): void {
    const mode = this.blindMode ? '{red-fg}[BLIND]{/red-fg}' : '{blue-fg}[REVEAL]{/blue-fg}';
    const title = '{bold}{cyan-fg}▓▒░{/cyan-fg} Local LLM Arena {cyan-fg}░▒▓{/cyan-fg}{/bold}';
    const info = msg || `${this.models.length} models | ${this.selectedModels.length} selected ${mode}`;
    this.header.setContent(`\n{center}${title}  {dim-fg}${info}{/dim-fg}{/center}`);
  }

  private updateSidebar(): void {
    let content = `{bold}{magenta-fg}┌─ Models (${this.selectedModels.length}) ─┐{/magenta-fg}{/bold}\n`;
    content += `{magenta-fg}│                              │{/magenta-fg}\n`;
    
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    
    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      const selected = this.selectedModels.includes(model);
      const check = selected ? `{green-fg}◉{/green-fg}` : `○`;
      const label = selected && this.selectedModels.indexOf(model) !== -1 
        ? `{yellow-fg}[${labels[this.selectedModels.indexOf(model)]}]{/yellow-fg}` 
        : `   `;
      const shortName = model.substring(0, 22).padEnd(22);
      content += `{magenta-fg}│{/magenta-fg} ${check} ${label} {white-fg}${shortName}{/white-fg} {magenta-fg}│{/magenta-fg}\n`;
    }
    
    content += `{magenta-fg}│                              │{/magenta-fg}\n`;
    content += `{magenta-fg}└──────────────────────────────┘{/magenta-fg}\n\n`;
    
    if (this.blindMode) {
      content += `{red-fg}{bold}⚠ BLIND MODE ON{/bold}{/red-fg}\n`;
      content += `{dim-fg}Model names are hidden{/dim-fg}\n`;
    }
    
    this.sidebar.setContent(content);
  }

  private updateStatusBar(): void {
    let content = '{center}';
    
    if (this.votingOpen && !this.hasVoted) {
      content += `{yellow-fg}[A-F] Vote{/yellow-fg} | {dim-fg}[T] Tie{/dim-fg}`;
    } else if (this.hasVoted) {
      content += `{green-fg}✓ Voted{/green-fg} | {dim-fg}[N] Next prompt{/dim-fg}`;
    } else if (this.currentView === 'running') {
      content += `{cyan-fg}⟳ Generating...{/cyan-fg}`;
    } else {
      content += `{dim-fg}[Enter] Run{/dim-fg} | [R] Regen | [B] Blind`;
    }
    
    content += ` | [Q] Quit | [Tab] Models{/center}`;
    this.statusBar.setContent(content);
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
    this.updateHeader();
    this.render();
  }

  private async runArena(): Promise<void> {
    if (this.selectedModels.length < 2) {
      this.scrollableMessages.setContent(
        `{red-fg}╔═══════════════════════════════════════════════════════╗
║                                                               ║
║   ✖ Select at least 2 models                                 ║
║                                                               ║
║   Click on models in the sidebar to select them.              ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝{/red-fg}`
      );
      this.render();
      return;
    }

    this.currentView = 'running';
    this.hasVoted = false;
    this.votingOpen = false;
    this.winner = null;
    this.messages = [];
    this.modelInstances.clear();

    const { PROMPT_LIBRARY } = require('./types');
    this.categoryPrompts = PROMPT_LIBRARY;
    this.promptIndex = 0;

    // Initialize model instances
    for (const model of this.selectedModels) {
      this.modelInstances.set(model, {
        name: model,
        streaming: true,
        fullResponse: '',
        done: false,
      });
    }

    // Show prompt and start generating
    this.showPromptAndStartGenerating();
    this.updateHeader('Generating responses...');
    this.updateStatusBar();
    this.render();

    // Run models
    await Promise.all(
      this.selectedModels.map(model => this.generateResponse(model))
    );

    this.currentView = 'done';
    this.votingOpen = true;
    this.hasVoted = false;
    this.updateHeader('Vote for the best response!');
    this.updateStatusBar();
    this.render();
  }

  private showPromptAndStartGenerating(): void {
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    
    let content = `{cyan-fg}{bold}╔════════════════════════════════════════════════════════════════════════╗{/bold}{/cyan-fg}
║{white-fg} {bold}Prompt:{/bold} ${this.truncate(this.prompt, 75).padEnd(75)} {cyan-fg}║{/cyan-fg}
╠════════════════════════════════════════════════════════════════════════╣{/cyan-fg}
`;
    this.messages.push({ type: 'prompt', content });
    
    for (let i = 0; i < this.selectedModels.length; i++) {
      const model = this.selectedModels[i];
      const label = labels[i];
      const displayName = this.blindMode ? `${label}` : model;
      content += `{cyan-fg}║{/cyan-fg} {bold}{yellow-fg}[${label}]{/yellow-fg}{/bold} {displayName}                                          {cyan-fg}║{/cyan-fg}
║{white-fg} ${'▒'.repeat(76)} {cyan-fg}║{/cyan-fg}
`;
      this.messages.push({ type: 'model', model, label, content: '' });
    }
    
    content += `{cyan-fg}╚════════════════════════════════════════════════════════════════════════╝{/cyan-fg}`;
    
    this.scrollableMessages.setContent(content);
    this.promptInput.clearValue();
  }

  private async generateResponse(model: string): Promise<void> {
    const ollama = require('./utils/ollama').ollama;
    const instance = this.modelInstances.get(model)!;
    const index = this.selectedModels.indexOf(model);
    const label = ['A', 'B', 'C', 'D', 'E', 'F'][index];
    const displayName = this.blindMode ? `${label}` : model;

    try {
      await ollama.generateResponse(model, this.prompt, (chunk: string) => {
        instance.fullResponse += chunk;
        this.updateModelMessage(model, label, displayName, instance.fullResponse, true);
        this.render();
      });

      instance.done = true;
      instance.result = { tokensPerSecond: 42, totalTime: 3.5 }; // Placeholder
      this.updateModelMessage(model, label, displayName, instance.fullResponse, false);
      
    } catch (error: any) {
      instance.fullResponse = `{red-fg}Error: ${error.message}{/red-fg}`;
      instance.done = true;
      this.updateModelMessage(model, label, displayName, instance.fullResponse, false);
    }

    this.render();
  }

  private updateModelMessage(model: string, label: string, displayName: string, text: string, streaming: boolean): void {
    const modelMsg = this.messages.find(m => m.model === model);
    if (!modelMsg) return;

    const truncated = text.length > 3000 ? text.substring(0, 3000) + '\n{dim-fg}[truncated]{/dim-fg}' : text;
    const status = streaming ? `{cyan-fg}⟳{/cyan-fg}` : `{green-fg}✓{/green-fg}`;
    
    modelMsg.content = `{cyan-fg}║{/cyan-fg} {bold}{yellow-fg}[${label}]{/yellow-fg}{/bold} {displayName} ${status}                                          {cyan-fg}║{/cyan-fg}
║{white-fg} ${this.wrapText(truncated, 76).join('\n' + ' '.repeat(79))} {cyan-fg}║{/cyan-fg}
`;
    
    this.redrawMessages();
  }

  private redrawMessages(): void {
    let content = `{cyan-fg}{bold}╔════════════════════════════════════════════════════════════════════════╗{/bold}{/cyan-fg}
║{white-fg} {bold}Prompt:{/bold} ${this.truncate(this.prompt, 75).padEnd(75)} {cyan-fg}║{/cyan-fg}
╠════════════════════════════════════════════════════════════════════════╣{/cyan-fg}
`;
    
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    
    for (let i = 0; i < this.selectedModels.length; i++) {
      const model = this.selectedModels[i];
      const instance = this.modelInstances.get(model);
      const label = labels[i];
      const displayName = this.blindMode ? `${label}` : model;
      
      if (instance) {
        const status = instance.done ? `{green-fg}✓{/green-fg}` : `{cyan-fg}⟳{/cyan-fg}`;
        const response = instance.fullResponse || `{dim-fg}Generating...{/dim-fg}`;
        const truncated = response.length > 3000 ? response.substring(0, 3000) + '\n{dim-fg}[truncated]{/dim-fg}' : response;
        
        content += `{cyan-fg}║{/cyan-fg} {bold}{yellow-fg}[${label}]{/yellow-fg}{/bold} {displayName} ${status}                                          {cyan-fg}║{/cyan-fg}\n`;
        
        const lines = this.wrapText(truncated, 76);
        for (const line of lines.slice(0, 15)) {
          content += `{cyan-fg}║{/cyan-fg}{white-fg} ${line.padEnd(76)}{/white-fg} {cyan-fg}║{/cyan-fg}\n`;
        }
        
        if (lines.length > 15) {
          content += `{cyan-fg}║{/cyan-fg}{dim-fg} ... (${lines.length - 15} more lines){/dim-fg}                    {cyan-fg}║{/cyan-fg}\n`;
        }
        
        if (i < this.selectedModels.length - 1) {
          content += `{cyan-fg}╟──────────────────────────────────────────────────────────────────────────────╢{/cyan-fg}\n`;
        }
      }
    }
    
    content += `{cyan-fg}╚════════════════════════════════════════════════════════════════════════╝{/cyan-fg}`;
    
    if (this.votingOpen && !this.hasVoted) {
      content += `\n\n{yellow-fg}{bold}═════════════════════════════════════════════════════════════════════════════{/bold}{/yellow-fg}
║                                                                       ║
║   {white-fg}{bold}Which response was better?{/bold}                                             ║
║                                                                       ║
║   {yellow-fg}[A/B/C/D/E/F]{yellow-fg} Vote for a model    {dim-fg}[T] Tie{/dim-fg}                      ║
║                                                                       ║
╚═════════════════════════════════════════════════════════════════════════╝`;
    } else if (this.hasVoted) {
      const winnerLabel = this.winner === 'tie' ? 'TIE' : this.winner;
      content += `\n\n{green-fg}{bold}═════════════════════════════════════════════════════════════════════════════{/bold}{/green-fg}
║                                                                       ║
║   {white-fg}{bold}Vote recorded for ${winnerLabel}{/bold}                                          ║
║                                                                       ║
║   {dim-fg}Press [N] for next prompt or [R] to regenerate{/dim-fg}                        ║
║                                                                       ║
╚═════════════════════════════════════════════════════════════════════════╝`;
    }
    
    this.scrollableMessages.setContent(content);
  }

  private voteForModel(label: string): void {
    const index = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(label);
    if (index >= 0 && index < this.selectedModels.length) {
      const winner = this.selectedModels[index];
      this.hasVoted = true;
      this.winner = winner;
      this.votingOpen = false;

      if (this.selectedModels.length === 2) {
        const loser = this.selectedModels.find(m => m !== winner)!;
        const storage = require('./utils/storage');
        storage.updateElo(winner, loser, false);
      }

      const storage = require('./utils/storage');
      storage.saveSession({
        id: Date.now().toString(36),
        prompt: this.prompt,
        results: this.selectedModels.map(m => this.modelInstances.get(m)?.result).filter(Boolean),
        votes: [{ prompt: this.prompt, winnerId: winner, isTie: false, timestamp: Date.now() }],
        timestamp: Date.now(),
      });

      this.updateHeader(`Vote recorded for ${this.blindMode ? label : winner}!`);
      this.updateStatusBar();
      this.redrawMessages();
      this.render();
    }
  }

  private recordTie(): void {
    if (this.selectedModels.length === 2) {
      const storage = require('./utils/storage');
      storage.updateElo(this.selectedModels[0], this.selectedModels[1], true);
    }
    this.hasVoted = true;
    this.winner = 'tie';
    this.votingOpen = false;
    this.updateHeader('Tie recorded!');
    this.updateStatusBar();
    this.redrawMessages();
    this.render();
  }

  private nextPrompt(): void {
    this.promptIndex++;
    if (this.promptIndex >= this.categoryPrompts.length) {
      this.promptIndex = 0;
    }
    
    this.prompt = this.categoryPrompts[this.promptIndex].text;
    this.currentView = 'idle';
    this.hasVoted = false;
    this.votingOpen = false;
    this.messages = [];
    this.modelInstances.clear();
    
    this.showWelcome();
    this.promptInput.clearValue();
    this.updateHeader(`${this.categoryPrompts[this.promptIndex].category}: ${this.categoryPrompts[this.promptIndex].name}`);
    this.updateStatusBar();
    this.render();
  }

  private truncate(text: string, len: number): string {
    return text.length > len ? text.substring(0, len - 3) + '...' : text;
  }

  private wrapText(text: string, width: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      if ((current + ' ' + word).trim().length <= width) {
        current = (current + ' ' + word).trim();
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  private render(): void {
    this.screen.render();
  }
}

// Start the TUI
new LLMArenaTUI();
