class Agenticos < Formula
  desc "AI-native project management MCP server for Claude Code, Cursor, and Codex"
  homepage "https://github.com/madlouse/AgenticOS"
  url "https://github.com/madlouse/AgenticOS/releases/download/v0.2.0/agenticos-mcp.tgz"
  # Update sha256 after the v0.2.0 release is published:
  #   curl -sL https://github.com/madlouse/AgenticOS/releases/download/v0.2.0/agenticos-mcp.tgz | sha256sum
  sha256 "PLACEHOLDER_UPDATE_AFTER_RELEASE"
  license "MIT"
  version "0.2.0"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]

    # Create default workspace directory
    (var/"agenticos/.agent-workspace").mkpath
  end

  def post_install
    # Print setup instructions
    ohai "AgenticOS installed!"
    ohai "Workspace: #{var}/agenticos"
    ohai ""
    ohai "Add to your shell profile (~/.zshrc or ~/.bashrc):"
    ohai "  export AGENTICOS_HOME=#{var}/agenticos"
    ohai ""
    ohai "Then add to your AI tool's MCP config:"
    ohai '  { "command": "agenticos-mcp", "args": [] }'
  end

  def caveats
    <<~EOS
      AgenticOS MCP server has been installed.

      1. Set your workspace location (add to ~/.zshrc or ~/.bashrc):
           export AGENTICOS_HOME="#{var}/agenticos"
         Or use the default: ~/AgenticOS

      2. Add to your Claude Code MCP config (~/.claude/settings/mcp.json):
           {
             "mcpServers": {
               "agenticos": {
                 "command": "agenticos-mcp",
                 "args": []
               }
             }
           }

      3. Restart your AI tool to activate.
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/agenticos-mcp --version")
  end
end
