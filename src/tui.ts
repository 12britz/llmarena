import * as readline from 'readline';
import { ollama } from './utils/ollama';
import { updateElo, saveSession } from './utils/storage';
import { PROMPT_LIBRARY } from './types';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const models: string[] = [];
let selectedModels: string[] = [];
let blindMode = false;
let promptIndex = 0;

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  black: '\x1b[30m',
};

function clear(): void {
  console.clear();
}

function header(): void {
  console.log(`${c.cyan}${c.bold}
   _    ____   ____ ___ ___ 
  /\\  |  _ \\ / ___|_ _|_ _|
 /  \\ | |_) | |    | | | | 
/ /\\ \\|  _ <| |___ | | | | 
/ ____ \\|_) \\\\____|___|___|
/_/    \\_\\\\_\\\\/
${c.reset}${c.gray}Local LLM Arena - Compare local models${c.reset}\n`);
}

function printModels(): void {
  const labels = ['A', 'B', 'C', 'D'];
  console.log(`${c.cyan}┌─ Models ─────────────────────────────────────┐${c.reset}`);
  
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const idx = selectedModels.indexOf(m);
    const sel = idx >= 0 ? `${c.green}◉` : `${c.gray}○`;
    const label = idx >= 0 ? `${c.yellow}[${labels[idx]}]` : '   ';
    const name = m.length > 35 ? m.substring(0, 32) + '...' : m;
    console.log(`  ${sel} ${label} ${c.white}${name}${c.reset}`);
  }
  
  console.log(`${c.cyan}└──────────────────────────────────────────────────┘${c.reset}`);
  console.log(`${c.gray}Selected: ${c.reset}${c.white}${selectedModels.length}${c.reset} | ${c.gray}Blind: ${blindMode ? c.red + 'ON' : c.gray + 'OFF'}${c.reset}`);
}

async function listModels(): Promise<void> {
  clear();
  header();
  console.log(`${c.yellow}Checking Ollama...${c.reset}\n`);
  
  const connected = await ollama.checkConnection();
  if (!connected) {
    console.log(`${c.red}✖ Cannot connect to Ollama${c.reset}`);
    console.log(`${c.gray}Make sure Ollama is running: ${c.green}ollama serve${c.reset}`);
    rl.close();
    return;
  }
  
  const available = await ollama.listModels();
  models.length = 0;
  models.push(...available.map(m => m.name));
  
  if (models.length >= 2) {
    selectedModels = [models[0], models[1]];
  }
  
  clear();
  header();
  printModels();
  console.log();
}

