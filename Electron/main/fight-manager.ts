import * as fs from "fs";
import * as path from "path";
import { app, BrowserWindow } from "electron";

// ── Types ────────────────────────────────────────────────

export interface FightState {
  status: "active" | "paused" | "resolved";
  fight_name: string;
  fight_id: string;
  fight_path: string;
  started: string;
  round: number;
  turn: "fighter1" | "fighter2" | "momma";
  fighters: {
    fighter1: { title: string; terminal_id: string };
    fighter2: { title: string; terminal_id: string };
  };
  momma_terminal_id: string;
  last_file: string;
  summary: string;
  next_prompt: string;
  prompt_seq: number;
}

export interface FightCreateOpts {
  name: string;
  description: string;
  fighter1: { title: string; terminal_id: string };
  fighter2: { title: string; terminal_id: string };
}

// ── Momma's CLAUDE.md Template ───────────────────────────

function getMommaClaudeMd(fightPath: string, state: FightState): string {
  return `# Claude Momma — Fight Referee

You are **Claude Momma**, the referee of a Claude Fight Club bout. Two Claude instances are in a structured dispute and you orchestrate the argument, keep it productive, and drive toward resolution.

## Fight Info
- **Fight:** ${state.fight_name}
- **Fighter 1:** "${state.fighters.fighter1.title}"
- **Fighter 2:** "${state.fighters.fighter2.title}"
- **Arena (this folder):** ${fightPath}

## How It Works

All communication happens through files in this folder:
- \`00_context.md\` — What started the fight
- \`01_fighter1.md\`, \`02_fighter2.md\`, \`03_fighter1.md\`, ... — Fighter responses (numbered sequentially)
- \`state.json\` — The fight state YOU control
- \`resolution.md\` — Written by you when the fight ends

The Hivemind app watches \`state.json\`. When you update it, the app relays your prompt to the correct fighter's terminal. When a fighter writes their response file, the app tells you about it.

## Your Job Each Turn

1. Read the new fighter response file
2. Analyze their argument
3. Update \`state.json\` with your decision

## state.json Protocol

When updating state.json, set these fields:
- \`turn\`: \`"fighter1"\` or \`"fighter2"\` — who goes next
- \`round\`: increment when both fighters have gone once
- \`last_file\`: the file you just processed
- \`summary\`: brief fight summary (2-3 sentences, shown in UI)
- \`next_prompt\`: the EXACT text sent to the next fighter's terminal — this is critical
- \`prompt_seq\`: increment by 1 every time you update (the app uses this to detect changes)
- \`status\`: keep as \`"active"\`, set to \`"resolved"\` when done

## Writing next_prompt

The next_prompt is typed directly into the fighter's Claude Code terminal. It must be self-contained. Include:
1. Brief context of what the other fighter argued
2. The full path to read for their full argument: \`${fightPath}/XX_fighterN.md\`
3. The full path to write their response to: \`${fightPath}/XX_fighterN.md\`
4. Instruction to write a focused, structured response (Problem / Argument / Proposed Solution)

Example next_prompt:
\`\`\`
Fighter 2 argues that the CORS config is correct and the real issue is your token refresh logic — specifically that you're not handling 401s before the token expires. Read their full argument at ${fightPath}/02_fighter2.md then write your rebuttal to ${fightPath}/03_fighter1.md. Structure your response as: Problem / Your Argument / Proposed Solution. Be specific with code references.
\`\`\`

## Rules
- Be fair and impartial — judge arguments on technical merit
- Keep fighters focused — redirect if they go in circles or get personal
- Encourage specific code references over vague claims
- After 5 rounds with no progress, declare a deadlock and write resolution.md
- If both fighters converge on the same solution, write resolution.md and set status to "resolved"

## IMPORTANT: Keep Fighters Focused
Fighters must NOT go on broad codebase research sprees, mass file reads, or sprawling searches. In every next_prompt you write, include this rule:

**"Do NOT research the entire codebase or run broad searches. Keep your response focused on the specific issue. If you need more context about a specific file, function, or config — ASK THE USER to point you to it. Write a focused argument based on what you already know. If you're unsure about something, say so and ask the user for guidance rather than exploring on your own."**

This is critical. Without this constraint, fighters will burn tokens and time exploring code that isn't relevant to the dispute.

## Resolution
When writing resolution.md, include:
- Summary of each fighter's position
- The agreed or decided solution
- Action items for each side
- Set \`state.json\` status to \`"resolved"\`

## Getting Started
When you receive your first message, read \`00_context.md\` and \`state.json\`. Then update \`state.json\` with the opening prompt for Fighter 1. Set \`turn\` to \`"fighter1"\`, write a clear \`next_prompt\`, and set \`prompt_seq\` to 1.
`;
}

