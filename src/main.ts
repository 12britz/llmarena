#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { main } from './tui';
import { leaderboardCommand } from './commands/leaderboard';
import { listCommand } from './commands/list';

const program = new Command();

program
  .name('llmarena')
  .description(chalk.cyan('Local LLM Arena - Compare local models side-by-side'))
  .version('1.0.0');

program
  .command('start')
  .description('Start the arena mode')
  .action(() => {
    main();
  });

program
  .command('leaderboard')
  .description('View Elo rankings of models')
  .action(leaderboardCommand);

program
  .command('list')
  .description('List available models from Ollama')
  .action(listCommand);

program.parse(process.argv);
