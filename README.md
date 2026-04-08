# Local LLM Arena

A beautiful CLI tool for comparing local LLM models side-by-side, inspired by LLM Arena. Features blind evaluation, voting, and Elo rankings.

## Features

- **Arena Mode**: Submit a prompt and see responses from multiple models simultaneously
- **Blind Evaluation**: Hide model names to eliminate bias and judge purely on output quality
- **Voting System**: Vote for the best response and track your preferences
- **Elo Rankings**: Track model performance over time with Elo ratings
- **Categories**: Pre-built prompts for code, math, reasoning, creative, and general tasks
- **Leaderboard**: View and compare model rankings
- **Beautiful UI**: Rich terminal output matching sysview aesthetic

## Prerequisites

- Node.js 14+
- [Ollama](https://ollama.com) installed and running

## Installation

```bash
# Clone the repository
git clone https://github.com/12britz/llmarena.git
cd llmarena

# Install dependencies
npm install

# Build
npm run build

# Link globally (optional)
npm link
```

## Usage

### List Available Models
```bash
llmarena list
```

### Start Arena Mode
```bash
llmarena arena
```

### Arena with Specific Models
```bash
llmarena arena -m llama3.2 qwen2.5 mistral
```

### Arena with Blind Evaluation
```bash
llmarena arena --blind
```

### Arena with Category
```bash
llmarena arena -c code
```

### Run a Custom Prompt
```bash
llmarena run "Write a fibonacci function in Python" -m llama3.2 qwen2.5
```

### View Leaderboard
```bash
llmarena leaderboard
```

## Commands

| Command | Description |
|---------|-------------|
| `llmarena arena` | Start interactive arena mode |
| `llmarena arena -m <models>` | Arena with specific models |
| `llmarena arena --blind` | Arena with hidden model names |
| `llmarena arena -c <category>` | Arena with specific category |
| `llmarena run <prompt>` | Run prompt across models |
| `llmarena leaderboard` | View Elo rankings |
| `llmarena list` | List available Ollama models |

## Categories

- `code` - Coding challenges and tasks
- `math` - Math problems
- `reasoning` - Logic puzzles
- `creative` - Writing tasks
- `general` - General questions

## How It Works

1. **Select Models**: Choose 2-6 models to compare
2. **Choose Prompt**: Pick from library categories or enter custom
3. **View Responses**: See all models' responses side-by-side
4. **Vote**: Choose the best response (blind or revealed)
5. **Track Progress**: Elo ratings update based on your votes

## Data Storage

Elo ratings and session history are stored in:
- `~/.llmarena/sessions.json`
- `~/.llmarena/votes.json`
- `~/.llmarena/elo.json`

## License

MIT
