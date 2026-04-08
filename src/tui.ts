/* eslint-disable @typescript-eslint/no-explicit-any */
const blessed = require('blessed');

interface ModelMessage {
  model: string;
  label: string;
  response: string;
  streaming: boolean;
  done: boolean;
  tokensPerSec?: number;
  totalTime?: number;
}

interface ChatMessage {
  type: 'user' | 'model';
  content: string;
  model?: string;
  label?: string;
  done?: boolean;
}

export class LLMArenaTUI {
  private screen: any;
  private messages: ChatMessage[] = [];
  private modelResponses: Map<string, ModelMessage> = new Map();
  private selectedModels: string[] = [];
  private models: string[] = [];
  private blindMode: boolean = false;
  private currentPrompt: string = '';
  private input: any;
  private chatArea: any;
  private sidebar: any;
  private header: any;
  private statusBar: any;
  private footer: any;
  private isGenerating: boolean = false;
  private hasVoted: boolean = false;
  private promptIndex: number = 0;
  private categoryPrompts: any[] = [];

  constructor() {
    this.init();
  }

  private init(): void {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Local LLM Arena',
      fullUnicode: true,
    });

    this.createLayout();
    this.setupEvents();
    this.start();
  }

  private createLayout(): void {
    const { screen } = this;
    const W = screen.width || 140;
    const H = screen.height || 40;
    const sidebarW = 28;

    // Dark background container
    blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      style: { bg: '#0a0a0a' },
    });

    // Header bar
    this.header = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      style: { bg: '#141414', fg: '#ffffff' },
      content: '',
    });

    // Sidebar
    this.sidebar = blessed.box({
      parent: screen,
      top: 3,
      left: 0,
      width: sidebarW,
      height: H - 7,
      style: { bg: '#0d0d0d', fg: '#888888' },
      content: '',
    });

    // Chat area
    this.chatArea = blessed.box({
      parent: screen,
      top: 3,
      left: sidebarW,
      width: W - sidebarW,
      height: H - 7,
      style: { bg: '#0a0a0a', fg: '#ffffff' },
      content: '',
      scrollable: true,
      alwaysScroll: true,
      scrollbar: { style: { fg: '#333333' } },
    });

    // Input box
    this.input = blessed.textarea({
      parent: screen,
      bottom: 2,
      left: 0,
      width: '100%',
      height: 3,
      style: {
        bg: '#141414',
        fg: '#ffffff',
        focus: { bg: '#1a1a1a' },
      },
      inputOnFocus: true,
      placeholder: 'Type your prompt...',
    });

    // Status bar
    this.statusBar = blessed.box({
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      style: { bg: '#1a1a1a', fg: '#666666' },
      content: '',
    });

    // Footer hint
    this.footer = blessed.box({
      parent: screen,
      bottom: 1,
      left: 0,
      width: '100%',
      height: 1,
      style: { bg: '#0d0d0d', fg: '#555555' },
      content: '',
    });

    this.updateHeader();
    this.updateStatusBar();
    this.updateFooter();
  }

  private async start(): Promise<void> {
    const ollama = require('./utils/ollama').ollama;

    this.chatArea.setContent('{center}{dim-fg}Connecting to Ollama...{/dim-fg}{/center}');
    this.render();

    const connected = await ollama.checkConnection();
    if (!connected) {
      this.showError('Cannot connect to Ollama\n\nRun: ollama serve');
      return;
    }

    try {
      const availableModels = await ollama.listModels();
      this.models = availableModels.map((m: any) => m.name);
      
      if (this.models.length >= 2) {
        this.selectedModels = [this.models[0], this.models[1]];
      }

      this.updateSidebar();
      this.showWelcome();
    } catch (error) {
      this.showError('Failed to load models');
    }

    this.input.focus();
    this.render();
  }

  private setupEvents(): void {
    const { screen, input } = this;

    screen.key(['escape', 'q', 'C-c'], () => process.exit(0));

    input.key('enter', () => {
      const value = input.getValue().trim();
      if (value && !this.isGenerating) {
        this.currentPrompt = value;
        this.runArena();
      }
      input.clearValue();
    });

    // Voting
    screen.key(['a', 'A', 'b', 'B', 'c', 'C', 'd', 'D'], (ch: string) => {
      if (this.hasVoted || !this.allModelsDone()) return;
      const idx = ch.toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < this.selectedModels.length) {
        this.vote(this.selectedModels[idx]);
      }
    });

    screen.key(['t', 'T'], () => {
      if (this.hasVoted || !this.allModelsDone()) return;
      this.voteTie();
    });

    screen.key(['n', 'N', 'right'], () => {
      if (this.hasVoted) this.nextPrompt();
    });

    screen.key(['r', 'R'], () => {
      if (this.currentPrompt && !this.isGenerating) {
        this.runArena();
      }
    });

    screen.key(['b', 'B'], () => {
      this.blindMode = !this.blindMode;
      this.updateSidebar();
      this.redrawChat();
    });

    // Sidebar click
    this.sidebar.on('click', (data: any) => {
      const line = Math.floor(data.y) - 2;
      if (line >= 0 && line < this.models.length) {
        this.toggleModel(this.models[line]);
      }
    });

    screen.on('resize', () => this.render());
  }

  private updateHeader(): void {
    const modelCount = this.models.length;
    const selectedCount = this.selectedModels.length;
    const mode = this.blindMode ? ' BLIND' : '';
    
    this.header.setContent(
      `{bg-black}{fg-white}{bold} Local LLM Arena{/bold}{/fg}  {fg-gray}${modelCount} models | ${selectedCount} selected${mode}{/fg}{right}press /help{/right}`
    );
  }

  private updateSidebar(): void {
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    let content = '{bold}{fg-white}Models{/bold}{/fg}\n\n';
    
    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      const selected = this.selectedModels.includes(model);
      const idx = selected ? this.selectedModels.indexOf(model) : -1;
      const label = idx >= 0 ? `{fg-yellow}[${labels[idx]}]{/fg}` : '   ';
      const check = selected ? '{fg-green}●{/fg}' : '○';
      const shortName = model.length > 22 ? model.substring(0, 19) + '...' : model;
      
      content += `${check} ${label} {fg-gray}${shortName}{/fg}\n`;
    }
    
    content += '\n{dim-fg}click to toggle{/dim-fg}';
    
    this.sidebar.setContent(content);
  }

  private updateStatusBar(): void {
    let status = '';
    
    if (this.isGenerating) {
      const pending = Array.from(this.modelResponses.values()).filter(m => !m.done).length;
      status = `{fg-cyan}●{/fg} Generating ${pending} responses...`;
    } else if (this.hasVoted) {
      status = `{fg-green}✓{/fg} Vote recorded | {fg-gray}[N] next prompt{/fg}`;
    } else if (this.allModelsDone()) {
      status = `{fg-yellow}[A/B/C/D] vote{/fg} | {fg-gray}[T] tie | [R] regenerate{/fg}`;
    } else {
      status = `{fg-gray}[Enter] run | [R] regen | [B] blind${this.blindMode ? ' ON' : ''}{/fg}`;
    }
    
    this.statusBar.setContent(`{left}${status}{/left}{right}[Q] quit{/right}`);
  }

  private updateFooter(): void {
    this.footer.setContent('{center}{dim-fg}Tab: cycle models | click sidebar: toggle selection{/dim-fg}{/center}');
  }

  private showWelcome(): void {
    this.chatArea.setContent(`{center}
{dim-fg}
     _    ____   ____ ___ ___      __     _____ _                 _             
    / \\  |  _ \\ / ___|_ _|_ _|____\\ \\   / / ____| |               | |            
   / _ \\ | |_) | |    | | | |_____|\\ \\ / /| |    | | ___  __ _  ___| | _____ _ __ 
  / ___ \\|  _ <| |___ | | | |_____| \\ V / | |___| |/ _ \\/ _\\ |/ __| |/ / _ \\ '__|
 /_/   \\_\ |_> \\____|___|___|       \\_/   \\____|_|_|___\\__,_\\____|_/\\_\\___/|_|   
                                                                                  
{/dim-fg}

{center}{fg-gray}Compare local LLM models side-by-side{/fg}{/center}

{dim-fg}Type a prompt below and press Enter to start.{/dim-fg}
{dim-fg}Models are selected automatically. Click to change.{/dim-fg}
`);
  }

  private showError(msg: string): void {
    this.chatArea.setContent(`{center}
{dim-fg}Error{/dim-fg}

{fg-red}${msg}{/fg}
{/center}`);
    this.render();
  }

  private async runArena(): Promise<void> {
    if (this.selectedModels.length < 2) {
      this.chatArea.setContent('{fg-red}Select at least 2 models first!{/fg}\n\nClick on models in the sidebar.');
      this.render();
      return;
    }

    this.isGenerating = true;
    this.hasVoted = false;
    this.messages = [{ type: 'user', content: this.currentPrompt }];
    this.modelResponses.clear();

    // Initialize model responses
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (let i = 0; i < this.selectedModels.length; i++) {
      const model = this.selectedModels[i];
      this.modelResponses.set(model, {
        model,
        label: labels[i],
        response: '',
        streaming: true,
        done: false,
      });
    }

    this.redrawChat();
    this.updateStatusBar();
    this.render();

    // Generate from all models
    await Promise.all(
      this.selectedModels.map(model => this.generateFromModel(model))
    );

    this.isGenerating = false;
    this.redrawChat();
    this.updateStatusBar();
    this.render();
  }

  private async generateFromModel(model: string): Promise<void> {
    const ollama = require('./utils/ollama').ollama;
    const response = this.modelResponses.get(model)!;

    try {
      await ollama.generateResponse(model, this.currentPrompt, (chunk: string) => {
        response.response += chunk;
        this.redrawChat();
        this.render();
      });

      response.done = true;
      response.streaming = false;
    } catch (error: any) {
      response.response = `{fg-red}Error: ${error.message}{/fg}`;
      response.done = true;
    }

    this.redrawChat();
    this.render();
  }

  private allModelsDone(): boolean {
    return Array.from(this.modelResponses.values()).every(m => m.done);
  }

  private redrawChat(): void {
    let content = '';
    const maxW = 120;

    // Show user prompt
    content += `{bg-blue}{fg-white} You {/bg}{/fg}\n`;
    content += this.wrapText(this.currentPrompt, maxW - 2).join('\n') + '\n\n';

    // Show model responses
    for (const [model, resp] of this.modelResponses) {
      const name = this.blindMode ? `[${resp.label}]` : resp.model;
      const status = resp.done ? '{fg-green}✓{/fg}' : '{fg-cyan}●{/fg}';
      
      content += `{bg-gray} ${name} ${status} {/bg}\n`;
      
      if (resp.response) {
        content += this.wrapText(resp.response, maxW - 2).join('\n') + '\n';
      } else {
        content += `{dim-fg}generating...{/dim-fg}\n`;
      }
      content += '\n';
    }

    // Voting prompt
    if (this.allModelsDone() && !this.hasVoted) {
      content += `{bg-yellow}{fg-black} VOTE {/bg}{/fg} {fg-white}Which response was better? {/fg}`;
      const labels = ['A', 'B', 'C', 'D'];
      for (const [model, resp] of this.modelResponses) {
        content += `{fg-yellow}[${resp.label}]{/fg} `;
      }
      content += `{fg-gray}[T] tie{/fg}\n`;
    }

    this.chatArea.setContent(content);
    this.chatArea.setScrollPerc(100);
  }

  private wrapText(text: string, width: number): string[] {
    // Strip tags for length calculation
    const cleanText = text.replace(/\{[^}]+\}/g, '');
    if (cleanText.length <= width) return [text];

    const lines: string[] = [];
    const words = cleanText.split(/\s+/);
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
    return lines;
  }

  private vote(model: string): void {
    this.hasVoted = true;
    const resp = this.modelResponses.get(model)!;

    // Update Elo
    if (this.selectedModels.length === 2) {
      const loser = this.selectedModels.find(m => m !== model)!;
      const storage = require('./utils/storage');
      storage.updateElo(model, loser, false);
      storage.saveSession({
        id: Date.now().toString(36),
        prompt: this.currentPrompt,
        results: Array.from(this.modelResponses.values()).map(r => ({
          modelName: r.model,
          response: r.response,
          tokensPerSecond: r.tokensPerSec,
          totalTime: r.totalTime,
        })),
        votes: [{ prompt: this.currentPrompt, winnerId: model, isTie: false, timestamp: Date.now() }],
        timestamp: Date.now(),
      });
    }

    this.updateStatusBar();
    this.redrawChat();
    this.render();
  }

  private voteTie(): void {
    this.hasVoted = true;
    if (this.selectedModels.length === 2) {
      const storage = require('./utils/storage');
      storage.updateElo(this.selectedModels[0], this.selectedModels[1], true);
    }
    this.updateStatusBar();
    this.redrawChat();
    this.render();
  }

  private nextPrompt(): void {
    const { PROMPT_LIBRARY } = require('./types');
    this.categoryPrompts = PROMPT_LIBRARY;
    
    this.promptIndex = (this.promptIndex + 1) % this.categoryPrompts.length;
    this.currentPrompt = this.categoryPrompts[this.promptIndex].text;
    this.hasVoted = false;
    this.messages = [];
    this.modelResponses.clear();
    
    this.showWelcome();
    this.updateStatusBar();
    this.render();
  }

  private toggleModel(model: string): void {
    const idx = this.selectedModels.indexOf(model);
    if (idx >= 0) {
      this.selectedModels.splice(idx, 1);
    } else if (this.selectedModels.length < 4) {
      this.selectedModels.push(model);
    }
    this.updateSidebar();
    this.updateHeader();
    this.render();
  }

  private render(): void {
    this.screen.render();
  }
}

new LLMArenaTUI();
