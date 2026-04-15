# LLMRing

```
LLMRing

Local Model Arena
```

Compare **local LLMs** head-to-head in a fast, keyboard-first terminal arena.

`llmring` brings side-by-side model evaluation to your terminal with streaming responses, blind voting, and Elo-based rankings.

![LLMRing Demo](https://via.placeholder.com/1200x600?text=LLMRing+TUI)

## Why Use It

- Compare **2-6 local models** on the same prompt
- Stream responses in real time to judge quality and speed
- Run **blind evaluations** to reduce model-name bias
- Vote winners instantly and build an **Elo leaderboard**
- Stay in flow with full keyboard navigation

## Features

- **Terminal-native UX**: interactive, chat-style TUI
- **Live generation**: token streaming while models respond
- **Blind mode**: hide model names during evaluation
- **Flexible voting**: vote by label (`A-F`) or mark a tie
- **Persistent stats**: sessions, votes, and Elo saved locally
- **Prompt loop**: iterate quickly with next/regenerate controls

## Prerequisites

- Node.js 14 or later
- [Ollama](https://ollama.com) installed and running

## Install

```bash
git clone https://github.com/12britz/llmring.git
cd llmring
npm install
npm run build
npm link
```

## Quick Start

```bash
# Launch the TUI
llmring start

# Optional helpers
llmring list
llmring leaderboard
```

## Usage Flow

1. Run `llmring start`
2. Select models from the top bar (click to cycle)
3. Enter a prompt in the input box
4. Press `Ctrl+E` to generate responses
5. Vote (`A`/`B`) or mark tie (`G`/`D`)
6. Continue with `N` (next) or `R` (regenerate)

## Controls

| Key | Action |
| --- | --- |
| `Ctrl+E` | Send prompt |
| `Ctrl+Tab` | Cycle focus |
| `A` / `B` | Vote for model |
| `G` | Tie (good) |
| `D` | Tie (bad) |
| `R` | Regenerate responses |
| `N` | Next / Reset |
| `Ctrl+C` | Quit |

## Data Storage

Local data is stored in:

- `~/.llmring/sessions.json`
- `~/.llmring/votes.json`
- `~/.llmring/elo.json`

## Interface Layout

```text
┌─────────────────────────────────────────────────────────────┐
│                        LLMRing TUI                         │
├──────────────┬─────────────────────────────────────────────┤
│ Models       │ Response Panels                             │
│ Sidebar      │ ┌─────────────────────────────────────────┐ │
│              │ │ [A] Model A                             │ │
│ [x] llama3   │ │ Response from model A...                │ │
│ [ ] qwen2.5  │ └─────────────────────────────────────────┘ │
│ [x] mistral  │ ┌─────────────────────────────────────────┐ │
│ [ ] gemma2   │ │ [B] Model B                             │ │
│              │ │ Response from model B...                │ │
│              │ └─────────────────────────────────────────┘ │
├──────────────┴─────────────────────────────────────────────┤
│ [Type your prompt here...]                                 │
├─────────────────────────────────────────────────────────────┤
│ [A-F] Vote | [T] Tie | [N] Next | [R] Regen | [B] | [Q]   │
└─────────────────────────────────────────────────────────────┘
```

## License

MIT
