#!/usr/bin/env python3
"""
Extract a human-readable Markdown transcript from a Claude Code JSONL session file.

Focuses on user prompts as the primary content, with brief summaries of what
Claude did in response. Strips out system prompts, tool call JSON, file contents,
and metadata.

Usage:
    python3 scripts/extract_session.py <input.jsonl> <output.md>
"""

import json
import sys
import re
from pathlib import Path


def sanitize(text: str) -> str:
    """Remove local paths and other potentially sensitive content."""
    # Remove homedir paths
    text = re.sub(r"/Users/[a-zA-Z0-9_-]+", "/Users/***", text)
    # Remove lines referencing internal session transcript files
    text = re.sub(
        r"\n*If you need specific details.*?\.jsonl\n*", "\n", text, flags=re.DOTALL
    )
    return text.strip()


def extract_user_text(message: dict) -> str | None:
    """Extract plain text from a user message, ignoring tool results and system messages."""
    content = message.get("content", "")
    if isinstance(content, str):
        text = content.strip()
        return text if text else None
    if isinstance(content, list):
        texts = []
        for block in content:
            if block.get("type") == "text":
                t = block.get("text", "").strip()
                # Skip tool result markers and system messages
                if t and not t.startswith("[Request interrupted"):
                    texts.append(t)
        combined = "\n".join(texts).strip()
        return combined if combined else None
    return None


def extract_assistant_info(message: dict) -> tuple[str | None, list[str]]:
    """Extract text and tool names from an assistant message."""
    content = message.get("content", [])
    texts = []
    tools = []
    if isinstance(content, str):
        if content.strip():
            texts.append(content.strip())
    elif isinstance(content, list):
        for block in content:
            if block.get("type") == "text" and block.get("text", "").strip():
                texts.append(block["text"].strip())
            elif block.get("type") == "tool_use":
                tools.append(block.get("name", "unknown"))
    text = "\n".join(texts).strip() if texts else None
    return text, tools


def summarize_tools(tools: list[str]) -> str:
    """Create a brief human-readable summary of tool usage."""
    tool_actions = {
        "Read": "read files",
        "Write": "wrote files",
        "Edit": "edited files",
        "Bash": "ran commands",
        "Glob": "searched for files",
        "Grep": "searched code",
        "Agent": "delegated to a sub-agent for research",
    }
    actions = []
    seen = set()
    for tool in tools:
        action = tool_actions.get(tool, f"used {tool}")
        if action not in seen:
            actions.append(action)
            seen.add(action)
    return ", ".join(actions)


def format_assistant_block(text: str | None, tools: list[str]) -> list[str]:
    """Format an assistant response as a concise summary block."""
    lines = []

    if text:
        # Split into paragraphs and format each as a bullet point or italic line
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        for para in paragraphs:
            # Keep substantive text, italicize it
            if para.startswith("**") or para.startswith("1.") or para.startswith("- "):
                # Structured content (lists, bold items) — keep as-is inside a blockquote-style block
                lines.append(para)
            else:
                lines.append(f"*{para}*")
        lines.append("")
    elif tools:
        summary = summarize_tools(tools)
        lines.append(f"*Claude {summary}.*")
        lines.append("")

    return lines


def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.jsonl> <output.md>")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    entries = []
    with open(input_path) as f:
        for line in f:
            entries.append(json.loads(line))

    # Collect the conversation flow
    conversation = []  # list of (role, data) tuples

    for entry in entries:
        entry_type = entry.get("type")
        if entry_type == "user":
            msg = entry.get("message", {})
            text = extract_user_text(msg)
            if text:
                conversation.append(("user", text))
        elif entry_type == "assistant":
            msg = entry.get("message", {})
            text, tools = extract_assistant_info(msg)
            if text or tools:
                conversation.append(("assistant", {"text": text, "tools": tools}))

    # Merge consecutive assistant messages, keeping only the last substantive
    # text (the summary) and all tools used
    merged = []
    for role, data in conversation:
        if role == "assistant":
            if merged and merged[-1][0] == "assistant":
                prev = merged[-1][1]
                # For text: keep both but we'll pick the best one later
                if data["text"]:
                    prev["all_texts"].append(data["text"])
                prev["tools"].extend(data["tools"])
                continue
            else:
                data["all_texts"] = [data["text"]] if data["text"] else []
        merged.append((role, data))

    # Build markdown
    lines = [
        "# Escape Room Booking API — Claude Code Session Transcript",
        "",
        "This transcript shows the prompts I gave to Claude Code and a summary",
        "of what it did in response. The full code changes are visible in the",
        "GitHub pull requests.",
        "",
        "---",
        "",
    ]

    prompt_num = 0
    for role, data in merged:
        if role == "user":
            prompt_num += 1
            sanitized = sanitize(data)
            lines.append(f"## Prompt {prompt_num}")
            lines.append("")
            # Format as blockquote
            if len(sanitized) < 200 and "\n" not in sanitized:
                lines.append(f"> {sanitized}")
            else:
                for text_line in sanitized.split("\n"):
                    lines.append(f"> {text_line}")
            lines.append("")
        elif role == "assistant":
            all_texts = data.get("all_texts", [])
            tools = data["tools"]

            # Find the best summary text — prefer the longest substantive one
            # (usually the final summary after all work is done)
            best_text = None
            for t in all_texts:
                if t and (best_text is None or len(t) > len(best_text)):
                    best_text = t

            if best_text:
                sanitized = sanitize(best_text)
                lines.extend(format_assistant_block(sanitized, tools))
            elif tools:
                summary = summarize_tools(tools)
                lines.append(f"*Claude {summary}.*")
                lines.append("")

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write("\n".join(lines))

    print(f"Transcript written to {output_path}")
    print(f"  {prompt_num} user prompts extracted")
    print(f"  {len(merged)} total conversation turns")


if __name__ == "__main__":
    main()
