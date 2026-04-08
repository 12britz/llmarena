# Local LLM Arena

A beautiful **TUI (Terminal User Interface)** for comparing local LLM models side-by-side, inspired by LLM Arena. Features interactive chat-like experience, blind evaluation, voting, and Elo rankings.

![LLM Arena Demo](https://via.placeholder.com/800x400?text=Local+LLM+Arena+TUI)

## Features

- **Interactive TUI**: Chat-like interface for comparing models
- **Real-time Streaming**: Watch model responses as they're generated
- **Blind Evaluation**: Hide model names to eliminate bias
- **Voting System**: Vote for the best response
- **Elo Rankings**: Track model performance over time
- **Keyboard Shortcuts**: Full keyboard navigation
- **Multi-model Comparison**: Compare 2-6 models simultaneously

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

# Link globally
npm link
```

## Quick Start

```bash
# Start the TUI
llmarena start

# List available models
llmarena list

# View leaderboard
llmarena leaderboard
```

## TUI Controls

| Key | Action |
|-----|--------|
| `Click` | Toggle model selection |
| `Enter` | Run arena with selected models |
| `A/B/C` | Vote for model A/B/C |
| `T` | Record a tie |
| `N` | Next prompt |
| `R` | Regenerate responses |
| `B` | Toggle blind mode |
| `Q` / `Esc` | Quit |

## How to Use

1. **Start**: Run `llmarena start`
2. **Select Models**: Click on models in the left panel (or they'll auto-select)
3. **Enter Prompt**: Type your prompt in the bottom input box
4. **Press Enter**: Watch models generate responses in real-time
5. **Vote**: Press A, B, C etc. to vote for the best response
6. **Repeat**: Press N for next prompt, R to regenerate

## Keyboard Shortcuts

- **A/B/C/D/E/F**: Vote for corresponding model
- **T**: Tie
- **N**: Next prompt from library
- **R**: Regenerate all responses
- **B**: Toggle blind mode (hide/show model names)
- **Q / Esc**: Quit

## Data Storage

Elo ratings and session history are stored in:
- `~/.llmarena/sessions.json`
- `~/.llmarena/votes.json`
- `~/.llmarena/elo.json`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Local LLM Arena TUI                      │
├──────────────┬────────────────────────────────────────────┤
│   Models     │              Response Panels                │
│   Sidebar    │  ┌──────────────────────────────────────┐  │
│              │  │ [A] Model A                          │  │
│  [x] llama3  │  │ Response from model A...             │  │
│  [ ] qwen2.5 │  └──────────────────────────────────────┘  │
│  [x] mistral │  ┌──────────────────────────────────────┐  │
│  [ ] gemma2  │  │ [B] Model B                          │  │
│              │  │ Response from model B...             │  │
│              │  └──────────────────────────────────────┘  │
├──────────────┴────────────────────────────────────────────┤
│  [Type your prompt here...]                                │
├────────────────────────────────────────────────────────────┤
│  [A/B/C] Vote | [N] Next | [R] Regen | [B] Blind | [Q]   │
└────────────────────────────────────────────────────────────┘
```

## License

MIT
