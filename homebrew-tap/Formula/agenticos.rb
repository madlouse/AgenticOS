require "language/node"

class Agenticos < Formula
  desc "AI-native project management MCP server for coding agents"
  homepage "https://github.com/madlouse/AgenticOS"
  url "https://github.com/madlouse/AgenticOS/releases/download/v0.4.2/agenticos-mcp.tgz"
  version "0.4.2"
  sha256 "9ccc0051cbf11ec4731d57c3765cb548e092a344520bc733e89d149a7ad27cc8"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def post_install
    # Provision a clean workspace directory separate from any source checkout
    (var/"agenticos").mkpath
    ohai "AgenticOS installed!"
    ohai "Workspace directory created at: #{var}/agenticos"
    ohai ""
    ohai "Add the following to your shell profile (~/.zshrc or ~/.bashrc):"
    ohai "  export AGENTICOS_HOME=\"#{var}/agenticos\""
    ohai ""
    ohai "Then run: agenticos-bootstrap --workspace \"#{var}/agenticos\" --first-run"
    ohai "On macOS, first-run mode also enables launchctl persistence for GUI/session inheritance."
    ohai "To audit the current bootstrap state without changes, use: agenticos-bootstrap --verify"
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
           agenticos-bootstrap --workspace "#{var}/agenticos" --first-run

         macOS GUI/session helper
           agenticos-bootstrap --workspace "#{var}/agenticos" --persist-shell-env --persist-launchctl-env --apply

         Claude Code
           claude mcp add --transport stdio --scope user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp

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

      4. Verify activation by confirming the server is listed in the tool's MCP diagnostics
         and by explicitly calling agenticos_list.

      5. If Claude Code or Codex still points at a source checkout path, remove the stale entry
         and re-add the canonical binary entrypoint:

         Claude Code
           claude mcp get agenticos
           claude mcp remove agenticos -s user
           claude mcp add --transport stdio --scope user -e AGENTICOS_HOME="$AGENTICOS_HOME" agenticos -- agenticos-mcp

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
