import * as fs from "fs";
import * as path from "path";
import * as os from "os";
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
  fighter1: { title: string; terminal_id: string; cwd?: string };
  fighter2: { title: string; terminal_id: string; cwd?: string };
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

## IMPORTANT: Fighter Constraints
When writing each next_prompt, you must frame the prompt so the fighter naturally follows these constraints. Do NOT paste these rules verbatim — instead, word your prompt in a way that enforces them:

1. **Stay in your lane** — Never ask a fighter to look at, read, or search the other fighter's codebase. If Fighter 1 needs to understand what Fighter 2 is doing, tell Fighter 1 to describe what they need and ask the other fighter to explain it. Example prompt wording: "Explain how your side handles X. If you need to know how the other side does Y, describe what you need from them and they'll respond in the next round."

2. **No code changes** — Fighters must NOT edit, write, or modify any code files. This is a debate — they analyze and propose. The user will review and apply fixes. Word your prompts like: "Analyze the issue and propose a fix, but do not make any code changes."

3. **No broad research** — Fighters should not go on sprawling codebase searches. They should work from what they know. If they need specific context, they should ask the user. Word your prompts like: "Focus on the specific issue. If you need more context about a specific file or config, ask the user to point you to it."

4. **Structured responses** — Ask fighters to write their response as: Problem / Their Argument / Proposed Solution.

These constraints must be woven into the natural language of every next_prompt you write. The fighter should feel like they're getting clear, scoped instructions — not a wall of rules.

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

    // Set up Claude Code permissions for fight folder access
    this.setupFightPermissions(fightPath, opts);

    this.activeFight = state;
    this.lastKnownFiles = new Set(["CLAUDE.md", "00_context.md", "state.json", ".claude"]);
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

  /** Write text into a terminal and press Enter after a short delay */
  private sendPrompt(terminalId: string, text: string): void {
    const clean = text.replace(/[\r\n]+/g, " ").trim();
    this.writeToTerminal(terminalId, clean);
    setTimeout(() => {
      this.writeToTerminal(terminalId, "\r");
    }, 500);
  }

  sendToMomma(message: string): void {
    if (!this.activeFight?.momma_terminal_id) return;
    this.sendPrompt(this.activeFight.momma_terminal_id, message);
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
      this.sendPrompt(this.activeFight.momma_terminal_id, msg);
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

  /** Add fight folder permissions to user's global ~/.claude/settings.json */
  private setupFightPermissions(fightPath: string, _opts: FightCreateOpts): void {
    // Momma gets full permissions in her fight folder
    const mommaClaudeDir = path.join(fightPath, ".claude");
    fs.mkdirSync(mommaClaudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(mommaClaudeDir, "settings.json"),
      JSON.stringify({
        permissions: {
          allow: [
            "Read",
            "Edit",
            "Write",
            "Bash"
          ]
        }
      }, null, 2)
    );

    // Add fights folder permissions to global Claude settings
    // Use wildcard pattern like hivemind*fights to handle both dev and prod paths
    const globalSettingsPath = path.join(os.homedir(), ".claude", "settings.json");
    const userDataBase = app.getPath("appData").replace(/\\/g, "/");
    const fightsPattern = `${userDataBase}/hivemind*fights`;
    const fightPermissions = [
      `Read(file_path=${fightsPattern}/*)`,
      `Write(file_path=${fightsPattern}/*)`,
      `Edit(file_path=${fightsPattern}/*)`,
      `Read(file_path=${fightsPattern}/**)`,
      `Write(file_path=${fightsPattern}/**)`,
      `Edit(file_path=${fightsPattern}/**)`,
    ];

    try {
      let settings: { permissions?: { allow?: string[] } } = {};

      if (fs.existsSync(globalSettingsPath)) {
        settings = JSON.parse(fs.readFileSync(globalSettingsPath, "utf-8"));
      }

      if (!settings.permissions) settings.permissions = {};
      if (!settings.permissions.allow) settings.permissions.allow = [];

      // Add fight permissions if not already present
      let changed = false;
      for (const perm of fightPermissions) {
        if (!settings.permissions.allow.includes(perm)) {
          settings.permissions.allow.push(perm);
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(globalSettingsPath, JSON.stringify(settings, null, 2));
      }
    } catch {
      // If we can't write global settings, fighters will get prompted
    }
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
          this.sendPrompt(this.activeFight.momma_terminal_id, `New fighter response: ${f} — Read it and update state.json with your next decision.`);
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

        this.sendPrompt(targetId, state.next_prompt);
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
