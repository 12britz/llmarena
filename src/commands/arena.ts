import chalk from 'chalk';
import inquirer from 'inquirer';
import { ollama } from '../utils/ollama';
import { saveSession, updateElo, getLeaderboard } from '../utils/storage';
import { printBanner, printModelResult, printVotePrompt, printCategories, printError, printInfo, printSuccess } from '../utils/ui';
import { Session, ArenaResult, PROMPT_LIBRARY } from '../types';

interface ArenaOptions {
  models?: string[];
  blind?: boolean;
  category?: string;
}

export async function arenaCommand(options: ArenaOptions): Promise<void> {
  // Check Ollama connection
  printInfo('Checking Ollama connection...');
  const connected = await ollama.checkConnection();
  if (!connected) {
    printError('Cannot connect to Ollama. Make sure Ollama is running (ollama serve)');
    process.exit(1);
  }

  // Get available models
  const availableModels = await ollama.listModels();
  if (availableModels.length === 0) {
    printError('No models found. Please pull some models first: ollama pull llama3.2');
    process.exit(1);
  }

  const modelNames = availableModels.map(m => m.name);

  // Select models
  let selectedModels: string[];
  if (options.models && options.models.length > 0) {
    selectedModels = options.models.filter(m => modelNames.includes(m));
    if (selectedModels.length === 0) {
      printError('None of the specified models are available');
      process.exit(1);
    }
  } else {
    const answer = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedModels',
        message: 'Select models to compare (2-4 recommended)',
        choices: modelNames,
        validate: (input: string[]) => {
          if (input.length < 2) return 'Select at least 2 models';
          if (input.length > 6) return 'Maximum 6 models at once';
          return true;
        },
      },
    ]);
    selectedModels = answer.selectedModels;
  }

  // Select category or custom prompt
  let prompt: string;
  let categoryName: string;

  if (options.category) {
    const categoryPrompts = PROMPT_LIBRARY.filter(p => p.category === options.category);
    if (categoryPrompts.length === 0) {
      printError(`No prompts found for category: ${options.category}`);
      printCategories();
      process.exit(1);
    }
    const randomPrompt = categoryPrompts[Math.floor(Math.random() * categoryPrompts.length)];
    prompt = randomPrompt.text;
    categoryName = randomPrompt.name;
  } else {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Choose a prompt type:',
        choices: [
          { name: 'Random from library (code, math, reasoning, creative)', value: 'random' },
          { name: 'Code challenges', value: 'code' },
          { name: 'Math problems', value: 'math' },
          { name: 'Reasoning puzzles', value: 'reasoning' },
          { name: 'Creative writing', value: 'creative' },
          { name: 'General questions', value: 'general' },
          { name: 'Custom prompt', value: 'custom' },
        ],
      },
    ]);

    if (answer.choice === 'custom') {
      const customAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'prompt',
          message: 'Enter your prompt:',
          validate: (input: string) => input.length > 0 || 'Prompt cannot be empty',
        },
      ]);
      prompt = customAnswer.prompt;
      categoryName = 'custom';
    } else if (answer.choice === 'random') {
      const randomPrompt = PROMPT_LIBRARY[Math.floor(Math.random() * PROMPT_LIBRARY.length)];
      prompt = randomPrompt.text;
      categoryName = `${randomPrompt.category}: ${randomPrompt.name}`;
    } else {
      const categoryPrompts = PROMPT_LIBRARY.filter(p => p.category === answer.choice);
      const promptChoice = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedPrompt',
          message: 'Select a prompt:',
          choices: categoryPrompts.map(p => ({ name: p.name, value: p.text })),
        },
      ]);
      prompt = promptChoice.selectedPrompt;
      categoryName = answer.choice;
    }
  }

  // Run the arena
  console.clear();
  printBanner('LLM ARENA');
  console.log(chalk.dim(`Category: ${categoryName}`));
  console.log();
  console.log(chalk.bold.white('Prompt:'));
  console.log(chalk.white(`  ${prompt}`));
  console.log();
  console.log(chalk.bold.cyan(`Running ${selectedModels.length} models...`));
  console.log();

  // Generate responses
  const results: ArenaResult[] = [];
  const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
  
  // Shuffle models for blind mode
  const shuffledModels = [...selectedModels];
  if (options.blind) {
    shuffleArray(shuffledModels);
  }

  for (let i = 0; i < shuffledModels.length; i++) {
    const model = shuffledModels[i];
    console.log(chalk.cyan(`[${labels[i]}] ${options.blind ? 'Model' : model}...`));
    
    try {
      const result = await ollama.generateResponse(model, prompt);
      result.modelId = options.blind ? labels[i] : model;
      result.modelName = model;
      results.push(result);
    } catch (error) {
      printError(`Failed to get response from ${model}: ${error}`);
    }
  }

  // Display results
  console.clear();
  printBanner('LLM ARENA - RESULTS');
  console.log(chalk.bold.white('Prompt:'));
  console.log(chalk.white(`  ${prompt}`));
  console.log();

  for (let i = 0; i < results.length; i++) {
    printModelResult(labels[i], results[i], !options.blind);
  }

  // Voting
  printVotePrompt();

  const voteAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'vote',
      message: 'Your vote:',
      choices: [
        ...results.map((r, i) => ({ name: `[${labels[i]}] ${options.blind ? 'Model' : ''} ${r.modelName}`, value: r.modelId })),
        { name: '[T] Tie', value: 'tie' },
        { name: '[Q] Quit (no vote)', value: 'quit' },
      ],
    },
  ]);

  if (voteAnswer.vote === 'quit') {
    console.log(chalk.dim('Session ended without voting.'));
    return;
  }

  // Record vote and update Elo
  const winnerResult = results.find(r => r.modelId === voteAnswer.vote);
  const isTie = voteAnswer.vote === 'tie';

  if (!isTie && winnerResult && results.length === 2) {
    const loserResult = results.find(r => r.modelId !== voteAnswer.vote);
    if (loserResult) {
      updateElo(winnerResult.modelName, loserResult.modelName, false);
      printSuccess(`Vote recorded! ${winnerResult.modelName} wins.`);
    }
  } else if (!isTie) {
    // For 3+ models, record the vote without Elo for now
    printSuccess(`Vote recorded for model ${voteAnswer.vote}!`);
  } else {
    // Tie
    if (results.length === 2) {
      updateElo(results[0].modelName, results[1].modelName, true);
    }
    printSuccess('Tie recorded!');
  }

  // Save session
  const session: Session = {
    id: generateId(),
    prompt,
    results,
    votes: [{
      prompt,
      winnerId: voteAnswer.vote,
      isTie,
      timestamp: Date.now(),
    }],
    timestamp: Date.now(),
  };
  saveSession(session);

  // Show updated leaderboard
  console.log();
  const leaderboard = getLeaderboard();
  printBanner('UPDATED LEADERBOARD');
  console.log(chalk.bold.cyan('┌────┬─────────────────────────┬────────┐'));
  console.log(chalk.bold.cyan('│') + chalk.bold.white(' #  ') + chalk.bold.cyan('│') + chalk.bold.white(' Model                       ') + chalk.bold.cyan('│') + chalk.bold.white('  Elo  ') + chalk.bold.cyan('│'));
  console.log(chalk.bold.cyan('├────┼─────────────────────────┼────────┤'));
  
  leaderboard.slice(0, 5).forEach((model, index) => {
    const rank = String(index + 1).padStart(3);
    const name = model.name.substring(0, 25).padEnd(25);
    const elo = String(model.elo).padStart(6);
    console.log(chalk.cyan('│') + chalk.white(rank) + ' ' + chalk.cyan('│') + chalk.white(name) + chalk.cyan('│') + chalk.yellow(elo) + ' ' + chalk.cyan('│'));
  });
  console.log(chalk.bold.cyan('└────┴─────────────────────────┴────────┘'));
  console.log();
}

function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
