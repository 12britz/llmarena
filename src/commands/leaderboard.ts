import { getLeaderboard, resetElo } from '../utils/storage';
import { printLeaderboard, printBanner, printSuccess, printInfo } from '../utils/ui';
import inquirer from 'inquirer';

export async function leaderboardCommand(): Promise<void> {
  const leaderboard = getLeaderboard();
  printLeaderboard(leaderboard);

  // Only show actions if running interactively
  if (process.stdout.isTTY) {
    try {
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'Actions:',
          choices: [
            { name: 'View again', value: 'view' },
            { name: 'Reset leaderboard', value: 'reset' },
            { name: 'Exit', value: 'exit' },
          ],
        },
      ]);

      if (answer.action === 'reset') {
        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'sure',
            message: 'Are you sure you want to reset the leaderboard? This cannot be undone.',
            default: false,
          },
        ]);

        if (confirm.sure) {
          resetElo();
          printSuccess('Leaderboard has been reset.');
        }
      }
    } catch {
      printInfo('Exiting...');
    }
  }
}
