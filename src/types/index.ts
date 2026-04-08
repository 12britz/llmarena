export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
}

export interface ArenaResult {
  modelId: string;
  modelName: string;
  response: string;
  tokensPerSecond: number;
  totalTime: number;
  inputTokens: number;
  outputTokens: number;
}

export interface Vote {
  prompt: string;
  winnerId: string;
  loserId?: string;
  isTie: boolean;
  timestamp: number;
}

export interface ModelElo {
  name: string;
  elo: number;
  wins: number;
  losses: number;
  ties: number;
  matches: number;
}

export interface Session {
  id: string;
  prompt: string;
  results: ArenaResult[];
  votes: Vote[];
  timestamp: number;
}

export interface Prompt {
  category: string;
  name: string;
  text: string;
}

export const PROMPT_LIBRARY: Prompt[] = [
  // Code
  {
    category: 'code',
    name: 'Reverse Linked List',
    text: 'Write a Python function to reverse a singly linked list.'
  },
  {
    category: 'code',
    name: 'Binary Search',
    text: 'Implement binary search in JavaScript for a sorted array.'
  },
  {
    category: 'code',
    name: 'API Endpoint',
    text: 'Write a REST API endpoint in Express.js to create and retrieve users.'
  },
  {
    category: 'code',
    name: 'Bug Fix',
    text: 'Find and fix the bug in this Python code: def find_max(arr): max = 0; for i in arr: if i > max: max = i; return max'
  },
  {
    category: 'code',
    name: 'Unit Test',
    text: 'Write unit tests for a function that checks if a string is a palindrome.'
  },
  // Math
  {
    category: 'math',
    name: 'Algebra',
    text: 'Solve for x: 2x + 5 = 15'
  },
  {
    category: 'math',
    name: 'Percentage',
    text: 'What is 15% of 240? Show your work.'
  },
  {
    category: 'math',
    name: 'Statistics',
    text: 'Calculate the mean, median, and mode of: 5, 10, 15, 10, 20, 25, 10'
  },
  // Reasoning
  {
    category: 'reasoning',
    name: 'Logic Puzzle',
    text: 'If all roses are flowers and some flowers fade quickly, can we conclude that some roses fade quickly?'
  },
  {
    category: 'reasoning',
    name: 'Syllogism',
    text: 'Premise 1: All cats are mammals. Premise 2: All mammals need oxygen. Conclusion: ?'
  },
  {
    category: 'reasoning',
    name: 'Pattern',
    text: 'What comes next in this sequence: 2, 6, 12, 20, 30, ?'
  },
  // Creative
  {
    category: 'creative',
    name: 'Story Opening',
    text: 'Write the opening paragraph of a mystery story set in a lighthouse.'
  },
  {
    category: 'creative',
    name: 'Poem',
    text: 'Write a haiku about artificial intelligence.'
  },
  {
    category: 'creative',
    name: 'Dialogue',
    text: 'Write a dialogue between a robot discovering emotions for the first time and a human.'
  },
  // General
  {
    category: 'general',
    name: 'Summarize',
    text: 'Summarize the concept of blockchain technology in 2-3 sentences.'
  },
  {
    category: 'general',
    name: 'Explain',
    text: 'Explain the difference between SQL and NoSQL databases.'
  },
  {
    category: 'general',
    name: 'Compare',
    text: 'Compare and contrast renewable and non-renewable energy sources.'
  }
];
