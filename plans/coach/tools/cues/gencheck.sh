cd /home/dgx-delgado/yames-coach-cues2 || exit 2
P="${1:-blues-pentatonics}"
npm run paths -- gen "$P" || exit 1
npm run paths -- strings "$P" || exit 1
npm run paths -- check "$P"
