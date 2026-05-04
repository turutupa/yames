cask "yames" do
  version "0.5.0"

  on_arm do
    url "https://github.com/turutupa/yames/releases/download/v#{version}/Yames_#{version}_aarch64.dmg"
    sha256 "f74820625933d504663ce5888a3f4d2a9a42687cdfecd3f08d2f2024731a3440"
  end

  on_intel do
    url "https://github.com/turutupa/yames/releases/download/v#{version}/Yames_#{version}_x64.dmg"
    sha256 "8fb55e133c0acd9b68b9d617ecf3ab7155df3dee2dcc0587c8da5ccb0e8a65d0"
  end

  name "Yames"
  desc "Yet Another Metronome Everyone Skips — musician-grade floating metronome"
  homepage "https://turutupa.github.io/yames/"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "Yames.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/Yames.app"]
  end

  zap trash: [
    "~/Library/Application Support/com.yames.metronome",
    "~/Library/Caches/com.yames.metronome",
    "~/Library/Preferences/com.yames.metronome.plist",
  ]
end