async function runArena(prompt: string): Promise<void> {
  if (selectedModels.length < 2) {
    console.log(`${c.red}Select at least 2 models first!${c.reset}`);
    return;
  }
  
  clear();
  header();
  console.log(`${c.blue}${c.bold} You ${c.reset}\n${prompt}\n`);
  console.log(`${c.cyan}Generating responses from ${selectedModels.length} models...${c.reset}\n`);
  
  const labels = ['A', 'B', 'C', 'D'];
  const responses: Map<string, { text: string; done: boolean }> = new Map();
  
  for (const model of selectedModels) {
    responses.set(model, { text: '', done: false });
  }
  
  await Promise.all(
    selectedModels.map(async (model) => {
      try {
        await ollama.generateResponse(model, prompt, (chunk) => {
          const resp = responses.get(model)!;
          resp.text += chunk;
        });
        responses.get(model)!.done = true;
      } catch (error: any) {
        responses.get(model)!.text = `Error: ${error.message}`;
        responses.get(model)!.done = true;
      }
    })
  );
  
  clear();
  header();
  
  for (let i = 0; i < selectedModels.length; i++) {
    const model = selectedModels[i];
    const resp = responses.get(model)!;
    const label = labels[i];
    const name = blindMode ? label : model;
    
    console.log(`${c.green}${c.bold}[${label}] ${name}${c.reset} ${resp.done ? c.green + '✓' : c.cyan + '○'}${c.reset}`);
    console.log(`${c.gray}${'─'.repeat(50)}${c.reset}`);
    
    const lines = resp.text.split('\n').slice(0, 15);
    for (const line of lines) {
      console.log(`  ${line.substring(0, 100)}`);
    }
    
    if (resp.text.split('\n').length > 15) {
      console.log(`  ${c.dim}(+${resp.text.split('\n').length - 15} more lines)${c.reset}`);
    }
    console.log();
  }
  
  console.log(`${c.yellow}${c.bold}VOTE${c.reset} ${c.white}Which was better?${c.reset}`);
  console.log(`  ${c.yellow}[A/B/C/D]${c.reset} vote | ${c.gray}[T]${c.reset} tie | ${c.gray}[N]${c.reset} next | ${c.gray}[R]${c.reset} regen | ${c.gray}[Q]${c.reset} quit\n`);
  
  const vote = await question(`${c.cyan}>${c.reset} `);
  const voteLabels = ['a', 'b', 'c', 'd'];
  
  if (voteLabels.includes(vote.toLowerCase())) {
    const idx = voteLabels.indexOf(vote.toLowerCase());
    if (idx < selectedModels.length) {
      const winner = selectedModels[idx];
      
      if (selectedModels.length === 2) {
        const loser = selectedModels.find(m => m !== winner)!;
        updateElo(winner, loser, false);
      }
      
      console.log(`${c.green}✓ Vote recorded for ${blindMode ? voteLabels[idx].toUpperCase() : winner}${c.reset}`);
      
      saveSession({
        id: Date.now().toString(36),
        prompt,
        results: selectedModels.map(m => ({
          modelId: m,
          modelName: m,
          response: responses.get(m)!.text,
          tokensPerSecond: 0,
          totalTime: 0,
          inputTokens: 0,
          outputTokens: 0,
        })),
        votes: [{ prompt, winnerId: winner, isTie: false, timestamp: Date.now() }],
        timestamp: Date.now(),
      });
    }
  } else if (vote.toLowerCase() === 't') {
    if (selectedModels.length === 2) {
      updateElo(selectedModels[0], selectedModels[1], true);
    }
    console.log(`${c.yellow}Tie recorded${c.reset}`);
  }
}

function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

export async function main(): Promise<void> {
  await listModels();
  
  console.log(`${c.gray}Type a prompt and press Enter, or command:${c.reset}`);
  console.log(`  ${c.gray}[m]${c.reset} toggle models  ${c.gray}[b]${c.reset} blind mode  ${c.gray}[n]${c.reset} next prompt  ${c.gray}[q]${c.reset} quit\n`);
  
  while (true) {
    const input = await question(`${c.cyan}>${c.reset} `);
    const cmd = input.trim().toLowerCase();
    
    if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
      console.log(`${c.gray}Goodbye!${c.reset}`);
      rl.close();
      break;
    }
    
    if (cmd === 'm') {
      console.log(`${c.yellow}Enter model number to toggle (0-${models.length - 1}):${c.reset}`);
      const num = await question(`${c.cyan}>${c.reset} `);
      const idx = parseInt(num);
      if (idx >= 0 && idx < models.length) {
        const model = models[idx];
        const sidx = selectedModels.indexOf(model);
        if (sidx >= 0) {
          selectedModels.splice(sidx, 1);
        } else if (selectedModels.length < 4) {
          selectedModels.push(model);
        }
      }
      clear();
      header();
      printModels();
      console.log();
      continue;
    }
    
    if (cmd === 'b') {
      blindMode = !blindMode;
      clear();
      header();
      printModels();
      console.log();
      continue;
    }
    
    if (cmd === 'n') {
      promptIndex = (promptIndex + 1) % PROMPT_LIBRARY.length;
      const p = PROMPT_LIBRARY[promptIndex];
      console.log(`${c.gray}Prompt ${promptIndex + 1}: ${c.reset}${c.white}${p.category} - ${p.name}${c.reset}`);
      console.log(`  ${c.dim}${p.text}${c.reset}\n`);
      await runArena(p.text);
      continue;
    }
    
    if (input.trim()) {
      await runArena(input.trim());
    }
  }
}
