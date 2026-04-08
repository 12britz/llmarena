import chalk from 'chalk';
import { ollama } from '../utils/ollama';
import { printBanner, printError, printInfo } from '../utils/ui';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

export async function listCommand(): Promise<void> {
  printInfo('Checking Ollama connection...');
  const connected = await ollama.checkConnection();
  if (!connected) {
    printError('Cannot connect to Ollama. Make sure Ollama is running (ollama serve)');
    process.exit(1);
  }

  printInfo('Fetching models...');
  const models = await ollama.listModels();

  printBanner('AVAILABLE MODELS');

  if (models.length === 0) {
    console.log(chalk.dim('  No models found. Pull some models:'));
    console.log(chalk.dim('    ollama pull llama3.2'));
    console.log(chalk.dim('    ollama pull qwen2.5'));
    console.log(chalk.dim('    ollama pull mistral'));
    console.log();
    return;
  }

  console.log(chalk.bold.cyan('┌───────────────────────────────┬───────────────┐'));
  console.log(chalk.bold.cyan('│ Model                         │ Size          │'));
  console.log(chalk.bold.cyan('├───────────────────────────────┼───────────────┤'));
  
  for (const model of models) {
    const name = model.name.padEnd(29);
    const size = formatBytes(model.size).padEnd(13);
    console.log(chalk.cyan('│') + chalk.white(name) + chalk.cyan('│') + chalk.dim(size) + chalk.cyan('│'));
  }
  
  console.log(chalk.bold.cyan('└───────────────────────────────┴───────────────┘'));
  console.log();
  console.log(chalk.dim(`  Total: ${models.length} model(s)`));
  console.log();
}
