class Agenticos < Formula
  desc "AI-native project management MCP server for Claude Code, Codex, Cursor, and Gemini CLI"
  homepage "https://github.com/madlouse/AgenticOS"
  url "https://github.com/madlouse/AgenticOS/releases/download/v0.2.1/agenticos-mcp.tgz"
  sha256 "f87d5e1a14442ac327f474a133cfafca32e6dd418cc48ab26e4f71fee72d501e"
  license "MIT"
  version "0.2.1"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def post_install
    ohai "AgenticOS installed!"
    ohai "Installed:"
    ohai "  - agenticos-mcp"
    ohai ""
    ohai "Homebrew does not edit Claude Code, Codex, Cursor, or Gemini CLI configs for you."
    ohai "Set AGENTICOS_HOME explicitly, choose a supported agent bootstrap path, restart the tool, then verify with agenticos_list."
    ohai ""
    ohai "Example workspace setup:"
    ohai "  mkdir -p #{var}/agenticos"
    ohai "  export AGENTICOS_HOME=#{var}/agenticos"
  end

  def caveats
    <<~EOS
      AgenticOS has been installed.

      Homebrew installs the binary only. It does not create or select a workspace, edit AI tool
      configs, restart the tool, or prove activation automatically.

      1. Set your workspace location before starting agenticos-mcp (add to ~/.zshrc or ~/.bashrc).
         Example:
           mkdir -p "#{var}/agenticos"
           export AGENTICOS_HOME="#{var}/agenticos"

      2. Bootstrap one officially supported agent:

         Claude Code
           claude mcp add --transport stdio --scope user agenticos -- agenticos-mcp

         Codex
           codex mcp add agenticos -- agenticos-mcp

         Cursor (~/.cursor/mcp.json)
           {
             "mcpServers": {
               "agenticos": {
                 "command": "agenticos-mcp",
                 "args": []
               }
             }
           }

         Gemini CLI
           gemini mcp add -s user agenticos agenticos-mcp

      3. Restart the AI tool.

      4. Verify activation by confirming the server is listed in the tool's MCP diagnostics
         and by explicitly calling agenticos_list.

      5. If Claude Code or Codex still points at a source checkout path, remove the stale entry
         and re-add the canonical binary entrypoint:

         Claude Code
           claude mcp get agenticos
           claude mcp remove agenticos -s user
           claude mcp add --transport stdio --scope user agenticos -- agenticos-mcp

         Codex
           codex mcp list
           codex mcp get agenticos
           codex mcp remove agenticos
           codex mcp add agenticos -- agenticos-mcp

      6. Product policy: Homebrew is reminder-only today.
         It does not mutate user agent configs by default.
         A future opt-in bootstrap helper may be added later, but silent config mutation is out of scope.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/agenticos-mcp --version")
  end
end
