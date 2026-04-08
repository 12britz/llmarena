/* eslint-disable @typescript-eslint/no-explicit-any */
const blessed = require('blessed');

interface ModelResponse {
  model: string;
  label: string;
  text: string;
  done: boolean;
}

export class LLMArenaTUI {
  private screen: any;
  private messages: any[] = [];
  private modelResponses: Map<string, ModelResponse> = new Map();
  private selectedModels: string[] = [];
  private models: string[] = [];
  private blindMode: boolean = false;
  private currentPrompt: string = '';
  private input: any;
  private chatArea: any;
  private sidebar: any;
  private statusBar: any;
  private isGenerating: boolean = false;
  private hasVoted: boolean = false;
  private promptIndex: number = 0;

  constructor() {
    this.init();
  }

  private init(): void {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Local LLM Arena',
    });

    const W = this.screen.width || 140;
    const H = this.screen.height || 40;
    const sidebarW = 26;

    // Sidebar
    this.sidebar = blessed.box({
      screen: this.screen,
      top: 0,
      left: 0,
      width: sidebarW,
      height: H,
      style: { bg: 'black', fg: 'white' },
      content: '',
    });

    // Chat area
    this.chatArea = blessed.box({
      screen: this.screen,
      top: 0,
      left: sidebarW,
      width: W - sidebarW,
      height: H - 3,
      style: { bg: 'black', fg: 'white' },
      content: '',
      scrollable: true,
      alwaysScroll: true,
    });

    // Input
    this.input = blessed.textarea({
      screen: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      style: { bg: 'black', fg: 'white', border: { fg: 'blue' } },
      inputOnFocus: true,
      placeholder: 'Type prompt...',
    });

    // Status bar
    this.statusBar = blessed.box({
      screen: this.screen,
      top: H - 3,
      left: 0,
      width: '100%',
      height: 3,
      style: { bg: 'black', fg: 'white' },
      content: '',
    });

    this.setupEvents();
    this.start();
  }

  private async start(): Promise<void> {
    const ollama = require('./utils/ollama').ollama;

    this.updateChat('{center}{yellow-fg}Connecting to Ollama...{/yellow-fg}{/center}');
    this.render();

    const connected = await ollama.checkConnection();
    if (!connected) {
      this.updateChat('{center}{red-fg}Cannot connect to Ollama{/red-fg}\n\nRun: {green-fg}ollama serve{/green-fg}{/center}');
      this.render();
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
      this.updateChat('{center}{red-fg}Failed to load models{/red-fg}{/center}');
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

    screen.key(['a', 'A', 'b', 'B', 'c', 'C', 'd', 'D'], (ch: string) => {
      if (this.hasVoted || !this.allDone()) return;
      const idx = ch.charCodeAt(0) - 65;
      if (idx >= 0 && idx < this.selectedModels.length) {
        this.vote(this.selectedModels[idx]);
      }
    });

    screen.key(['t', 'T'], () => {
      if (!this.hasVoted && this.allDone()) this.voteTie();
    });

    screen.key(['n', 'N'], () => {
      if (this.hasVoted) this.nextPrompt();
    });

    screen.key(['r', 'R'], () => {
      if (this.currentPrompt && !this.isGenerating) this.runArena();
    });

    screen.key(['b', 'B'], () => {
      this.blindMode = !this.blindMode;
      this.updateSidebar();
      this.redraw();
    });

    this.sidebar.on('click', (data: any) => {
      const line = Math.floor(data.y) - 1;
      if (line >= 0 && line < this.models.length) {
        this.toggleModel(this.models[line]);
      }
    });

    screen.on('resize', () => this.render());
  }

  private updateSidebar(): void {
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    let content = '{bold}{white-fg}MODELS{/white-fg}{/bold}\n\n';
    
    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      const selected = this.selectedModels.includes(model);
      const idx = selected ? this.selectedModels.indexOf(model) : -1;
      const label = idx >= 0 ? `{yellow-fg}[${labels[idx]}]{/yellow-fg}` : '   ';
      const check = selected ? '{green-fg}*' : ' ';
      const name = model.length > 20 ? model.substring(0, 17) + '...' : model;
      
      content += `{dim-fg}${check}{/dim-fg} ${label} {white-fg}${name}{/white-fg}\n`;
    }
    
    content += `\n{dim-fg}selected: ${this.selectedModels.length}{/dim-fg}`;
    
    this.sidebar.setContent(content);
  }

  private updateStatusBar(): void {
    let status = '';
    
    if (this.isGenerating) {
      const pending = Array.from(this.modelResponses.values()).filter(m => !m.done).length;
      status = `{cyan-fg}running ${pending} models...{/cyan-fg}`;
    } else if (this.hasVoted) {
      status = `{green-fg}voted{/green-fg} | [N] next`;
    } else if (this.allDone()) {
      status = `{yellow-fg}[A-D] vote{/yellow-fg} | [T] tie`;
    } else {
      status = `{dim-fg}type prompt + enter{/dim-fg}`;
    }
    
    this.statusBar.setContent(` {white-fg}${status}{/white-fg}              {dim-fg}[Q] quit [B] blind${this.blindMode ? ' ON' : ''}{/dim-fg}`);
  }

  private showWelcome(): void {
    this.updateChat(`{center}{cyan-fg}
     _    ____   ____ ___ ___ 
    /\\  |  _ \\ / ___|_ _|_ _|
   /  \\ | |_) | |    | | | | 
  / /\\ \\|  _ <| |___ | | | | 
 / ____ \\|_) \\\\____|___|___|
/_/    \\_\\_\\\\/
{/cyan-fg}{/center}

{center}{white-fg}Local LLM Arena{/white-fg}{/center}
{center}{dim-fg}Compare local models side-by-side{/dim-fg}{/center}

{center}{dim-fg}Type a prompt and press Enter{/dim-fg}{/center}
{center}{dim-fg}${this.selectedModels.length} models selected{/dim-fg}{/center}`);
  }

  private updateChat(content: string): void {
    this.chatArea.setContent(content);
  }

  private async runArena(): Promise<void> {
    if (this.selectedModels.length < 2) {
      this.updateChat('{center}{red-fg}Select at least 2 models!{/red-fg}\n\nClick in sidebar{/center}');
      this.render();
      return;
    }

    this.isGenerating = true;
    this.hasVoted = false;
    this.modelResponses.clear();

    const labels = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < this.selectedModels.length; i++) {
      const model = this.selectedModels[i];
      this.modelResponses.set(model, {
        model,
        label: labels[i],
        text: '',
        done: false,
      });
    }

    this.updateStatusBar();
    this.redraw();

    await Promise.all(
      this.selectedModels.map(model => this.generate(model))
    );

    this.isGenerating = false;
    this.updateStatusBar();
    this.redraw();
  }

  private async generate(model: string): Promise<void> {
    const ollama = require('./utils/ollama').ollama;
    const resp = this.modelResponses.get(model)!;

    try {
      await ollama.generateResponse(model, this.currentPrompt, (chunk: string) => {
        resp.text += chunk;
        this.redraw();
      });
      resp.done = true;
    } catch (error: any) {
      resp.text = `{red-fg}Error: ${error.message}{/red-fg}`;
      resp.done = true;
    }

    this.redraw();
  }

  private allDone(): boolean {
    return this.modelResponses.size > 0 && 
           Array.from(this.modelResponses.values()).every(m => m.done);
  }

  private redraw(): void {
    if (this.modelResponses.size === 0) return;

    let content = `{white-fg}{bold}You:{/bold} ${this.currentPrompt}{/white-fg}\n\n`;
    const labels = ['A', 'B', 'C', 'D'];

    for (let i = 0; i < this.selectedModels.length; i++) {
      const model = this.selectedModels[i];
      const resp = this.modelResponses.get(model);
      if (!resp) continue;

      const name = this.blindMode ? labels[i] : model;
      const status = resp.done ? `{green-fg}[v]{/green-fg}` : `{cyan-fg}[-]{/cyan-fg}`;
      
      content += `{yellow-fg}{bold}[${labels[i]}]{/bold}{/yellow-fg} {white-fg}${name}{/white-fg} ${status}\n`;
      
      if (resp.text) {
        const lines = resp.text.split('\n').slice(0, 10);
        content += lines.map((l: string) => `  ${l.substring(0, 100)}`).join('\n') + '\n';
      } else {
        content += `  {dim-fg}generating...{/dim-fg}\n`;
      }
      content += '\n';
    }

    if (this.allDone() && !this.hasVoted) {
      content += `{yellow-fg}{bold}VOTE:{/bold}{/yellow-fg} Which was better? `;
      for (let i = 0; i < this.selectedModels.length; i++) {
        content += `{yellow-fg}[${labels[i]}]{/yellow-fg} `;
      }
      content += `{dim-fg}[T] tie{/dim-fg}\n`;
    }

    this.updateChat(content);
    this.chatArea.setScrollPerc(100);
    this.render();
  }

  private vote(model: string): void {
    this.hasVoted = true;

    if (this.selectedModels.length === 2) {
      const loser = this.selectedModels.find(m => m !== model)!;
      const storage = require('./utils/storage');
      storage.updateElo(model, loser, false);
    }

    this.updateStatusBar();
    this.redraw();
  }

  private voteTie(): void {
    this.hasVoted = true;
    if (this.selectedModels.length === 2) {
      const storage = require('./utils/storage');
      storage.updateElo(this.selectedModels[0], this.selectedModels[1], true);
    }
    this.updateStatusBar();
    this.redraw();
  }

  private nextPrompt(): void {
    const { PROMPT_LIBRARY } = require('./types');
    this.promptIndex = (this.promptIndex + 1) % PROMPT_LIBRARY.length;
    this.currentPrompt = PROMPT_LIBRARY[this.promptIndex].text;
    this.hasVoted = false;
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
    this.render();
  }

  private render(): void {
    this.screen.render();
  }
}

new LLMArenaTUI();