// ── Fight Manager ────────────────────────────────────────

export class FightManager {
  private fightsDir: string;
  private activeFight: FightState | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastPromptSeq = 0;
  private lastRelayedPrompt = "";
  private lastKnownFiles = new Set<string>();
  private writeToTerminal: (id: string, data: string) => void;

  constructor(writeToTerminal: (id: string, data: string) => void) {
    this.fightsDir = path.join(app.getPath("userData"), "fights");
    if (!fs.existsSync(this.fightsDir)) {
      fs.mkdirSync(this.fightsDir, { recursive: true });
    }
    this.writeToTerminal = writeToTerminal;
  }

  getFightsDir(): string {
    return this.fightsDir;
  }

  getActiveFight(): FightState | null {
    return this.activeFight;
  }

  createFight(opts: FightCreateOpts): { fightPath: string; state: FightState } {
    const timestamp = new Date().toISOString().split("T")[0];
    const slug = opts.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const fightId = `${slug}-${timestamp}-${Date.now().toString(36)}`;
    const fightPath = path.join(this.fightsDir, fightId);
    fs.mkdirSync(fightPath, { recursive: true });

    const state: FightState = {
      status: "active",
      fight_name: opts.name,
      fight_id: fightId,
      fight_path: fightPath,
      started: new Date().toISOString(),
      round: 1,
      turn: "momma",
      fighters: {
        fighter1: opts.fighter1,
        fighter2: opts.fighter2,
      },
      momma_terminal_id: "",
      last_file: "00_context.md",
      summary: opts.description,
      next_prompt: "",
      prompt_seq: 0,
    };

    // Write CLAUDE.md
    fs.writeFileSync(
      path.join(fightPath, "CLAUDE.md"),
      getMommaClaudeMd(fightPath.replace(/\\/g, "/"), state)
    );

    // Write context
    const context = `# Fight Context

**${opts.name}**
Started: ${new Date().toLocaleString()}

## The Beef
${opts.description}

## Fighter 1 — "${opts.fighter1.title}"
Terminal ID: ${opts.fighter1.terminal_id}

## Fighter 2 — "${opts.fighter2.title}"
Terminal ID: ${opts.fighter2.terminal_id}

## Arena
All fight files live in: \`${fightPath.replace(/\\/g, "/")}\`

Fighter response files follow the pattern:
- \`01_fighter1.md\` — Fighter 1's opening
- \`02_fighter2.md\` — Fighter 2's rebuttal
- \`03_fighter1.md\` — Fighter 1's counter
- etc.
`;
    fs.writeFileSync(path.join(fightPath, "00_context.md"), context);

    // Write state.json
    fs.writeFileSync(path.join(fightPath, "state.json"), JSON.stringify(state, null, 2));

    this.activeFight = state;
    this.lastKnownFiles = new Set(["CLAUDE.md", "00_context.md", "state.json"]);
    this.lastPromptSeq = 0;

    return { fightPath, state };
  }

  setMommaTerminalId(terminalId: string): void {
    if (!this.activeFight) return;
    this.activeFight.momma_terminal_id = terminalId;

    // Update state.json on disk
    const statePath = path.join(this.activeFight.fight_path, "state.json");
    try {
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      state.momma_terminal_id = terminalId;
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    } catch {
      // ignore
    }
  }

