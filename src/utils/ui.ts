import chalk from 'chalk';
import { ArenaResult, ModelElo } from '../types';

const BORDER_WIDTH = 60;

function repeat(char: string, times: number): string {
  return char.repeat(times);
}

export function printBanner(title: string): void {
  const border = repeat('═', BORDER_WIDTH);
  console.log();
  console.log(chalk.bold.cyan('╔' + border + '╗'));
  const padding = Math.floor((BORDER_WIDTH - title.length) / 2);
  const rightPadding = BORDER_WIDTH - title.length - padding;
  console.log(chalk.bold.cyan('║') + ' '.repeat(padding) + chalk.bold.white(title) + ' '.repeat(rightPadding) + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('╚' + border + '╝'));
  console.log();
}

export function printSection(title: string): void {
  const border = repeat('─', BORDER_WIDTH);
  console.log();
  console.log(chalk.cyan.bold('┌─ ' + title + ' ' + repeat('─', BORDER_WIDTH - title.length - 4) + '─┐'));
}

export function printSectionEnd(): void {
  const border = repeat('─', BORDER_WIDTH);
  console.log(chalk.cyan('└' + border + '┘'));
}

export function printModelResult(
  label: string,
  result: ArenaResult,
  showName: boolean = true
): void {
  const name = showName ? result.modelName : label;
  const header = `${label} (${name})`;
  const stats = `⏱ ${result.totalTime}s | 🎯 ${result.tokensPerSecond} tok/s | ↓${result.inputTokens} ↑${result.outputTokens}`;
  
  console.log();
  console.log(chalk.bold.cyan('─'.repeat(BORDER_WIDTH)));
  console.log(chalk.bold.white(header) + ' '.repeat(Math.max(0, BORDER_WIDTH - header.length - stats.length)) + chalk.dim(stats));
  console.log(chalk.bold.cyan('─'.repeat(BORDER_WIDTH)));
  
  // Word wrap the response to fit within border
  const maxWidth = BORDER_WIDTH - 4;
  const lines = result.response.split('\n');
  
  for (const line of lines) {
    if (line.length <= maxWidth) {
      console.log(chalk.white('  ' + line));
    } else {
      // Word wrap
      const words = line.split(' ');
      let currentLine = '  ';
      for (const word of words) {
        if ((currentLine + word).length > maxWidth + 2) {
          console.log(chalk.white(currentLine));
          currentLine = '  ' + word + ' ';
        } else {
          currentLine += word + ' ';
        }
      }
      if (currentLine.trim().length > 0) {
        console.log(chalk.white(currentLine));
      }
    }
  }
}

export function printVotePrompt(): void {
  console.log();
  console.log(chalk.bold.cyan('═'.repeat(BORDER_WIDTH)));
  console.log(chalk.bold.white('Which response was better?'));
  console.log(chalk.dim('  [A/B/C/D] Vote for a model'));
  console.log(chalk.dim('  [T] Tie'));
  console.log(chalk.dim('  [Q] Quit without voting'));
  console.log(chalk.bold.cyan('═'.repeat(BORDER_WIDTH)));
}

export function printLeaderboard(rankings: ModelElo[]): void {
  console.log();
  printBanner('LEADERBOARD');
  
  if (rankings.length === 0) {
    console.log(chalk.dim('  No matches recorded yet. Start an arena session!'));
    console.log();
    return;
  }

  console.log(chalk.bold.cyan('┌────┬─────────────────────────┬────────┬─────┬───────┐'));
  console.log(chalk.bold.cyan('│') + chalk.bold.white(' #  ') + chalk.bold.cyan('│') + chalk.bold.white(' Model                       ') + chalk.bold.cyan('│') + chalk.bold.white('  Elo  ') + chalk.bold.cyan('│') + chalk.bold.white(' W-L-T ') + chalk.bold.cyan('│') + chalk.bold.white(' Games ') + chalk.bold.cyan('│'));
  console.log(chalk.bold.cyan('├────┼─────────────────────────┼────────┼─────┼───────┤'));
  
  rankings.forEach((model, index) => {
    const rank = String(index + 1).padStart(3);
    const name = model.name.substring(0, 25).padEnd(25);
    const elo = String(model.elo).padStart(6);
    const record = `${model.wins}-${model.losses}-${model.ties}`.padStart(5);
    const games = String(model.matches).padStart(5);
    
    const row = `│${chalk.white(rank)} │${chalk.white(name)} │${chalk.yellow(elo)} │${chalk.white(record)} │${chalk.dim(games)} │`;
    console.log(row);
  });
  
  console.log(chalk.bold.cyan('└────┴─────────────────────────┴────────┴─────┴───────┘'));
  console.log();
}

export function printCategories(): void {
  console.log(chalk.bold.cyan('Available categories:'));
  console.log(chalk.white('  code     ') + chalk.dim('- Coding challenges'));
  console.log(chalk.white('  math     ') + chalk.dim('- Math problems'));
  console.log(chalk.white('  reasoning') + chalk.dim('- Logic puzzles'));
  console.log(chalk.white('  creative ') + chalk.dim('- Writing tasks'));
  console.log(chalk.white('  general  ') + chalk.dim('- General questions'));
  console.log();
}

export function printError(message: string): void {
  console.log(chalk.red(`Error: ${message}`));
}

export function printSuccess(message: string): void {
  console.log(chalk.green(message));
}

export function printInfo(message: string): void {
  console.log(chalk.dim(message));
}

export function clearScreen(): void {
  console.clear();
}
