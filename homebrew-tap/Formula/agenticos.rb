require "language/node"

class Agenticos < Formula
  desc "AI-native project management MCP server for coding agents"
  homepage "https://github.com/madlouse/AgenticOS"
  url "https://github.com/madlouse/AgenticOS/releases/download/v0.4.41/agenticos-mcp.tgz"
  version "0.4.41"
  sha256 "abefc135a512fce1e43f5db865288393e4045f6a0748129f2c4fd858ce9db985"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def post_install
    (var/"agenticos").mkpath
    ohai "AgenticOS installed!"
    ohai "Workspace directory created at: #{var}/agenticos"
    ohai ""
    ohai "Add the following to your shell profile (~/.zshrc or ~/.bashrc):"
    ohai "  export AGENTICOS_HOME=\"#{var}/agenticos\""
    ohai ""
    ohai "Then run: agenticos-bootstrap --workspace \"#{var}/agenticos\" --first-run --auto-configure-hooks"
    ohai "First-run mode installs AgenticOS activation Skills for Codex, Claude Code, Cursor, Gemini CLI, and Hermes Agent when selected."
    ohai "On macOS, first-run mode also enables launchctl persistence for GUI/session inheritance."
    ohai "To audit the current Homebrew/runtime bootstrap state without changes, use: agenticos-config --validate"
    ohai "Then run: agenticos-bootstrap --workspace \"#{var}/agenticos\" --all --install-skills --auto-configure-hooks --verify"
    ohai "Or bootstrap your agent manually (see caveats below) and restart the tool."
  end

  def caveats
    <<~EOS
      AgenticOS has been installed.

      Homebrew installs the binary only. It does not create or select a workspace, edit AI tool
      configs, restart the tool, or prove activation automatically.

      1. Set AGENTICOS_HOME to the workspace created by Homebrew (add to ~/.zshrc or ~/.bashrc):
           export AGENTICOS_HOME="#{var}/agenticos"

         The workspace directory has already been created at #{var}/agenticos.
         Keep it separate from any source checkout — binary and workspace are independent.

      2. Bootstrap one officially supported agent:

         Recommended helper
           agenticos-bootstrap --workspace "$AGENTICOS_HOME" --first-run --auto-configure-hooks

           First-run mode registers MCP, persists AGENTICOS_HOME where applicable,
           and installs the AgenticOS activation Skill for Codex, Claude Code, Cursor, Gemini CLI, and Hermes Agent when
           those agents are selected. The Skill helps natural-language requests
           such as "switch to 360Teams" or "切换到 360Teams 项目" discover and
           call AgenticOS MCP before filesystem guessing.

         macOS GUI/session helper
           agenticos-bootstrap --workspace "$AGENTICOS_HOME" --persist-shell-env --persist-launchctl-env --apply

         Claude Code PWD guidance hook
           agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent claude-code --auto-configure-hooks --apply

           The hook reads Claude Code PostToolUse stdin and feeds the switched
           project path back into Claude. It cannot mutate a parent shell PWD.

         Activation Skill install/update
           agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent codex --install-skills --apply
           agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent claude-code --install-skills --apply
           agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent cursor --install-skills --apply
           agenticos-bootstrap --workspace "$AGENTICOS_HOME" --agent gemini-cli --install-skills --apply

           AgenticOS-managed Skill files are updated by content hash. User-modified
           files are not overwritten unless you rerun with --force-skills.

         Claude Code
           claude mcp add agenticos -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" -- agenticos-mcp

         Codex
           codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp

         Cursor (~/.cursor/mcp.json)
           {
             "mcpServers": {
               "agenticos": {
                 "command": "agenticos-mcp",
                 "args": [],
                 "env": {
                   "AGENTICOS_HOME": "/absolute/path/to/your/AgenticOS-workspace"
                 }
                }
              }
            }

         Gemini CLI
           gemini mcp add -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos agenticos-mcp

      3. Restart the AI tool.

      4. Verify the Homebrew/runtime bootstrap state:
           agenticos-config --validate
           agenticos-bootstrap --workspace "$AGENTICOS_HOME" --all --install-skills --auto-configure-hooks --verify

         Then confirm the server is listed in the tool's MCP diagnostics and explicitly call
         agenticos_list.

      5. If Claude Code or Codex still points at a source checkout path, remove the stale entry
         and re-add the canonical binary entrypoint:

         Claude Code
           claude mcp get agenticos
           claude mcp remove agenticos -s user
           claude mcp add agenticos -s user -e AGENTICOS_HOME="$AGENTICOS_HOME" -- agenticos-mcp

         Codex
           codex mcp list
           codex mcp get agenticos
           codex mcp remove agenticos
           codex mcp add --env AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp

      6. Product policy: Homebrew is reminder-only today.
         It does not mutate user agent configs by default.
         A future opt-in bootstrap helper may be added later, but silent config mutation is out of scope.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/agenticos-mcp --version")
  end
end