  startPolling(): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => this.poll(), 3000);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  sendToMomma(message: string): void {
    if (!this.activeFight?.momma_terminal_id) return;
    this.writeToTerminal(this.activeFight.momma_terminal_id, message + "\r");
  }

  pauseFight(): void {
    if (!this.activeFight) return;
    this.activeFight.status = "paused";
    this.updateStateOnDisk();
    this.stopPolling();
    this.broadcastState();
  }

  resumeFight(): void {
    if (!this.activeFight) return;
    this.activeFight.status = "active";
    this.updateStateOnDisk();
    this.startPolling();
    this.broadcastState();
  }

  resolveFight(resolution?: string): void {
    if (!this.activeFight) return;
    this.activeFight.status = "resolved";
    this.updateStateOnDisk();
    this.stopPolling();

    if (resolution) {
      const resPath = path.join(this.activeFight.fight_path, "resolution.md");
      fs.writeFileSync(resPath, `# Resolution\n\n${resolution}\n`);
    }

    // Tell Momma to wrap up
    if (this.activeFight.momma_terminal_id) {
      const msg = resolution
        ? `The user has ended the fight. Resolution: ${resolution}. Write a final resolution.md if you haven't already, then set state.json status to "resolved".`
        : `The user has ended the fight. Write a final resolution.md summarizing the outcome, then set state.json status to "resolved".`;
      this.writeToTerminal(this.activeFight.momma_terminal_id, msg + "\r");
    }

    this.broadcastState();
  }

  endFight(): void {
    this.stopPolling();
    this.activeFight = null;
    this.lastKnownFiles.clear();
    this.lastPromptSeq = 0;
    this.lastRelayedPrompt = "";
  }

  private poll(): void {
    if (!this.activeFight || this.activeFight.status !== "active") return;
    const fightPath = this.activeFight.fight_path;

    if (!fs.existsSync(fightPath)) return;

    // 1. Check for new fighter response files
    try {
      const files = fs.readdirSync(fightPath);
      const newMdFiles = files.filter(
        (f) =>
          f.endsWith(".md") &&
          !this.lastKnownFiles.has(f) &&
          f !== "CLAUDE.md" &&
          f !== "resolution.md" &&
          f !== "00_context.md"
      );

      for (const f of newMdFiles) {
        this.lastKnownFiles.add(f);
        // Notify Momma about new fighter response
        if (this.activeFight.momma_terminal_id) {
          this.writeToTerminal(
            this.activeFight.momma_terminal_id,
            `New fighter response: ${f} — Read it and update state.json with your next decision.\r`
          );
        }
      }

      // Also track any other new files
      for (const f of files) {
        this.lastKnownFiles.add(f);
      }
    } catch {
      // folder read failed
    }

    // 2. Read state.json for Momma's updates
    try {
      const statePath = path.join(fightPath, "state.json");
      const stateRaw = fs.readFileSync(statePath, "utf-8");
      const state = JSON.parse(stateRaw) as FightState;

      // Check if Momma updated the prompt (dedupe by seq AND content)
      if (
        state.prompt_seq > this.lastPromptSeq &&
        state.next_prompt &&
        state.next_prompt !== this.lastRelayedPrompt
      ) {
        this.lastPromptSeq = state.prompt_seq;
        this.lastRelayedPrompt = state.next_prompt;

        // Relay prompt to the appropriate fighter
        const targetId =
          state.turn === "fighter1"
            ? state.fighters.fighter1.terminal_id
            : state.fighters.fighter2.terminal_id;

        this.writeToTerminal(targetId, state.next_prompt + "\r");
      } else if (state.prompt_seq > this.lastPromptSeq) {
        // Seq changed but same prompt — just update seq tracking without relaying
        this.lastPromptSeq = state.prompt_seq;
      }

      // Update local state
      this.activeFight = { ...state, fight_path: fightPath };

      // Check for resolution
      if (state.status === "resolved") {
        this.stopPolling();
      }

      this.broadcastState();
    } catch {
      // state.json not ready or parse error — skip this cycle
    }
  }

  private updateStateOnDisk(): void {
    if (!this.activeFight) return;
    const statePath = path.join(this.activeFight.fight_path, "state.json");
    try {
      fs.writeFileSync(statePath, JSON.stringify(this.activeFight, null, 2));
    } catch {
      // ignore
    }
  }

  private broadcastState(): void {
    if (!this.activeFight) return;
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send("fight:stateUpdate", this.activeFight);
    }
  }
}
