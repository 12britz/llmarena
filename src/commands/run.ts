import chalk from 'chalk';
import { ollama } from '../utils/ollama';
import { printBanner, printModelResult, printError, printInfo } from '../utils/ui';
import { ArenaResult } from '../types';

interface RunOptions {
  models?: string[];
  blind?: boolean;
}

export async function runCommand(prompt: string, options: RunOptions): Promise<void> {
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
    // Use first available model
    selectedModels = [modelNames[0]];
  }

  // Run the models
  console.clear();
  printBanner('LLM RUN');
  console.log(chalk.bold.white('Prompt:'));
  console.log(chalk.white(`  ${prompt}`));
  console.log();
  console.log(chalk.bold.cyan(`Running ${selectedModels.length} model(s)...`));
  console.log();

  const results: ArenaResult[] = [];
  const labels = ['A', 'B', 'C', 'D', 'E', 'F'];

  for (let i = 0; i < selectedModels.length; i++) {
    const model = selectedModels[i];
    console.log(chalk.cyan(`[${labels[i]}] ${model}...`));
    
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
  printBanner('RESULTS');
  console.log(chalk.bold.white('Prompt:'));
  console.log(chalk.white(`  ${prompt}`));
  console.log();

  for (let i = 0; i < results.length; i++) {
    printModelResult(labels[i], results[i], !options.blind);
  }

  console.log();
}
