# Starlen Coding Assistant

Use `Starlen: Set API Token` once, then run `Starlen: Ask Coding Assistant` from the Command Palette.

The assistant receives the active editor and selection as context. To propose a local command, it returns a `starlen-command` block. Commands require confirmation by default. Set `starlen.commandExecutionMode` to `allow` only in a trusted workspace when you explicitly want agent commands to run without prompts.

Commands execute in the first workspace folder and their output is recorded in the **Starlen Coding Assistant** output channel.
