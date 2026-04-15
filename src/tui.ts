import * as blessed from 'blessed';
import { ollama } from './utils/ollama';
import { updateElo, saveSession, getEloRatings } from './utils/storage';

const b = blessed as any;

// ── Semantic Nord-Inspired Palette ──────────────────────────────────────────────
const C = {
  bg:        '#0B0D12',   // Canvas
  bgCard:    '#11141B',   // Panels
  bgInput:   '#161A22',   // Composer
  bgTop:     '#0E1219',   // Top/status chrome
  border:    '#2A303C',   // Main border
  borderHi:  '#4FA3FF',   // Accent
  borderSoft:'#222834',   // Soft separator
  text:      '#E6EAF2',   // Primary text
  textDim:   '#B5BECC',   // Secondary text
  textMuted: '#7B8698',   // Muted
  heading:   '#F4F7FC',   // Headings
  white:     '#F4F7FC',
  green:     '#7BD88F',
  blue:      '#78A6FF',
  orange:    '#E6C07B',
  red:       '#F07178',
  cyan:      '#5FC7FF',
  purple:    '#C792EA',
};

// ANSI codes for inline styling
const A = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  italic: '\x1b[3m',
  white:  '\x1b[97m',
  gray:   '\x1b[90m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
};

export async function main() {
  const screen = b.screen({
    smartCSR: true,
    title: 'LLMRing - LLM Battleground',
    fullUnicode: true,
    style: { bg: C.bg },
  });

  // ── State ─────────────────────────────────────────────────────────────────
  let models: any[]       = [];
  let selected: string[]  = [];
  let generating          = false;
  let resA                = '';
  let resB                = '';
  let hasPrompted         = false;  // Track if user has sent first prompt
  let currentPrompt       = '';
  let voteCast            = '';     // Track which vote was cast
  let activeFocus: 'composer' | 'left' | 'right' = 'composer';
  let compactLayout      = false;
  let renderQueued       = false;
  let inBattleView       = false;

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(() => {
      renderQueued = false;
      screen.render();
    }, 33);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  TOP BAR
  // ════════════════════════════════════════════════════════════════════════════
  const topBar = b.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    style: { bg: C.bgTop, fg: C.textDim },
    content: ` {bold}LLMRing{/bold} {${C.textMuted}-fg}:{/} {bold}LLM Battleground{/bold}`,
    tags: true,
  });

  // Model selector in top bar (clickable pills)
  const modelSelector = b.box({
    parent: screen,
    top: 0,
    left: 11,
    width: 'shrink',
    height: 1,
    tags: true,
    style: { bg: C.bgTop, fg: C.textMuted },
    content: '',
  });

  function refreshModelSelector() {
    if (models.length === 0) {
      modelSelector.setContent(`{${C.red}-fg}No models{/}`);
      return;
    }
    const pills = models.slice(0, 6).map((m: any, i: number) => {
      const isSelected = selected.includes(m.name);
      const label = String.fromCharCode(65 + i); // A, B, C, D, E, F
      return isSelected 
        ? `{${C.green}-fg}[${label}]{/} ${m.name.split(':')[0]}`
        : `{${C.textMuted}-fg}${label}{/}`;
    });
    modelSelector.setContent(pills.join(` ${A.gray}|${A.reset} `));
  }

  // Click on model selector to cycle through models
  modelSelector.on('click', () => {
    if (models.length === 0) return;
    // Toggle next model into selection (max 2)
    if (selected.length < 2) {
      const available = models.filter((m: any) => !selected.includes(m.name));
      if (available.length > 0) {
        selected.push(available[0].name);
      }
    } else {
      // Replace one of the selected with next available
      selected.shift();
      const available = models.filter((m: any) => !selected.includes(m.name));
      if (available.length > 0) {
        selected.push(available[0].name);
      }
    }
    refreshModelSelector();
    refreshStatusBar();
    queueRender();
  });

  // Horizontal line under top bar
  b.line({
    parent: screen,
    orientation: 'horizontal',
    top: 1,
    left: 0,
    width: '100%',
    style: { fg: C.border },
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  WELCOME SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  const asciiTitle = [
    "██╗     ██╗     ███╗   ███╗██████╗ ██╗███╗   ██╗ ██████╗",
    "██║     ██║     ████╗ ████║██╔══██╗██║████╗  ██║██╔════╝",
    "██║     ██║     ██╔████╔██║██████╔╝██║██╔██╗ ██║██║  ███╗",
    "██║     ██║     ██║╚██╔╝██║██╔══██╗██║██║╚██╗██║██║   ██║",
    "███████╗███████╗██║ ╚═╝ ██║██║  ██║██║██║ ╚████║╚██████╔╝",
    "╚══════╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝",
    "",
    "                 \" LLM Battleground \"",
  ];
  const logoWidth = Math.max(...asciiTitle.map(line => line.length)) + 4;
  const logoHeight = asciiTitle.length + 2;

  const logoBox = b.box({
    parent: screen,
    top: 6,
    left: 'center',
    width: logoWidth,
    height: logoHeight,
    align: 'center',
    border: { type: 'line' },
    style: { bg: C.bg, border: { fg: C.border } },
    content: `{bold}{${C.white}-fg}${asciiTitle.join('\n')}{/}`,
    tags: true,
  });

  const heroSubtitle = b.box({
    parent: screen,
    top: 17,
    left: 'center',
    width: 64,
    height: 1,
    align: 'center',
    content: `{${C.textMuted}-fg}Compare local models side-by-side with blind voting and Elo scoring{/}`,
    tags: true,
    style: { bg: C.bg },
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  INPUT AREA
  // ════════════════════════════════════════════════════════════════════════════
  const inputCard = b.box({
    parent: screen,
    top: 19,
    left: 'center',
    width: '74%',
    height: 3,
    style: { bg: C.bgInput },
  });

  // The distinctive blue left border line
  const leftBar = b.box({
    parent: inputCard,
    top: 0,
    left: 0,
    width: 1,
    height: '100%',
    style: { bg: C.blue },
  });

  const inputPrompt = b.box({
    parent: inputCard,
    top: 1,
    left: 2,
    width: 1,
    height: 1,
    content: '',
    style: { bg: C.bgInput },
  });

  const inputPlaceholder = b.box({
    parent: inputCard,
    top: 1,
    left: 2,
    width: '100%-5',
    height: 1,
    content: `${A.bold}${A.white}Ask anything...${A.reset} ${A.gray}"Explain Bangalore meaning"{A.reset}`,
    style: { bg: C.bgInput },
  });

  const inputField = b.textarea({
    parent: inputCard,
    top: 1,
    left: 2,
    width: '100%-5',
    height: 1,
    inputOnFocus: true,
    style: { bg: C.bgInput, fg: C.white },
  });

  // Floating helpers below input (right aligned)
  const inputHelpers = b.box({
    parent: screen,
    top: 23,
    left: 'center',
    width: '74%',
    height: 1,
    align: 'left',
    content: `${A.gray}Enter${A.reset} send   ${A.gray}Shift+Enter${A.reset} newline   ${A.gray}Tab${A.reset} focus`,
    tags: true,
    style: { bg: C.bg },
  });


  // ════════════════════════════════════════════════════════════════════════════
  //  BATTLE VIEW
  // ════════════════════════════════════════════════════════════════════════════

  // User prompt bubble (right-aligned, pill shape)
  const promptBubble = b.box({
    parent: screen,
    top: 3,
    right: 3,
    width: 'shrink',
    height: 3,
    hidden: true,
    content: '',
    tags: true,
    style: { bg: C.bgCard, fg: C.white, border: { fg: C.borderSoft } },
    border: { type: 'line' },
  });

  // ── Assistant A Card ──────────────────────────────────────────────────────
  const cardA = b.box({
    parent: screen,
    top: 6,
    left: 3,
    width: '50%-5',
    height: '100%-17',
    hidden: true,
    border: { type: 'line' },
    style: {
      bg: C.bgCard,
      border: { fg: C.border },
    },
  });

  const headerA = b.box({
    parent: cardA,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ` {${C.blue}-fg}●{/} {bold}Assistant A{/bold}`,
    tags: true,
    style: { bg: C.bgCard, fg: C.textDim },
  });


  const bodyA = b.box({
    parent: cardA,
    top: 1,
    left: 0,
    width: '100%-2',
    height: '100%-3',
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    mouse: true,
    style: { bg: C.bgCard, fg: C.text },
    scrollbar: { ch: ' ', style: { bg: C.borderSoft } },
  });

  // ── Assistant B Card ──────────────────────────────────────────────────────
  const cardB = b.box({
    parent: screen,
    top: 6,
    left: '50%+1',
    width: '50%-5',
    height: '100%-17',
    hidden: true,
    border: { type: 'line' },
    style: {
      bg: C.bgCard,
      border: { fg: C.border },
    },
  });

  const headerB = b.box({
    parent: cardB,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ` {${C.cyan}-fg}●{/} {bold}Assistant B{/bold}`,
    tags: true,
    style: { bg: C.bgCard, fg: C.textDim },
  });


  const bodyB = b.box({
    parent: cardB,
    top: 1,
    left: 0,
    width: '100%-2',
    height: '100%-3',
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    mouse: true,
    style: { bg: C.bgCard, fg: C.text },
    scrollbar: { ch: ' ', style: { bg: C.borderSoft } },
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  VOTING BUTTONS (shown after generation completes)
  // ════════════════════════════════════════════════════════════════════════════
  const voteRow = b.box({
    parent: screen,
    bottom: 5,
    left: 'center',
    width: 76,
    height: 3,
    hidden: true,
    style: { bg: C.bg },
  });

  function makeVoteBtn(label: string, left: number, width: number): any {
    return b.box({
      parent: voteRow,
      top: 0,
      left: left,
      width: width,
      height: 3,
      content: `{center}${label}{/center}`,
      tags: true,
      border: { type: 'line' },
      style: {
        bg: C.bg,
        fg: C.textDim,
        border: { fg: C.border },
      },
      mouse: true,
    });
  }

  const btnA    = makeVoteBtn('A wins', 0, 19);
  const btnGood = makeVoteBtn('Tie (good)', 19, 19);
  const btnBad  = makeVoteBtn('Tie (bad)', 38, 19);
  const btnB    = makeVoteBtn('B wins', 57, 19);

  // ── Toast notification ────────────────────────────────────────────────────
  const toast = b.box({
    parent: screen,
    top: 3,
    left: 'center',
    width: 'shrink',
    height: 1,
    hidden: true,
    padding: { left: 1, right: 1 },
    border: { type: 'line' },
    style: { fg: C.text, bg: C.bgCard, border: { fg: C.borderSoft } },
  });

  function showToast(msg: string, ms = 2500) {
    toast.setContent(msg);
    toast.show();
    queueRender();
    setTimeout(() => { toast.hide(); queueRender(); }, ms);
  }

  function styleInlineMarkdown(text: string) {
    // Inline code first so subsequent replacements don't recolor inside it.
    let out = text.replace(/`([^`]+)`/g, `${A.magenta}$1${A.reset}`);
    out = out.replace(/\*\*([^*]+)\*\*/g, `${A.bold}${A.white}$1${A.reset}`);
    out = out.replace(/\*([^*]+)\*/g, `${A.cyan}$1${A.reset}`);
    return out;
  }

  function renderMarkdown(text: string) {
    const lines = text.split('\n');
    const styled = lines.map((line) => {
      if (!line.trim()) return '';

      if (/^###\s+/.test(line)) {
        return `${A.bold}${A.cyan}${line.replace(/^###\s+/, '')}${A.reset}`;
      }
      if (/^##\s+/.test(line)) {
        return `${A.bold}${A.blue}${line.replace(/^##\s+/, '')}${A.reset}`;
      }
      if (/^#\s+/.test(line)) {
        return `${A.bold}${A.white}${line.replace(/^#\s+/, '')}${A.reset}`;
      }
      if (/^>\s+/.test(line)) {
        return `${A.gray}│ ${styleInlineMarkdown(line.replace(/^>\s+/, ''))}${A.reset}`;
      }
      if (/^(\-|\*)\s+/.test(line)) {
        return `${A.cyan}•${A.reset} ${styleInlineMarkdown(line.replace(/^(\-|\*)\s+/, ''))}`;
      }
      if (/^\d+\.\s+/.test(line)) {
        return line.replace(/^(\d+\.)\s+/, `${A.blue}$1${A.reset} `);
      }

      return styleInlineMarkdown(line);
    });

    return styled.join('\n');
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  FUNCTIONS
  // ════════════════════════════════════════════════════════════════════════════

  function applyFocusStyles() {
    leftBar.style.bg = activeFocus === 'composer' ? C.borderHi : C.blue;
    if (!voteCast) {
      cardA.style.border = { fg: activeFocus === 'left' ? C.borderHi : C.border };
      cardB.style.border = { fg: activeFocus === 'right' ? C.borderHi : C.border };
    }
  }

  function applyResponsiveLayout() {
    const width = typeof screen.width === 'number' ? screen.width : 160;
    const height = typeof screen.height === 'number' ? screen.height : 48;
    compactLayout = width < 140;

    if (!inBattleView) {
      const welcomeTop = Math.max(3, Math.floor(height * 0.15));
      logoBox.top = welcomeTop;
      logoBox.width = Math.min(logoWidth, Math.max(56, width - 8));
      logoBox.height = logoHeight;

      const subtitleTop = welcomeTop + logoHeight + 1;
      heroSubtitle.top = subtitleTop;
      heroSubtitle.width = Math.min(72, Math.max(50, width - 8));

      const composerTop = subtitleTop + 2;
      inputCard.top = composerTop;
      inputCard.width = compactLayout ? '92%' : '74%';
      inputCard.height = 3;

      inputHelpers.top = composerTop + 4;
      inputHelpers.width = compactLayout ? '92%' : '74%';
      return;
    }

    if (compactLayout) {
      promptBubble.left = 'center';
      promptBubble.right = undefined;
      promptBubble.width = '92%';

      cardA.left = 2;
      cardA.top = 6;
      cardA.width = '100%-4';
      cardA.height = '37%';

      cardB.left = 2;
      cardB.top = '43%';
      cardB.width = '100%-4';
      cardB.height = '37%';

      voteRow.width = '92%';
      voteRow.bottom = 5;
      btnA.left = '0%';    btnA.width = '25%';
      btnGood.left = '25%'; btnGood.width = '25%';
      btnBad.left = '50%';  btnBad.width = '25%';
      btnB.left = '75%';    btnB.width = '25%';
    } else {
      promptBubble.left = undefined;
      promptBubble.right = 3;
      promptBubble.width = 'shrink';

      cardA.left = 3;
      cardA.top = 6;
      cardA.width = '50%-5';
      cardA.height = '100%-17';

      cardB.left = '50%+1';
      cardB.top = 6;
      cardB.width = '50%-5';
      cardB.height = '100%-17';

      voteRow.width = 76;
      voteRow.bottom = 5;
      btnA.left = 0;   btnA.width = 19;
      btnGood.left = 19; btnGood.width = 19;
      btnBad.left = 38; btnBad.width = 19;
      btnB.left = 57;  btnB.width = 19;
    }
  }

  function showBattleView() {
    logoBox.hide();
    heroSubtitle.hide();
    inputHelpers.hide();
    inBattleView = true;
    promptBubble.show();
    cardA.show();
    cardB.show();
    
    // Move input card to the bottom
    inputCard.top = undefined;
    inputCard.bottom = 3;
    inputCard.width = '82%';
    inputCard.height = 3;
    inputPrompt.hide();
    
    // OpenCode-like composer: clean slab with a blue left rail.
    inputCard.border = undefined;
    leftBar.show();
    leftBar.top = 0;
    leftBar.left = 0;
    leftBar.height = '100%';
    
    inputField.top = 1;
    inputField.left = 2;
    inputPlaceholder.top = 1;
    inputPlaceholder.left = 2;
    inputPlaceholder.setContent(`${A.gray}Ask follow-up...${A.reset}`);
    inputPlaceholder.show();
    
    inputFooter.hide();
    applyResponsiveLayout();
    applyFocusStyles();
    refreshStatusBar();
    queueRender();
  }

  function showVoteButtons() {
    voteRow.show();
    // Reset all button styles
    [btnA, btnGood, btnBad, btnB].forEach((btn: any) => {
      btn.style.border = { fg: C.border };
      btn.style.fg = C.textDim;
    });
    screen.render();
  }

  function resetBattleRoundUI() {
    // Return to blind labels and neutral styling for a fresh round.
    headerA.setContent(` {${C.blue}-fg}●{/} {bold}Assistant A{/bold}`);
    headerB.setContent(` {${C.cyan}-fg}●{/} {bold}Assistant B{/bold}`);
    cardA.style.border = { fg: C.border };
    cardB.style.border = { fg: C.border };
  }

  function highlightVote(choice: 'A' | 'B' | 'good' | 'bad', btn: any) {
    // Reset all
    [btnA, btnGood, btnBad, btnB].forEach((b: any) => {
      b.style.border = { fg: C.border };
      b.style.fg = C.textDim;
    });
    // Highlight selected button
    btn.style.border = { fg: C.green };
    btn.style.fg = C.green;
    
    // Reveal model names and highlight card
    const [mA, mB] = selected;
    cardA.style.border = { fg: choice === 'A' || choice === 'good' ? C.green : C.border };
    cardB.style.border = { fg: choice === 'B' || choice === 'good' ? C.green : C.border };
    
    headerA.setContent(` ${choice === 'A' || choice === 'good' ? A.green : A.gray}●${A.reset} {bold}${mA}{/bold}`);
    headerB.setContent(` ${choice === 'B' || choice === 'good' ? A.green : A.gray}●${A.reset} {bold}${mB}{/bold}`);
    queueRender();
  }

  async function loadModels() {
    try {
      const raw = await ollama.listModels();
      models = raw.sort((a: any, b: any) => a.size - b.size);
      if (models.length >= 2 && selected.length === 0) {
        selected = [models[0].name, models[1].name];
      }
      refreshModelSelector();
      refreshStatusBar();
    } catch {
      refreshModelSelector();
      showToast(`${A.red}Cannot connect to Ollama${A.reset}`);
    }
  }

  async function generate() {
    if (selected.length < 2) {
      showToast(`${A.red}Select at least 2 models (only ${models.length} available)${A.reset}`);
      return;
    }
    const prompt = inputField.getValue().trim();
    if (!prompt) return;

    currentPrompt = prompt;
    hasPrompted = true;
    generating = true;
    voteCast = '';
    resA = ''; resB = '';
    const previousFocus = screen.focused;
    resetBattleRoundUI();
    refreshStatusBar();

    // Show battle view
    promptBubble.setContent(`  ${prompt}  `);
    showBattleView();
    voteRow.hide();

    // Show searching state
    bodyA.setContent(`${A.cyan}⟳${A.reset} ${A.dim}Generating response...${A.reset}`);
    bodyB.setContent(`${A.cyan}⟳${A.reset} ${A.dim}Generating response...${A.reset}`);
    inputField.clearValue();
    // Move focus away from textarea to avoid cursor blinking while streaming.
    activeFocus = 'left';
    applyFocusStyles();
    bodyA.focus();
    queueRender();

    const [mA, mB] = selected;
    await Promise.all([
      ollama.generateResponse(mA, prompt, chunk => {
        resA += chunk;
        bodyA.setContent(renderMarkdown(resA));
        bodyA.setScrollPerc(100);
        queueRender();
      }),
      ollama.generateResponse(mB, prompt, chunk => {
        resB += chunk;
        bodyB.setContent(renderMarkdown(resB));
        bodyB.setScrollPerc(100);
        queueRender();
      }),
    ]);

    generating = false;
    showVoteButtons();
    refreshStatusBar();
    // Restore input focus after generation for quick follow-up prompts.
    if (previousFocus === inputField || previousFocus === bodyA || previousFocus === bodyB) {
      activeFocus = 'composer';
      applyFocusStyles();
      inputField.focus();
    }
    refreshStatusBar();
    queueRender();
  }

  function vote(choice: 'A' | 'B' | 'good' | 'bad') {
    if (generating || !resA || !resB) return;
    if (voteCast) return; // Already voted
    
    const [mA, mB] = selected;
    if      (choice === 'A')    { updateElo(mA, mB, false); highlightVote('A', btnA); }
    else if (choice === 'B')    { updateElo(mB, mA, false); highlightVote('B', btnB); }
    else if (choice === 'good') { updateElo(mA, mB, true);  highlightVote('good', btnGood); }
    else if (choice === 'bad')  {                           highlightVote('bad', btnBad); }
    
    voteCast = choice;
    showToast(`${A.green}✓${A.reset} Vote recorded`);
    refreshStatusBar();
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  KEY BINDINGS
  // ════════════════════════════════════════════════════════════════════════════

  inputField.on('keypress', (ch: any, key: any) => {
    if (inputPlaceholder.visible) {
      inputPlaceholder.hide();
      screen.render();
    }
    
    if (key.ctrl && key.name === 'c') process.exit(0);
    
    if (key.name === 'enter') {
      generate();
      return false;
    }
    if (key.name === 'escape') {
      return false;
    }
  });

  // Vote button clicks
  btnA.on('click', () => vote('A'));
  btnGood.on('click', () => vote('good'));
  btnBad.on('click', () => vote('bad'));
  btnB.on('click', () => vote('B'));

  // Global keys
  screen.key(['C-c'], () => process.exit(0));
  
  // Bottom row of input card
  const inputFooter = b.box({
    parent: inputCard,
    bottom: 0,
    left: 2,
    width: '100%-4',
    height: 1,
    content: `${A.blue}Build${A.reset}  ${A.white}Big Pickle${A.reset}  ${A.gray}OpenCode Zen${A.reset}`,
    style: { bg: C.bgInput, fg: C.textDim },
    hidden: true,
  });

  const statusBar = b.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: false,
    content: '',
    style: { bg: C.bgTop, fg: C.textDim },
  });

  const helpBar = b.box({
    parent: screen,
    bottom: 1,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: { bg: C.bgTop, fg: C.textDim },
    content: ` ${A.gray}Enter{/}  send   ${A.gray}Ctrl+Tab{/} focus   ${A.gray}[A/B]{/} vote   ${A.gray}[G]{/} tie-good   ${A.gray}[D]{/} tie-bad   ${A.gray}[R]{/} regen   ${A.gray}[N]{/} next   ${A.gray}Ctrl+C{/} quit`,
  });

  function refreshStatusBar() {
    const selectedLabel = selected.length ? selected.join(' vs ') : 'none';
    const phase = generating ? 'generating' : voteCast ? `voted:${voteCast}` : hasPrompted ? 'ready to vote' : 'idle';
    statusBar.setContent(` models:${models.length}  selected:${selectedLabel}  state:${phase}  focus:${activeFocus}  ctrl+c:quit `);
  }
  
  // Keyboard voting shortcuts (when not typing)
  screen.on('keypress', (ch: any, key: any) => {
    if (generating || !resA || screen.focused === inputField) return;
    if (key.ctrl) {
      if (key.name === 'e') generate();
      return;
    }
    if (key.name === 'a') vote('A');
    if (key.name === 'b') vote('B');
    if (key.name === 'g') vote('good');
    if (key.name === 'd') vote('bad');
    if (key.name === 'r') generate(); // regenerate
    if (key.name === 'n') { // next prompt - clear and focus input
      resA = ''; resB = ''; voteCast = '';
      bodyA.setContent(''); bodyB.setContent('');
      inBattleView = false;
      logoBox.show(); heroSubtitle.show(); inputHelpers.show();
      promptBubble.hide(); cardA.hide(); cardB.hide(); voteRow.hide();
      inputCard.top = undefined; inputCard.bottom = undefined; inputCard.width = '74%'; inputCard.height = 3;
      inputPrompt.show(); inputPlaceholder.show(); inputPlaceholder.setContent(`${A.bold}${A.white}Ask anything...${A.reset} ${A.gray}"Explain Bangalore meaning"{A.reset}`);
      refreshStatusBar();
      queueRender();
    }

    if (activeFocus === 'left') {
      if (key.name === 'j' || key.name === 'down') bodyA.scroll(2);
      if (key.name === 'k' || key.name === 'up') bodyA.scroll(-2);
    } else if (activeFocus === 'right') {
      if (key.name === 'j' || key.name === 'down') bodyB.scroll(2);
      if (key.name === 'k' || key.name === 'up') bodyB.scroll(-2);
    }
    queueRender();
  });

  // Ctrl+Tab to cycle focus
  screen.key(['C-Tab'], () => {
    if (!inBattleView) {
      activeFocus = 'composer';
      applyFocusStyles();
      inputField.focus();
      queueRender();
      return;
    }

    if (activeFocus === 'composer') {
      activeFocus = 'left';
      bodyA.focus();
    } else if (activeFocus === 'left') {
      activeFocus = 'right';
      bodyB.focus();
    } else {
      activeFocus = 'composer';
      inputField.focus();
    }
    applyFocusStyles();
    refreshStatusBar();
    queueRender();
  });

  screen.key(['tab'], () => {
    if (!inBattleView) {
      activeFocus = 'composer';
      applyFocusStyles();
      inputField.focus();
      queueRender();
      return;
    }

    if (activeFocus === 'composer') {
      activeFocus = 'left';
      bodyA.focus();
    } else if (activeFocus === 'left') {
      activeFocus = 'right';
      bodyB.focus();
    } else {
      activeFocus = 'composer';
      inputField.focus();
    }
    applyFocusStyles();
    refreshStatusBar();
    queueRender();
  });

  screen.on('resize', () => {
    applyResponsiveLayout();
    queueRender();
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  LAUNCH
  // ════════════════════════════════════════════════════════════════════════════
  await loadModels();
  applyResponsiveLayout();

  // Update top bar with model count
  topBar.setContent(` {bold}LLMRing{/bold} {${C.textMuted}-fg}:{/} {bold}LLM Battleground{/bold}  {${C.textMuted}-fg}•{/}  ${models.length > 0 ? `{${C.textDim}-fg}${models.length} models ready{/}` : `{red-fg}No models{/}`}`);
  refreshStatusBar();

  inputField.focus();
  applyFocusStyles();
  screen.render();
}
