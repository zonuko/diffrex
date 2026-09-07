# Homebrew Formula for Diffrex
# To install locally:
#   brew install --build-from-source ./packaging/homebrew/diffrex.rb
# Or via custom tap:
#   brew tap zonuko/diffrex https://github.com/zonuko/diffrex
#   brew install diffrex

class Diffrex < Formula
  desc "AI-friendly diff and merge tool built with Deno Desktop"
  homepage "https://github.com/zonuko/diffrex"
  version "0.1.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/zonuko/diffrex/releases/download/v#{version}/diffrex-macos-aarch64.tar.gz"
      # sha256 "REPLACE_WITH_MACOS_AARCH64_SHA256"
    else
      url "https://github.com/zonuko/diffrex/releases/download/v#{version}/diffrex-macos-x86_64.tar.gz"
      # sha256 "REPLACE_WITH_MACOS_X86_64_SHA256"
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/zonuko/diffrex/releases/download/v#{version}/diffrex-linux-x86_64.tar.gz"
      # sha256 "REPLACE_WITH_LINUX_X86_64_SHA256"
    end
  end

  def install
    bin.install "diffrex"
  end

  test do
    assert_match "Diffrex", shell_output("#{bin}/diffrex --version")
  end
end
