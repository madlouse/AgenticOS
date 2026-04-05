# Formula for private Homebrew tap.
#
# Tap setup (run once per machine):
#   brew tap madlouse/360teams https://github.com/madlouse/homebrew-360teams
#
# Install:
#   brew install madlouse/360teams/teams-opencli
#
# Upgrade:
#   brew reinstall teams-opencli   # reinstall re-runs post_install (symlink + skill)
#
# Uninstall:
#   brew uninstall teams-opencli

class TeamsOpencli < Formula
  desc "360Teams CLI adapter for opencli / Claude Code"
  homepage "https://github.com/madlouse/teams-opencli"
  # Update url + sha256 on each release:
  #   url "https://github.com/madlouse/teams-opencli/archive/refs/tags/v1.0.0.tar.gz"
  #   sha256 "REPLACE_WITH_SHA256_OF_RELEASE_TARBALL"
  url "https://github.com/madlouse/teams-opencli/archive/refs/tags/v1.0.0.tar.gz"
  sha256 "0019dfc4b32d63c1392aa264aed2253c1e0c2fb09216f8e2cc269bbfb8bb49b5"
  license "MIT"
  version "1.0.0"

  depends_on "node"

  def install
    # Install runtime npm dependencies inside the adapter directory only
    Dir.chdir("clis/360teams") do
      system "npm", "install", "--production", "--no-audit", "--no-fund"
    end

    # Stage everything under libexec (keeps Cellar clean)
    libexec.install "clis", "skills"
  end

  def post_install
    # Symlink adapter into ~/.opencli/clis/360teams
    opencli_clis = Pathname.new(Dir.home) / ".opencli/clis"
    opencli_clis.mkpath

    adapter_link = opencli_clis / "360teams"
    adapter_link.unlink if adapter_link.exist? || adapter_link.symlink?
    adapter_link.make_symlink(libexec / "clis/360teams")

    # Install SKILL.md into ~/.claude/skills/360teams/
    skill_dir = Pathname.new(Dir.home) / ".claude/skills/360teams"
    skill_dir.mkpath
    (skill_dir / "SKILL.md").write (libexec / "skills/SKILL.md").read
  end

  def caveats
    <<~EOS
      360Teams CLI adapter installed:
        Adapter: ~/.opencli/clis/360teams → #{libexec}/clis/360teams
        Skill:   ~/.claude/skills/360teams/SKILL.md

      360Teams will auto-launch in debug mode when you use the skill.
      If already running without debug mode, it will be restarted automatically.

      To upgrade and refresh the symlink + skill:
        brew reinstall teams-opencli
    EOS
  end

  test do
    # Smoke test: verify the helper module loads cleanly
    system "node", "--input-type=module",
           "--eval", "import '#{libexec}/clis/360teams/helpers.js'; console.log('ok')"
  end
end
