#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { arenaCommand } from './commands/arena';
import { leaderboardCommand } from './commands/leaderboard';
import { listCommand } from './commands/list';
import { runCommand } from './commands/run';

const program = new Command();

program
  .name('llmarena')
  .description(chalk.cyan('Local LLM Arena - Compare local models side-by-side'))
  .version('1.0.0');

program
  .command('arena')
  .description('Start interactive arena mode - compare multiple models')
  .option('-m, --models <models...>', 'Specific models to compare')
  .option('-b, --blind', 'Hide model names during evaluation')
  .option('-c, --category <category>', 'Prompt category (code, math, reasoning, creative, general)')
  .action(arenaCommand);

program
  .command('leaderboard')
  .description('View Elo rankings of models')
  .action(leaderboardCommand);

program
  .command('list')
  .description('List available models from Ollama')
  .action(listCommand);

program
  .command('run <prompt>')
  .description('Run a single prompt across models')
  .option('-m, --models <models...>', 'Specific models to use')
  .option('-b, --blind', 'Hide model names')
  .action(runCommand);

program.parse(process.argv);
