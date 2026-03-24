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

    # Create default workspace directory
    (var/"agenticos/.agent-workspace").mkpath
  end

  def post_install
    ohai "AgenticOS installed!"
    ohai "Installed:"
    ohai "  - agenticos-mcp"
    ohai "  - workspace seed at #{var}/agenticos/.agent-workspace"
    ohai ""
    ohai "Homebrew does not edit Claude Code, Codex, Cursor, or Gemini CLI configs for you."
    ohai "Choose a supported agent bootstrap path, restart the tool, then verify with agenticos_list."
    ohai ""
    ohai "Recommended workspace override:"
    ohai "  export AGENTICOS_HOME=#{var}/agenticos"
  end

  def caveats
    <<~EOS
      AgenticOS has been installed.

      Homebrew installs the binary and a seed workspace. It does not edit AI tool configs,
      restart the tool, or prove activation automatically.

      1. Set your workspace location (add to ~/.zshrc or ~/.bashrc) if you want to use the
         Homebrew-managed workspace seed:
           export AGENTICOS_HOME="#{var}/agenticos"
         Otherwise leave AGENTICOS_HOME unset and use the product default: ~/AgenticOS

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

      5. Product policy: Homebrew is reminder-only today.
         It does not mutate user agent configs by default.
         A future opt-in bootstrap helper may be added later, but silent config mutation is out of scope.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/agenticos-mcp --version")
  end
end
